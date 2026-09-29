(() => {
  'use strict';

  const STORAGE_KEY = 'vordik.words.v1';
  const STUDY_DAYS_KEY = 'vordik.studyDays.v1';
  const PROFILE_KEY = 'vordik.profile.v1';
  const PROFILE_STATS_KEY = 'vordik.profileStats.v1';
  const QUICK_PICK_KNOWN_KEY = 'vordik.quickPickKnown.v1';
  const QUICK_PICK_SESSION_KEY = 'vordik.quickPickSession.v1';
  const QUICK_PICK_WORD_COUNT = 15;
  const STUDY_SERIES_SIZE = 15;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const CEFR_DIFFICULTY = Object.freeze({ A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 });
  const DIFFICULTY_CEFR = Object.freeze(['A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  const difficultyByWord = new Map();
  const difficultyByWordAndTranslation = new Map();
  const wordCatalog = Array.isArray(window.VORDIK_WORD_CATALOG) ? window.VORDIK_WORD_CATALOG : [];
  wordCatalog.forEach((entry) => {
    const cefr = normalizeCefr(entry.cefr);
    if (!cefr) return;
    const english = normalizeDictionaryText(entry.word, 'en-US');
    const russian = normalizeDictionaryText(entry.translation, 'ru-RU');
    const candidate = { difficulty: CEFR_DIFFICULTY[cefr], cefr };
    const current = difficultyByWord.get(english);
    if (!current || candidate.difficulty < current.difficulty) difficultyByWord.set(english, candidate);
    difficultyByWordAndTranslation.set(difficultyKey(english, russian), candidate);
  });
  const sampleWords = [
    { id: 'sample-horizon', english: 'horizon', russian: 'горизонт' },
    { id: 'sample-curious', english: 'curious', russian: 'любопытный' },
    { id: 'sample-breathe', english: 'breathe', russian: 'дышать' },
  ];
  const wordCollections = Array.isArray(window.VORDIK_COLLECTIONS) ? window.VORDIK_COLLECTIONS : [];
  const quickPickWords = Array.isArray(window.VORDIK_QUICK_PICK_WORDS) ? window.VORDIK_QUICK_PICK_WORDS : [];
  const $ = (id) => document.getElementById(id);
  const words = loadWords();
  const studyDays = loadStudyDays();
  const userProfile = loadProfile();
  const profileStats = loadProfileStats();
  const quickPickKnown = loadQuickPickKnown();
  let quickPickSession = loadQuickPickSession();
  const session = { mechanic: 'cards', ids: [], index: 0, flipped: false, answered: false, correctCount: 0, attemptCount: 0, phase: 'feed', startedAt: 0, statsRecorded: false };
  let activeTab = 'home';
  let toastTimer;
  let activeUtterance = null;
  let sortMode = 'recent';
  let sortCloseTimer;
  let sortOpenFrame;
  let collectionCloseTimer;
  let collectionOpenFrame;
  let activeCollectionId = null;
  let deleteCloseTimer;
  let deleteOpenFrame;
  let pendingDeleteId = null;
  let wordCardCloseTimer;
  let wordCardOpenFrame;
  let activeWordCardId = null;
  let timedInterval;
  let timedAdvanceTimer;
  let timedDeadline = 0;
  let timedLocked = false;
  let quickPickAnimating = false;
  let quickPickFlipped = false;
  let quickPickSuppressClick = false;

  function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return [year, month, day].join('-');
  }

  function clampKnowledge(value) {
    return Math.min(1, Math.max(0, Number(value) || 0));
  }

  function roundKnowledge(value) {
    return Math.round(clampKnowledge(value) * 100) / 100;
  }

  function validIsoDate(value) {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
  }

  function normalizeCefr(value) {
    const level = String(value ?? '').trim().toLocaleUpperCase('en-US');
    return CEFR_DIFFICULTY[level] ? level : null;
  }

  function difficultyKey(english, russian = '') {
    return `${normalizeDictionaryText(english, 'en-US')}\u0000${normalizeDictionaryText(russian, 'ru-RU')}`;
  }

  function resolveWordDifficulty(english, russian, fallbackDifficulty = 1, fallbackCefr = null) {
    const pairMatch = difficultyByWordAndTranslation.get(difficultyKey(english, russian));
    const wordMatch = difficultyByWord.get(normalizeDictionaryText(english, 'en-US'));
    const match = pairMatch ?? wordMatch;
    if (match) return match;
    const difficulty = Math.min(6, Math.max(1, Math.round(Number(fallbackDifficulty) || 1)));
    return { difficulty, cefr: normalizeCefr(fallbackCefr) ?? DIFFICULTY_CEFR[difficulty] };
  }

  function normalizeWordRecord(word, initialKnowledge = 0) {
    const english = normalizeDictionaryText(word.english, 'en-US').slice(0, 80);
    const russian = normalizeDictionaryText(word.russian, 'ru-RU').slice(0, 120);
    const level = resolveWordDifficulty(english, russian, word.difficulty, word.cefr_level ?? word.cefr);
    return {
      id: word.id,
      english,
      russian,
      difficulty: level.difficulty,
      cefr_level: level.cefr,
      knowledge: roundKnowledge(word.knowledge ?? initialKnowledge),
      last_review_at: validIsoDate(word.last_review_at),
      last_correct_at: validIsoDate(word.last_correct_at),
      correct_answers: Math.max(0, Math.floor(Number(word.correct_answers) || 0)),
      wrong_answers: Math.max(0, Math.floor(Number(word.wrong_answers) || 0)),
      correct_streak: Math.max(0, Math.floor(Number(word.correct_streak) || 0)),
      reviews_today: Math.max(0, Math.floor(Number(word.reviews_today) || 0)),
      reviews_today_date: typeof word.reviews_today_date === 'string' ? word.reviews_today_date : null,
      last_result: word.last_result === 'correct' || word.last_result === 'wrong' ? word.last_result : null,
    };
  }

  function createWordRecord(id, english, russian, initialKnowledge = 0) {
    return normalizeWordRecord({ id, english, russian, knowledge: initialKnowledge }, initialKnowledge);
  }

  function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const source = String(text ?? '').replace(/^\uFEFF/, '');
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
        else if (character === '"') quoted = false;
        else field += character;
      } else if (character === '"') quoted = true;
      else if (character === ',') { row.push(field); field = ''; }
      else if (character === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
      else field += character;
    }
    if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
    return rows;
  }

  async function loadDifficultyData() {
    try {
      const response = await fetch('./data/oxford_5000_cefr_ru.csv');
      if (!response.ok) throw new Error('Difficulty data unavailable');
      const rows = parseCsvRows(await response.text()).slice(1);
      rows.forEach((columns) => {
        const english = normalizeDictionaryText(columns[0], 'en-US');
        const cefr = normalizeCefr(columns[1]);
        const russian = normalizeDictionaryText(columns[3], 'ru-RU');
        if (!english || !cefr) return;
        const candidate = { difficulty: CEFR_DIFFICULTY[cefr], cefr };
        const current = difficultyByWord.get(english);
        if (!current || candidate.difficulty < current.difficulty) difficultyByWord.set(english, candidate);
        if (russian && !difficultyByWordAndTranslation.has(difficultyKey(english, russian))) {
          difficultyByWordAndTranslation.set(difficultyKey(english, russian), candidate);
        }
      });
      let changed = false;
      words.forEach((word) => {
        const level = resolveWordDifficulty(word.english, word.russian, word.difficulty, word.cefr_level);
        if (word.difficulty !== level.difficulty || word.cefr_level !== level.cefr) {
          word.difficulty = level.difficulty;
          word.cefr_level = level.cefr;
          changed = true;
        }
      });
      if (changed) saveWords();
      renderDictionary();
    } catch { /* The stored fallback level remains available offline. */ }
  }

  function currentKnowledge(word, now = Date.now()) {
    const knowledge = roundKnowledge(word.knowledge);
    const reviewedAt = validIsoDate(word.last_review_at);
    if (!reviewedAt || knowledge === 0) return knowledge;
    const daysSinceReview = Math.max(0, (now - Date.parse(reviewedAt)) / DAY_MS);
    let graceDays = 2;
    let decayRate = .03;
    if (knowledge >= .95) { graceDays = 30; decayRate = .005; }
    else if (knowledge >= .8) { graceDays = 20; decayRate = .005; }
    else if (knowledge >= .6) { graceDays = 10; decayRate = .01; }
    else if (knowledge >= .4) { graceDays = 5; decayRate = .02; }
    const decayDays = Math.floor(Math.max(0, daysSinceReview - graceDays));
    return roundKnowledge(knowledge * ((1 - decayRate) ** decayDays));
  }

  function currentKnowledgePercent(word, now = Date.now()) {
    return Math.round(currentKnowledge(word, now) * 100);
  }

  function knowledgeDescription(knowledge) {
    if (knowledge < .2) return 'практически не знает';
    if (knowledge < .4) return 'начинает узнавать';
    if (knowledge < .6) return 'частично знает';
    if (knowledge < .8) return 'хорошо знает';
    if (knowledge < .95) return 'уверенно знает';
    return 'практически освоено';
  }

  function calendarDayDifference(fromIso, toDate) {
    const from = new Date(fromIso);
    if (Number.isNaN(from.getTime())) return null;
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
    return Math.round((end - start) / DAY_MS);
  }

  function reviewIntervalMultiplier(lastReviewAt, now) {
    if (!lastReviewAt) return 1;
    const days = Math.max(0, (now.getTime() - Date.parse(lastReviewAt)) / DAY_MS);
    if (days < 1) return .5;
    if (days < 3) return 1;
    if (days <= 7) return 1.2;
    if (days <= 30) return 1.4;
    return 1.5;
  }

  function dailyReviewMultiplier(reviewNumber) {
    if (reviewNumber <= 1) return 1;
    if (reviewNumber === 2) return .5;
    if (reviewNumber === 3) return .25;
    return .1;
  }

  function recordWordReview(word, correct, { positiveDelta, penalty }) {
    if (!word) return;
    const now = new Date();
    const today = localDateKey(now);
    const knowledgeBefore = currentKnowledge(word, now.getTime());
    if (word.reviews_today_date !== today) {
      word.reviews_today_date = today;
      word.reviews_today = 0;
    }
    let knowledgeAfter = knowledgeBefore;
    if (correct) {
      const reviewNumber = word.reviews_today + 1;
      const delta = positiveDelta * dailyReviewMultiplier(reviewNumber) * reviewIntervalMultiplier(word.last_review_at, now);
      knowledgeAfter += delta * (1 - knowledgeAfter);
      const correctDayGap = word.last_correct_at ? calendarDayDifference(word.last_correct_at, now) : null;
      const isFirstCorrectToday = correctDayGap !== 0;
      if (isFirstCorrectToday) {
        word.correct_streak = correctDayGap === 1 ? word.correct_streak + 1 : 1;
        const streakBonus = word.correct_streak >= 5 ? .05 : (word.correct_streak === 3 ? .03 : (word.correct_streak === 2 ? .02 : 0));
        knowledgeAfter += streakBonus * (1 - knowledgeAfter);
      }
      word.reviews_today = reviewNumber;
      word.correct_answers += 1;
      word.last_correct_at = now.toISOString();
    } else {
      knowledgeAfter -= penalty * knowledgeAfter;
      word.wrong_answers += 1;
      word.correct_streak = 0;
    }
    word.knowledge = roundKnowledge(knowledgeAfter);
    word.last_review_at = now.toISOString();
    word.last_result = correct ? 'correct' : 'wrong';
    if (!saveWords()) showToast('Не удалось сохранить прогресс слова');
    renderDictionary();
  }

  function loadStudyDays() {
    try {
      const saved = JSON.parse(localStorage.getItem(STUDY_DAYS_KEY) ?? '[]');
      if (!Array.isArray(saved)) return [];
      return [...new Set(saved.filter((day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort();
    } catch { return []; }
  }

  function loadProfile() {
    const fallback = { name: 'Пользователь Вордик', joinedAt: new Date().toISOString() };
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
      const profile = {
        name: typeof saved?.name === 'string' && saved.name.trim() ? saved.name.trim().slice(0, 80) : fallback.name,
        joinedAt: typeof saved?.joinedAt === 'string' && !Number.isNaN(Date.parse(saved.joinedAt)) ? saved.joinedAt : fallback.joinedAt,
      };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      return profile;
    } catch { return fallback; }
  }

  function loadProfileStats() {
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_STATS_KEY) ?? 'null');
      return {
        sessionsCompleted: Math.max(0, Math.floor(Number(saved?.sessionsCompleted) || 0)),
        totalSessionMs: Math.max(0, Math.floor(Number(saved?.totalSessionMs) || 0)),
      };
    } catch { return { sessionsCompleted: 0, totalSessionMs: 0 }; }
  }

  function saveProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(userProfile)); } catch { /* Profile remains available for this visit. */ }
  }

  function saveProfileStats() {
    try { localStorage.setItem(PROFILE_STATS_KEY, JSON.stringify(profileStats)); } catch { /* Stats remain available for this visit. */ }
  }

  function syncTelegramProfile(webApp) {
    const telegramUser = webApp?.initDataUnsafe?.user;
    if (!telegramUser) return;
    const telegramName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ').trim();
    if (!telegramName) return;
    userProfile.name = telegramName.slice(0, 80);
    saveProfile();
    renderProfile();
  }

  function profileInitials(name) {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map((part) => part[0]).join('') || 'В').toLocaleUpperCase('ru-RU');
  }

  function joinedLabel(isoDate) {
    const date = new Date(isoDate);
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `Вместе с Вордиком с ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  function durationLabel(milliseconds) {
    if (!milliseconds) return '0 мин';
    const seconds = Math.max(1, Math.round(milliseconds / 1000));
    if (seconds < 60) return `${seconds} сек`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} мин`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours} ч ${remainder} мин` : `${hours} ч`;
  }

  function sessionNoun(count) {
    const ending = count % 100;
    if (ending >= 11 && ending <= 14) return 'тренировок';
    if (count % 10 === 1) return 'тренировка';
    if (count % 10 >= 2 && count % 10 <= 4) return 'тренировки';
    return 'тренировок';
  }

  function renderProfile() {
    if (!$('profile-view')) return;
    const sessions = profileStats.sessionsCompleted;
    const averageMs = sessions ? profileStats.totalSessionMs / sessions : 0;
    const streak = streakLength();
    const target = Math.max(50, Math.ceil(Math.max(words.length, 1) / 50) * 50);
    const progress = Math.min(100, Math.round((words.length / target) * 100));
    $('profile-name').textContent = userProfile.name;
    $('profile-initials').textContent = profileInitials(userProfile.name);
    $('profile-joined').textContent = joinedLabel(userProfile.joinedAt);
    $('profile-average-time').textContent = durationLabel(averageMs);
    $('profile-total-time').textContent = durationLabel(profileStats.totalSessionMs);
    $('profile-session-count').textContent = `${sessions} ${sessionNoun(sessions)}`;
    $('profile-word-count').textContent = words.length;
    $('profile-word-goal').textContent = `из ${target} слов`;
    $('profile-progress-percent').textContent = `${progress}%`;
    $('profile-progress-bar').style.width = `${progress}%`;
    const remaining = Math.max(0, target - words.length);
    $('profile-progress-message').textContent = remaining
      ? `До следующей цели осталось ${remaining} ${wordNoun(remaining)}.`
      : 'Цель достигнута — пора выбрать следующую!';
    $('profile-streak-message').textContent = streak
      ? 'Продолжайте заниматься каждый день, чтобы сохранить серию.'
      : 'Начните занятие сегодня — первый день серии уже близко.';
  }

  function recordCompletedSession() {
    if (session.statsRecorded || !session.startedAt) return;
    profileStats.sessionsCompleted += 1;
    profileStats.totalSessionMs += Math.max(1000, Date.now() - session.startedAt);
    session.statsRecorded = true;
    saveProfileStats();
    renderProfile();
  }

  function loadQuickPickKnown() {
    try {
      const saved = JSON.parse(localStorage.getItem(QUICK_PICK_KNOWN_KEY) ?? '[]');
      if (!Array.isArray(saved)) return new Set();
      const validIds = new Set(quickPickWords.map((word) => word.id));
      return new Set(saved.filter((id) => typeof id === 'string' && validIds.has(id)));
    } catch { return new Set(); }
  }

  function loadQuickPickSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(QUICK_PICK_SESSION_KEY) ?? 'null');
      if (!saved || !Array.isArray(saved.deck) || !Array.isArray(saved.unknown) || !Array.isArray(saved.history)) return null;
      const validIds = new Set(quickPickWords.map((word) => word.id));
      const deck = saved.deck.filter((id) => typeof id === 'string' && validIds.has(id));
      if (deck.length !== QUICK_PICK_WORD_COUNT) return null;
      const index = Math.min(Math.max(Number(saved.index) || 0, 0), deck.length);
      const unknown = saved.unknown.filter((id) => deck.includes(id));
      const history = saved.history.filter((item) => item && deck.includes(item.id) && (item.choice === 'known' || item.choice === 'unknown'));
      const selected = Array.isArray(saved.selected) ? saved.selected.filter((id) => unknown.includes(id)) : null;
      return { deck, index, unknown, history, selected };
    } catch { return null; }
  }

  function saveQuickPickKnown() {
    try { localStorage.setItem(QUICK_PICK_KNOWN_KEY, JSON.stringify([...quickPickKnown])); } catch { /* Local progress is optional. */ }
  }

  function saveQuickPickSession() {
    try {
      if (quickPickSession) localStorage.setItem(QUICK_PICK_SESSION_KEY, JSON.stringify(quickPickSession));
      else localStorage.removeItem(QUICK_PICK_SESSION_KEY);
    } catch { /* Local progress is optional. */ }
    updateQuickPickLaunch();
  }

  function streakLength() {
    const days = new Set(studyDays);
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    if (!days.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let count = 0;
    while (days.has(localDateKey(cursor))) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  function streakDayLabel(count) {
    if (count % 100 >= 11 && count % 100 <= 14) return 'дней подряд';
    if (count % 10 === 1) return 'день подряд';
    if (count % 10 >= 2 && count % 10 <= 4) return 'дня подряд';
    return 'дней подряд';
  }

  function renderStreak() {
    if (!$('streak-widget')) return;
    const count = streakLength();
    const label = streakDayLabel(count);
    $('streak-count').textContent = count;
    $('streak-label').textContent = label;
    $('streak-widget').setAttribute('aria-label', String(count) + ' ' + label);
    if ($('profile-streak-message')) {
      $('profile-streak-message').textContent = count
        ? 'Продолжайте заниматься каждый день, чтобы сохранить серию.'
        : 'Начните занятие сегодня — первый день серии уже близко.';
    }
  }

  function recordStudyDay() {
    const today = localDateKey(new Date());
    if (studyDays.includes(today)) { renderStreak(); return; }
    studyDays.push(today);
    studyDays.sort();
    try {
      localStorage.setItem(STUDY_DAYS_KEY, JSON.stringify(studyDays));
    } catch {
      studyDays.splice(studyDays.indexOf(today), 1);
      showToast('Не удалось сохранить серию занятий на устройстве');
    }
    renderStreak();
  }

  function loadWords() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === null) return sampleWords.map((word) => normalizeWordRecord(word));
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error('Invalid word list');
      const normalized = parsed
        .filter((word) => word && typeof word.id === 'string' && typeof word.english === 'string' && typeof word.russian === 'string')
        .map((word) => normalizeWordRecord(word))
        .filter((word) => word.english && word.russian);
      if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      }
      return normalized;
    } catch {
      return sampleWords.map((word) => normalizeWordRecord(word));
    }
  }

  function normalizeDictionaryText(value, locale) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(locale);
  }

  function saveWords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
      return true;
    } catch {
      return false;
    }
  }

  function showToast(message, actionLabel, action) {
    const toast = $('toast');
    clearTimeout(toastTimer);
    toast.replaceChildren(document.createTextNode(message));
    if (actionLabel && action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = actionLabel;
      button.addEventListener('click', () => { action(); toast.hidden = true; });
      toast.append(button);
    }
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, action ? 6500 : 3500);
  }

  function speakWord(english) {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
      showToast('Озвучка недоступна в этом браузере');
      return;
    }
    try {
      const utterance = new SpeechSynthesisUtterance(english);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      const voices = synth.getVoices();
      const voice = voices.find((item) => /^en[-_]US/i.test(item.lang)) ?? voices.find((item) => /^en/i.test(item.lang));
      if (voice) utterance.voice = voice;
      activeUtterance = utterance;
      utterance.onend = () => { if (activeUtterance === utterance) activeUtterance = null; };
      utterance.onerror = (event) => {
        if (activeUtterance === utterance) activeUtterance = null;
        if (event.error !== 'canceled' && event.error !== 'interrupted') showToast('Не удалось озвучить слово');
      };
      synth.cancel();
      synth.speak(utterance);
    } catch {
      activeUtterance = null;
      showToast('Не удалось озвучить слово');
    }
  }

  function setAddPanel(open, restoreFocus = true) {
    $('add-overlay').hidden = !open;
    document.body.classList.toggle('is-add-open', open);
    $('add-word-toggle').setAttribute('aria-expanded', String(open));
    if (open) $('english-input').focus();
    else if (restoreFocus && activeTab === 'dictionary') $('add-word-toggle').focus();
  }

  function setSortOpen(open, restoreFocus = true) {
    const overlay = $('sort-overlay');
    const sheet = overlay.querySelector('.sort-sheet');
    clearTimeout(sortCloseTimer);
    if (sortOpenFrame) cancelAnimationFrame(sortOpenFrame);
    sheet.classList.remove('is-dragging');
    sheet.style.removeProperty('--sort-drag-y');
    if (open) {
      overlay.hidden = false;
      document.body.classList.add('is-sort-open');
      sortOpenFrame = requestAnimationFrame(() => {
        sortOpenFrame = requestAnimationFrame(() => overlay.classList.add('is-visible'));
      });
      overlay.querySelector('[data-sort="recent"]').focus();
      return;
    }
    overlay.classList.remove('is-visible');
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320;
    sortCloseTimer = setTimeout(() => {
      overlay.hidden = true;
      document.body.classList.remove('is-sort-open');
    }, duration);
    if (restoreFocus && activeTab === 'dictionary') $('sort-button').focus();
  }

  function enableSortSwipe() {
    const overlay = $('sort-overlay');
    const sheet = overlay.querySelector('.sort-sheet');
    let startY = 0;
    let startX = 0;
    let startTime = 0;
    let distance = 0;
    let dragging = false;
    sheet.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1 || !overlay.classList.contains('is-visible')) return;
      startY = event.touches[0].clientY;
      startX = event.touches[0].clientX;
      startTime = Date.now();
      distance = 0;
      dragging = false;
    }, { passive: true });
    sheet.addEventListener('touchmove', (event) => {
      if (event.touches.length !== 1 || !overlay.classList.contains('is-visible')) return;
      const vertical = event.touches[0].clientY - startY;
      const horizontal = event.touches[0].clientX - startX;
      if (vertical <= 0 || vertical <= Math.abs(horizontal)) return;
      event.preventDefault();
      dragging = true;
      distance = Math.min(vertical, sheet.offsetHeight);
      sheet.classList.add('is-dragging');
      sheet.style.setProperty('--sort-drag-y', `${distance}px`);
    }, { passive: false });
    sheet.addEventListener('touchend', () => {
      if (!dragging) return;
      const speed = distance / Math.max(Date.now() - startTime, 1);
      if (distance > 80 || (distance > 30 && speed > 0.55)) setSortOpen(false);
      else {
        sheet.classList.remove('is-dragging');
        sheet.style.removeProperty('--sort-drag-y');
      }
      dragging = false;
    });
    sheet.addEventListener('touchcancel', () => {
      sheet.classList.remove('is-dragging');
      sheet.style.removeProperty('--sort-drag-y');
      dragging = false;
    });
  }

  function collectionWordKey(english, russian) {
    return `${normalizeDictionaryText(english, 'en-US')}\u0000${normalizeDictionaryText(russian, 'ru-RU')}`;
  }

  function activeCollection() {
    return wordCollections.find((collection) => collection.id === activeCollectionId) ?? null;
  }

  const collectionCardThemes = [
    ['#d9ed74', '#0c6df8', '#ffffff'],
    ['#ffdc61', '#ff6d2d', '#17323e'],
    ['#8fd8ff', '#0c6df8', '#d9ed74'],
    ['#ffb7d4', '#f04f88', '#fff5d9'],
    ['#8be0bd', '#008c54', '#fffdf8'],
    ['#bfb5ff', '#7454e8', '#ffdc61'],
    ['#ffd08b', '#ff7a1a', '#17323e'],
    ['#abdcec', '#17323e', '#ffffff'],
    ['#ffaaa6', '#df454d', '#fffdf8'],
    ['#c7e890', '#4b8a55', '#fffdf8'],
  ];

  function renderReadyCollections() {
    const fragment = document.createDocumentFragment();
    wordCollections.forEach((collection, index) => {
      const button = document.createElement('button');
      button.className = 'ready-collection-card';
      button.type = 'button';
      button.dataset.collectionId = collection.id;
      button.setAttribute('aria-label', `Открыть подборку «${collection.title}»`);
      const [cover, accent, detail] = collectionCardThemes[index % collectionCardThemes.length];
      button.style.setProperty('--collection-cover', cover);
      button.style.setProperty('--collection-accent', accent);
      button.style.setProperty('--collection-detail', detail);

      const visual = document.createElement('span');
      visual.className = 'ready-collection-visual';
      visual.setAttribute('aria-hidden', 'true');
      if (collection.image) {
        const image = document.createElement('img');
        image.className = 'ready-collection-image';
        image.src = collection.image;
        image.alt = '';
        image.width = 700;
        image.height = 450;
        visual.append(image);
      } else {
        const visualCircle = document.createElement('span');
        visualCircle.className = 'ready-collection-visual-circle';
        const visualPill = document.createElement('span');
        visualPill.className = 'ready-collection-visual-pill';
        const visualDot = document.createElement('span');
        visualDot.className = 'ready-collection-visual-dot';
        visual.append(visualCircle, visualPill, visualDot);
      }

      const copy = document.createElement('span');
      copy.className = 'ready-collection-copy';
      const title = document.createElement('strong');
      title.textContent = collection.title;
      const description = document.createElement('span');
      description.className = 'ready-collection-description';
      description.textContent = collection.description;
      const meta = document.createElement('span');
      meta.className = 'ready-collection-meta';
      const wordCount = document.createElement('span');
      wordCount.textContent = `${collection.words.length} слов`;
      meta.append(wordCount);
      copy.append(title, description, meta);
      button.append(visual, copy);
      button.addEventListener('click', () => setCollectionOpen(true, collection.id));
      fragment.append(button);
    });
    $('ready-collection-list').replaceChildren(fragment);
  }

  function updateCollectionAction() {
    const collection = activeCollection();
    if (!collection) return;
    const existing = new Set(words.map((word) => collectionWordKey(word.english, word.russian)));
    const hasMissingWords = collection.words.some(([english, russian]) => !existing.has(collectionWordKey(english, russian)));
    $('collection-add-button').disabled = !hasMissingWords;
    $('collection-add-button').textContent = hasMissingWords ? 'Добавить в словарь' : 'Добавлено';
  }

  function renderCollectionDetails(collection) {
    $('collection-title').textContent = collection.title;
    $('collection-description').textContent = collection.description;
    const fragment = document.createDocumentFragment();
    collection.words.forEach(([englishValue, russianValue]) => {
      const row = document.createElement('div');
      row.className = 'collection-word-row';
      row.setAttribute('role', 'listitem');
      const english = document.createElement('strong');
      english.lang = 'en';
      english.textContent = normalizeDictionaryText(englishValue, 'en-US');
      const russian = document.createElement('span');
      russian.textContent = normalizeDictionaryText(russianValue, 'ru-RU');
      row.append(english, russian);
      fragment.append(row);
    });
    $('collection-word-list').replaceChildren(fragment);
    $('collection-word-list').scrollTop = 0;
    updateCollectionAction();
  }

  function setCollectionOpen(open, collectionId = activeCollectionId, restoreFocus = true) {
    const overlay = $('collection-overlay');
    const sheet = overlay.querySelector('.collection-sheet');
    clearTimeout(collectionCloseTimer);
    if (collectionOpenFrame) cancelAnimationFrame(collectionOpenFrame);
    sheet.classList.remove('is-dragging');
    sheet.style.removeProperty('--collection-drag-y');
    if (open) {
      const collection = wordCollections.find((item) => item.id === collectionId);
      if (!collection) return;
      activeCollectionId = collection.id;
      renderCollectionDetails(collection);
      overlay.hidden = false;
      document.body.classList.add('is-collection-open');
      collectionOpenFrame = requestAnimationFrame(() => {
        collectionOpenFrame = requestAnimationFrame(() => overlay.classList.add('is-visible'));
      });
      overlay.querySelector('[data-collection-close]').focus();
      return;
    }
    overlay.classList.remove('is-visible');
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320;
    collectionCloseTimer = setTimeout(() => {
      overlay.hidden = true;
      document.body.classList.remove('is-collection-open');
    }, duration);
    if (restoreFocus && activeTab === 'home') {
      const trigger = [...document.querySelectorAll('[data-collection-id]')].find((button) => button.dataset.collectionId === activeCollectionId);
      trigger?.focus();
    }
  }

  function addActiveCollection() {
    const collection = activeCollection();
    if (!collection) return;
    const existing = new Set(words.map((word) => collectionWordKey(word.english, word.russian)));
    const additions = [];
    collection.words.forEach(([englishValue, russianValue], index) => {
      const english = normalizeDictionaryText(englishValue, 'en-US');
      const russian = normalizeDictionaryText(russianValue, 'ru-RU');
      const key = collectionWordKey(english, russian);
      if (existing.has(key)) return;
      existing.add(key);
      additions.push(createWordRecord(
        globalThis.crypto?.randomUUID?.() ?? `collection-${collection.id}-${Date.now()}-${index}`,
        english,
        russian,
      ));
    });
    if (additions.length === 0) {
      updateCollectionAction();
      showToast('Все слова из подборки уже добавлены');
      return;
    }
    words.unshift(...additions);
    if (!saveWords()) {
      words.splice(0, additions.length);
      showToast('Не удалось сохранить подборку на устройстве');
      return;
    }
    renderDictionary();
    syncSession();
    updateCollectionAction();
    showToast(`Добавлено ${additions.length} ${wordNoun(additions.length)}`);
  }

  function enableCollectionSwipe() {
    const overlay = $('collection-overlay');
    const sheet = overlay.querySelector('.collection-sheet');
    const handle = overlay.querySelector('.collection-swipe-handle');
    let startY = 0;
    let startX = 0;
    let startTime = 0;
    let distance = 0;
    let dragging = false;
    handle.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1 || !overlay.classList.contains('is-visible')) return;
      startY = event.touches[0].clientY;
      startX = event.touches[0].clientX;
      startTime = Date.now();
      distance = 0;
      dragging = false;
    }, { passive: true });
    handle.addEventListener('touchmove', (event) => {
      if (event.touches.length !== 1 || !overlay.classList.contains('is-visible')) return;
      const vertical = event.touches[0].clientY - startY;
      const horizontal = event.touches[0].clientX - startX;
      if (vertical <= 0 || vertical <= Math.abs(horizontal)) return;
      event.preventDefault();
      dragging = true;
      distance = Math.min(vertical, sheet.offsetHeight);
      sheet.classList.add('is-dragging');
      sheet.style.setProperty('--collection-drag-y', `${distance}px`);
    }, { passive: false });
    handle.addEventListener('touchend', () => {
      if (!dragging) return;
      const speed = distance / Math.max(Date.now() - startTime, 1);
      if (distance > 80 || (distance > 30 && speed > 0.55)) setCollectionOpen(false);
      else {
        sheet.classList.remove('is-dragging');
        sheet.style.removeProperty('--collection-drag-y');
      }
      dragging = false;
    });
    handle.addEventListener('touchcancel', () => {
      sheet.classList.remove('is-dragging');
      sheet.style.removeProperty('--collection-drag-y');
      dragging = false;
    });
  }

  function renderDictionary() {
    const now = Date.now();
    const vocabularyScore = words.reduce((total, word) => total + (word.difficulty * currentKnowledgePercent(word, now)), 0);
    const scoreText = String(vocabularyScore);
    const scoreElement = $('home-vocabulary-score');
    scoreElement.textContent = scoreText;
    scoreElement.dataset.digits = String(Math.min(Math.max(scoreText.replace(/\D/g, '').length, 1), 6));
    $('home-vocabulary-score-unit').textContent = pointNoun(vocabularyScore);
    $('word-count').textContent = words.length;
    $('word-count-noun').textContent = wordNoun(words.length);
    $('dictionary-empty').hidden = words.length !== 0;
    $('word-list').hidden = words.length === 0;
    const displayedWords = sortMode === 'alphabetical'
      ? [...words].sort((a, b) => a.english.localeCompare(b.english, 'en', { sensitivity: 'base' }))
      : words;
    const fragment = document.createDocumentFragment();
    displayedWords.forEach((word) => {
      const row = document.createElement('div');
      row.className = 'dictionary-word-row';
      row.setAttribute('role', 'listitem');
      const listen = document.createElement('button');
      listen.className = 'listen-button';
      listen.type = 'button';
      listen.setAttribute('aria-label', `Произнести ${word.english}`);
      listen.title = `Произнести ${word.english}`;
      const speaker = document.createElement('img');
      speaker.src = './icons/speaker-user.svg';
      speaker.alt = '';
      speaker.setAttribute('aria-hidden', 'true');
      listen.append(speaker);
      listen.addEventListener('click', () => speakWord(word.english));
      const copy = document.createElement('button');
      copy.className = 'dictionary-word-copy';
      copy.type = 'button';
      copy.dataset.wordCardId = word.id;
      copy.setAttribute('aria-label', `Открыть карточку слова ${word.english}`);
      copy.addEventListener('click', () => setWordCardOpen(true, word.id));
      const english = document.createElement('strong');
      english.className = 'dictionary-word-english';
      english.lang = 'en';
      english.textContent = word.english;
      const russian = document.createElement('span');
      russian.className = 'dictionary-word-russian';
      russian.textContent = word.russian;
      const knowledge = currentKnowledge(word, now);
      const metrics = document.createElement('span');
      metrics.className = 'dictionary-word-metrics';
      const difficulty = document.createElement('span');
      difficulty.className = 'dictionary-word-metric is-difficulty';
      difficulty.textContent = `Сложность ${word.cefr_level}`;
      difficulty.title = `Сложность ${word.difficulty} из 6`;
      const knowledgeMetric = document.createElement('span');
      knowledgeMetric.className = 'dictionary-word-metric is-knowledge';
      knowledgeMetric.textContent = `Знание ${currentKnowledgePercent(word, now)}%`;
      knowledgeMetric.title = knowledgeDescription(knowledge);
      metrics.append(difficulty, knowledgeMetric);
      copy.append(english, russian, metrics);
      row.append(listen, copy);
      fragment.append(row);
    });
    $('word-list').replaceChildren(fragment);
    $('typing-start').disabled = words.length === 0;
    document.querySelector('[data-study="cards"]').disabled = words.length === 0;
    const hasQuizOptions = new Set(words.map((word) => word.russian.toLocaleLowerCase())).size >= 2;
    $('quiz-start').disabled = !hasQuizOptions;
    $('quiz-start').setAttribute('aria-label', hasQuizOptions ? 'Выбрать перевод: начать тренировку' : 'Для выбора перевода нужны хотя бы два разных перевода в словаре');
    const hasTimedOptions = new Set(words.map((word) => word.russian.toLocaleLowerCase())).size >= 2;
    $('timed-start').disabled = !hasTimedOptions;
    $('timed-start').setAttribute('aria-label', hasTimedOptions ? 'Перевод на время: начать тренировку с запасом 15 секунд' : 'Для перевода на время нужны хотя бы два разных слова в словаре');
    $('study-empty-hint').hidden = words.length !== 0;
  }

  function wordNoun(count) {
    const ending = count % 100;
    if (ending >= 11 && ending <= 14) return 'слов';
    if (count % 10 === 1) return 'слово';
    if (count % 10 >= 2 && count % 10 <= 4) return 'слова';
    return 'слов';
  }

  function pointNoun(value) {
    if (!Number.isInteger(value)) return 'балла';
    const ending = Math.abs(value) % 100;
    if (ending >= 11 && ending <= 14) return 'баллов';
    if (Math.abs(value) % 10 === 1) return 'балл';
    if (Math.abs(value) % 10 >= 2 && Math.abs(value) % 10 <= 4) return 'балла';
    return 'баллов';
  }

  function addWord(englishValue, russianValue) {
    const english = normalizeDictionaryText(englishValue, 'en-US');
    const russian = normalizeDictionaryText(russianValue, 'ru-RU');
    if (!english || !russian || english.length > 80 || russian.length > 120) throw new Error('Заполните оба поля: слово и перевод.');
    if (/\s/.test(english)) throw new Error('Можно добавить только одно английское слово без пробелов.');
    if (words.some((word) => word.english.toLocaleLowerCase() === english.toLocaleLowerCase() && word.russian.toLocaleLowerCase() === russian.toLocaleLowerCase())) {
      throw new Error('Это слово с таким переводом уже есть в словаре.');
    }
    const word = createWordRecord(globalThis.crypto?.randomUUID?.() ?? `word-${Date.now()}-${Math.random()}`, english, russian);
    words.unshift(word);
    if (!saveWords()) {
      words.shift();
      throw new Error('Не удалось сохранить слово на устройстве. Проверьте настройки браузера.');
    }
    renderDictionary();
    return word;
  }

  function setWordCardOpen(open, wordId = activeWordCardId, restoreFocus = true, preserveDrag = false) {
    const overlay = $('word-card-overlay');
    const dialog = overlay.querySelector('.word-card-dialog');
    clearTimeout(wordCardCloseTimer);
    if (wordCardOpenFrame) cancelAnimationFrame(wordCardOpenFrame);
    overlay.classList.remove('is-dragging');
    dialog.classList.remove('is-dragging');
    if (!preserveDrag) {
      dialog.style.removeProperty('--word-card-drag-y');
      overlay.style.removeProperty('--word-card-backdrop-opacity');
    }
    if (open) {
      const word = words.find((item) => item.id === wordId);
      if (!word) return;
      activeWordCardId = word.id;
      $('word-card-english').textContent = word.english;
      $('word-card-russian').textContent = word.russian;
      $('word-card-listen').setAttribute('aria-label', `Произнести ${word.english}`);
      $('word-card-delete').setAttribute('aria-label', `Удалить ${word.english}`);
      overlay.hidden = false;
      document.body.classList.add('is-word-card-open');
      wordCardOpenFrame = requestAnimationFrame(() => {
        wordCardOpenFrame = requestAnimationFrame(() => overlay.classList.add('is-visible'));
      });
      overlay.querySelector('[data-word-card-close]:not([tabindex="-1"])').focus();
      return;
    }
    const previousId = activeWordCardId;
    overlay.classList.remove('is-visible');
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300;
    wordCardCloseTimer = setTimeout(() => {
      overlay.hidden = true;
      document.body.classList.remove('is-word-card-open');
      dialog.style.removeProperty('--word-card-drag-y');
      overlay.style.removeProperty('--word-card-backdrop-opacity');
      if (activeWordCardId === previousId) activeWordCardId = null;
    }, duration);
    if (restoreFocus && activeTab === 'dictionary') {
      const trigger = [...document.querySelectorAll('[data-word-card-id]')].find((button) => button.dataset.wordCardId === previousId);
      trigger?.focus();
    }
  }

  function listenToActiveWordCard() {
    const word = words.find((item) => item.id === activeWordCardId);
    if (word) speakWord(word.english);
  }

  function enableWordCardSwipe() {
    const overlay = $('word-card-overlay');
    const dialog = overlay.querySelector('.word-card-dialog');
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let distance = 0;
    let dragging = false;
    let dragFrame = null;

    function paintDrag() {
      dragFrame = null;
      dialog.style.setProperty('--word-card-drag-y', `${distance}px`);
      const progress = Math.min(distance / Math.max(window.innerHeight * .65, 1), 1);
      overlay.style.setProperty('--word-card-backdrop-opacity', String(1 - (progress * .72)));
    }

    function releasePointer() {
      if (pointerId === null || !dialog.hasPointerCapture?.(pointerId)) return;
      try { dialog.releasePointerCapture(pointerId); } catch { /* The pointer may already be released. */ }
    }

    function resetDrag() {
      if (dragFrame) cancelAnimationFrame(dragFrame);
      dragFrame = null;
      releasePointer();
      overlay.classList.remove('is-dragging');
      dialog.classList.remove('is-dragging');
      dialog.style.removeProperty('--word-card-drag-y');
      overlay.style.removeProperty('--word-card-backdrop-opacity');
      pointerId = null;
      dragging = false;
      distance = 0;
    }

    dialog.addEventListener('pointerdown', (event) => {
      const interactive = event.target instanceof Element && event.target.closest('button');
      if (!overlay.classList.contains('is-visible') || event.button !== 0 || interactive) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startTime = performance.now();
      distance = 0;
      dragging = false;
      dialog.setPointerCapture?.(pointerId);
    });

    dialog.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pointerId || !overlay.classList.contains('is-visible')) return;
      const vertical = event.clientY - startY;
      const horizontal = event.clientX - startX;
      if (!dragging) {
        if (Math.max(Math.abs(vertical), Math.abs(horizontal)) < 4) return;
        if (vertical <= 0 || vertical <= Math.abs(horizontal)) {
          resetDrag();
          return;
        }
        dragging = true;
        overlay.classList.add('is-dragging');
        dialog.classList.add('is-dragging');
      }
      event.preventDefault();
      distance = Math.min(Math.max(vertical, 0), window.innerHeight);
      if (!dragFrame) dragFrame = requestAnimationFrame(paintDrag);
    });

    dialog.addEventListener('pointerup', (event) => {
      if (event.pointerId !== pointerId) return;
      if (dragFrame) {
        cancelAnimationFrame(dragFrame);
        paintDrag();
      }
      const speed = distance / Math.max(performance.now() - startTime, 1);
      const closeDistance = Math.min(100, dialog.offsetHeight * .24);
      if (dragging && (distance > closeDistance || (distance > 30 && speed > 0.55))) {
        releasePointer();
        overlay.classList.remove('is-dragging');
        dialog.classList.remove('is-dragging');
        dialog.style.setProperty('--word-card-drag-y', `${Math.max(window.innerHeight, dialog.offsetHeight)}px`);
        overlay.style.setProperty('--word-card-backdrop-opacity', '0');
        pointerId = null;
        dragging = false;
        setWordCardOpen(false, activeWordCardId, true, true);
        return;
      }
      resetDrag();
    });

    dialog.addEventListener('pointercancel', resetDrag);
  }

  function setDeleteConfirm(open, wordId = pendingDeleteId, restoreFocus = true) {
    const overlay = $('delete-overlay');
    clearTimeout(deleteCloseTimer);
    if (deleteOpenFrame) cancelAnimationFrame(deleteOpenFrame);
    if (open) {
      const word = words.find((item) => item.id === wordId);
      if (!word) return;
      pendingDeleteId = word.id;
      $('delete-word-english').textContent = word.english;
      $('delete-word-russian').textContent = word.russian;
      overlay.hidden = false;
      document.body.classList.add('is-delete-open');
      deleteOpenFrame = requestAnimationFrame(() => {
        deleteOpenFrame = requestAnimationFrame(() => overlay.classList.add('is-visible'));
      });
      overlay.querySelector('[data-delete-cancel]:not([tabindex="-1"])').focus();
      return;
    }
    const previousId = pendingDeleteId;
    overlay.classList.remove('is-visible');
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260;
    deleteCloseTimer = setTimeout(() => {
      overlay.hidden = true;
      document.body.classList.remove('is-delete-open');
      if (pendingDeleteId === previousId) pendingDeleteId = null;
    }, duration);
    if (restoreFocus && activeTab === 'dictionary') {
      if (activeWordCardId === previousId && $('word-card-overlay').classList.contains('is-visible')) $('word-card-delete').focus();
      else {
        const trigger = [...document.querySelectorAll('[data-word-card-id]')].find((button) => button.dataset.wordCardId === previousId);
        trigger?.focus();
      }
    }
  }

  function confirmDelete() {
    const wordId = pendingDeleteId;
    if (!wordId) return;
    if (activeWordCardId === wordId) setWordCardOpen(false, wordId, false);
    setDeleteConfirm(false, wordId, false);
    removeWord(wordId);
  }

  function removeWord(id) {
    const index = words.findIndex((word) => word.id === id);
    if (index < 0) return;
    const [removed] = words.splice(index, 1);
    if (!saveWords()) {
      words.splice(index, 0, removed);
      showToast('Не удалось изменить словарь на устройстве');
      return;
    }
    renderDictionary();
    syncSession();
    showToast('Слово удалено', 'Отменить', () => {
      words.splice(Math.min(index, words.length), 0, removed);
      if (!saveWords()) {
        words.splice(words.findIndex((word) => word.id === removed.id), 1);
        showToast('Не удалось восстановить слово на устройстве');
        return;
      }
      renderDictionary();
      syncSession();
    });
  }

  function switchTab(tab) {
    if (tab !== 'dictionary' && !$('sort-overlay').hidden) setSortOpen(false, false);
    if (tab !== 'dictionary' && !$('add-overlay').hidden) setAddPanel(false, false);
    if (tab !== 'home' && !$('collection-overlay').hidden) setCollectionOpen(false, activeCollectionId, false);
    if (tab !== 'dictionary' && !$('delete-overlay').hidden) setDeleteConfirm(false, pendingDeleteId, false);
    if (tab !== 'dictionary' && !$('word-card-overlay').hidden) setWordCardOpen(false, activeWordCardId, false);
    if (tab !== 'home' && !$('quick-pick-screen').hidden) closeQuickPick();
    activeTab = tab;
    document.body.classList.toggle('is-profile', tab === 'profile');
    document.querySelector('.bottom-nav').dataset.active = tab;
    document.querySelectorAll('[data-tab]').forEach((button) => {
      const selected = button.dataset.tab === tab;
      button.classList.toggle('is-active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    $('home-view').hidden = tab !== 'home';
    $('dictionary-view').hidden = tab !== 'dictionary';
    $('cards-view').hidden = tab !== 'cards';
    $('profile-view').hidden = tab !== 'profile';
    $('profile-button').setAttribute('aria-pressed', String(tab === 'profile'));
    if (tab === 'home' || tab === 'dictionary') renderDictionary();
    if (tab === 'profile') renderProfile();
    window.scrollTo(0, 0);
  }

  function setPhase(phase) {
    if (phase !== 'play' || session.mechanic !== 'timed') stopTimedRound();
    session.phase = phase;
    if (phase === 'finish') recordCompletedSession();
    document.body.classList.toggle('is-studying', phase === 'play');
    document.body.classList.toggle('is-quiz-studying', phase === 'play' && session.mechanic === 'quiz');
    document.body.classList.toggle('is-card-studying', phase === 'play' && session.mechanic === 'cards');
    document.body.classList.toggle('is-timed-studying', phase === 'play' && session.mechanic === 'timed');
    $('study-feed').hidden = phase !== 'feed';
    $('study-play').hidden = phase !== 'play';
    $('study-finish').hidden = phase !== 'finish';
    $('flashcard-activity').hidden = phase !== 'play' || session.mechanic !== 'cards';
    $('quiz-activity').hidden = phase !== 'play' || session.mechanic !== 'quiz';
    $('typing-activity').hidden = phase !== 'play' || session.mechanic !== 'typing';
    $('timed-activity').hidden = phase !== 'play' || session.mechanic !== 'timed';
    if (phase === 'finish') {
      $('finish-title').textContent = session.mechanic === 'timed' ? 'Время вышло!' : 'Готово!';
      $('finish-copy').textContent = session.mechanic === 'cards'
        ? `Вы повторили ${session.ids.length} ${wordNoun(session.ids.length)}.`
        : (session.mechanic === 'timed'
            ? `Верных ответов: ${session.correctCount}. Всего ответов: ${session.attemptCount}.`
            : `Верных ответов: ${session.correctCount} из ${session.ids.length}.`);
    }
    window.scrollTo(0, 0);
  }

  function shuffled(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }
    return result;
  }

  function quickPickWordById(id) {
    return quickPickWords.find((word) => word.id === id) ?? null;
  }

  function updateQuickPickLaunch() {
    if (!$('quick-pick-start')) return;
    const hasProgress = Boolean(quickPickSession);
    $('quick-pick-launch-title').textContent = hasProgress ? 'Продолжить подбор' : 'Найдите новые слова';
  }

  function availableQuickPickWords() {
    const dictionaryWords = new Set(words.map((word) => normalizeDictionaryText(word.english, 'en-US')));
    return quickPickWords.filter((word) => {
      const english = normalizeDictionaryText(word.english, 'en-US');
      return !dictionaryWords.has(english) && !quickPickKnown.has(word.id);
    });
  }

  function createQuickPickSession() {
    const deck = shuffled(availableQuickPickWords()).slice(0, QUICK_PICK_WORD_COUNT).map((word) => word.id);
    quickPickSession = { deck, index: 0, unknown: [], history: [], selected: null };
    saveQuickPickSession();
  }

  function requestQuickPick() {
    if (!quickPickSession) {
      if (availableQuickPickWords().length === 0) {
        showToast('Для новой подборки пока нет доступных слов');
        return;
      }
      createQuickPickSession();
    }
    openQuickPick();
  }

  function openQuickPick() {
    if (!quickPickSession) return;
    recordStudyDay();
    document.body.classList.add('is-picking');
    $('quick-pick-screen').hidden = false;
    if (quickPickSession.index >= quickPickSession.deck.length) renderQuickPickReview();
    else renderQuickPickCard();
    window.scrollTo(0, 0);
  }

  function closeQuickPick() {
    saveQuickPickSession();
    document.body.classList.remove('is-picking');
    $('quick-pick-screen').hidden = true;
    updateQuickPickLaunch();
    window.scrollTo(0, 0);
  }

  function renderQuickPickCard() {
    if (!quickPickSession || quickPickSession.index >= quickPickSession.deck.length) {
      renderQuickPickReview();
      return;
    }
    const word = quickPickWordById(quickPickSession.deck[quickPickSession.index]);
    if (!word) {
      quickPickSession.index += 1;
      saveQuickPickSession();
      renderQuickPickCard();
      return;
    }
    quickPickFlipped = false;
    quickPickAnimating = false;
    const card = $('quick-pick-card');
    card.className = 'quick-pick-card';
    card.style.removeProperty('transform');
    card.parentElement.style.removeProperty('--swipe-progress');
    card.parentElement.removeAttribute('data-swipe-direction');
    $('quick-pick-word').textContent = normalizeDictionaryText(word.english, 'en-US');
    $('quick-pick-translation').textContent = normalizeDictionaryText(word.russian, 'ru-RU');
    $('quick-pick-translation').hidden = true;
    $('quick-pick-card-hint').textContent = 'Нажмите, чтобы увидеть перевод';
    $('quick-pick-progress').textContent = `${quickPickSession.index + 1} из ${quickPickSession.deck.length}`;
    $('quick-pick-undo').disabled = quickPickSession.history.length === 0;
    $('quick-pick-deck-view').hidden = false;
    $('quick-pick-review').hidden = true;
  }

  function toggleQuickPickTranslation() {
    if (quickPickAnimating || !quickPickSession || quickPickSession.index >= quickPickSession.deck.length) return;
    quickPickFlipped = !quickPickFlipped;
    $('quick-pick-translation').hidden = !quickPickFlipped;
    $('quick-pick-card-hint').textContent = quickPickFlipped ? 'Нажмите, чтобы скрыть перевод' : 'Нажмите, чтобы увидеть перевод';
    $('quick-pick-card').classList.toggle('is-flipped', quickPickFlipped);
  }

  function commitQuickPickChoice(choice) {
    if (!quickPickSession || quickPickSession.index >= quickPickSession.deck.length) return;
    const id = quickPickSession.deck[quickPickSession.index];
    quickPickSession.history.push({ id, choice });
    if (choice === 'known') {
      quickPickKnown.add(id);
      saveQuickPickKnown();
    } else if (!quickPickSession.unknown.includes(id)) {
      quickPickSession.unknown.push(id);
    }
    quickPickSession.index += 1;
    if (quickPickSession.index >= quickPickSession.deck.length && quickPickSession.selected === null) {
      quickPickSession.selected = [...quickPickSession.unknown];
    }
    saveQuickPickSession();
    if (quickPickSession.index >= quickPickSession.deck.length) renderQuickPickReview();
    else renderQuickPickCard();
  }

  function animateQuickPickChoice(choice) {
    if (quickPickAnimating || !quickPickSession || quickPickSession.index >= quickPickSession.deck.length) return;
    quickPickAnimating = true;
    quickPickSuppressClick = true;
    const card = $('quick-pick-card');
    const direction = choice === 'known' ? 1 : -1;
    card.classList.add(choice === 'known' ? 'is-leaving-known' : 'is-leaving-unknown');
    card.style.transform = `translateX(${direction * 120}vw) rotate(${direction * 18}deg)`;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 230;
    setTimeout(() => commitQuickPickChoice(choice), duration);
  }

  function undoQuickPickChoice() {
    if (quickPickAnimating || !quickPickSession || quickPickSession.history.length === 0) return;
    const last = quickPickSession.history.pop();
    quickPickSession.index = Math.max(0, quickPickSession.index - 1);
    if (last.choice === 'known') {
      quickPickKnown.delete(last.id);
      saveQuickPickKnown();
    } else {
      const unknownIndex = quickPickSession.unknown.lastIndexOf(last.id);
      if (unknownIndex >= 0) quickPickSession.unknown.splice(unknownIndex, 1);
    }
    quickPickSession.selected = null;
    saveQuickPickSession();
    renderQuickPickCard();
  }

  function updateQuickPickSelection() {
    if (!quickPickSession) return;
    const selectedCount = quickPickSession.selected?.length ?? 0;
    $('quick-pick-selected-count').textContent = `Выбрано: ${selectedCount} ${wordNoun(selectedCount)}`;
    $('quick-pick-add-selected').textContent = `Добавить выбранные слова — ${selectedCount}`;
    $('quick-pick-add-selected').disabled = selectedCount === 0;
  }

  function renderQuickPickReview() {
    if (!quickPickSession) return;
    if (quickPickSession.selected === null) quickPickSession.selected = [...quickPickSession.unknown];
    saveQuickPickSession();
    $('quick-pick-deck-view').hidden = true;
    $('quick-pick-review').hidden = false;
    const hasUnknown = quickPickSession.unknown.length > 0;
    $('quick-pick-review-copy').textContent = hasUnknown
      ? 'Выберите слова, которые хотите добавить в словарь.'
      : (quickPickSession.deck.length ? 'Вы отметили все слова как знакомые.' : 'Для новой сессии пока нет доступных слов.');
    $('quick-pick-selection-tools').hidden = !hasUnknown;
    $('quick-pick-selected-count').hidden = !hasUnknown;
    $('quick-pick-add-selected').hidden = !hasUnknown;
    const fragment = document.createDocumentFragment();
    quickPickSession.unknown.forEach((id) => {
      const word = quickPickWordById(id);
      if (!word) return;
      const label = document.createElement('label');
      label.className = 'quick-pick-review-row';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = quickPickSession.selected.includes(id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked && !quickPickSession.selected.includes(id)) quickPickSession.selected.push(id);
        if (!checkbox.checked) quickPickSession.selected = quickPickSession.selected.filter((selectedId) => selectedId !== id);
        saveQuickPickSession();
        updateQuickPickSelection();
      });
      const copy = document.createElement('span');
      copy.className = 'quick-pick-review-word';
      const english = document.createElement('strong');
      english.lang = 'en';
      english.textContent = normalizeDictionaryText(word.english, 'en-US');
      const russian = document.createElement('span');
      russian.textContent = normalizeDictionaryText(word.russian, 'ru-RU');
      copy.append(english, russian);
      label.append(checkbox, copy);
      fragment.append(label);
    });
    $('quick-pick-review-list').replaceChildren(fragment);
    $('quick-pick-review-undo').hidden = quickPickSession.history.length === 0;
    updateQuickPickSelection();
    window.scrollTo(0, 0);
  }

  function setQuickPickSelection(selectAll) {
    if (!quickPickSession) return;
    quickPickSession.selected = selectAll ? [...quickPickSession.unknown] : [];
    saveQuickPickSession();
    renderQuickPickReview();
  }

  function finishQuickPick(message) {
    quickPickSession = null;
    saveQuickPickSession();
    closeQuickPick();
    if (message) showToast(message);
  }

  function addQuickPickSelection() {
    if (!quickPickSession) return;
    const selectedIds = new Set(quickPickSession.selected ?? []);
    const existingEnglish = new Set(words.map((word) => normalizeDictionaryText(word.english, 'en-US')));
    const additions = [];
    quickPickSession.unknown.forEach((id, index) => {
      if (!selectedIds.has(id)) return;
      const source = quickPickWordById(id);
      if (!source) return;
      const english = normalizeDictionaryText(source.english, 'en-US');
      const russian = normalizeDictionaryText(source.russian, 'ru-RU');
      if (existingEnglish.has(english)) return;
      existingEnglish.add(english);
      additions.push(createWordRecord(globalThis.crypto?.randomUUID?.() ?? `quick-word-${Date.now()}-${index}`, english, russian));
    });
    if (additions.length) {
      words.unshift(...additions);
      if (!saveWords()) {
        words.splice(0, additions.length);
        showToast('Не удалось сохранить выбранные слова');
        return;
      }
      renderDictionary();
      syncSession();
    }
    finishQuickPick(additions.length ? `Добавлено ${additions.length} ${wordNoun(additions.length)}` : 'Новые слова не добавлены');
  }

  function setupQuickPickGestures() {
    const card = $('quick-pick-card');
    let activePointer = null;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let distanceX = 0;
    card.addEventListener('pointerdown', (event) => {
      if (quickPickAnimating) return;
      activePointer = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startTime = Date.now();
      distanceX = 0;
      card.setPointerCapture?.(event.pointerId);
      card.classList.add('is-dragging');
    });
    card.addEventListener('pointermove', (event) => {
      if (activePointer !== event.pointerId || quickPickAnimating) return;
      distanceX = event.clientX - startX;
      const distanceY = event.clientY - startY;
      if (Math.abs(distanceY) > Math.abs(distanceX) && Math.abs(distanceY) > 12) return;
      const progress = Math.min(Math.abs(distanceX) / 120, 1);
      card.style.transform = `translateX(${distanceX}px) rotate(${distanceX / 22}deg)`;
      card.parentElement.style.setProperty('--swipe-progress', String(progress));
      card.parentElement.dataset.swipeDirection = distanceX >= 0 ? 'known' : 'unknown';
    });
    const finishPointer = (event) => {
      if (activePointer !== event.pointerId) return;
      card.releasePointerCapture?.(event.pointerId);
      card.classList.remove('is-dragging');
      const speed = Math.abs(distanceX) / Math.max(Date.now() - startTime, 1);
      activePointer = null;
      if (Math.abs(distanceX) > 90 || (Math.abs(distanceX) > 45 && speed > 0.55)) {
        quickPickSuppressClick = true;
        animateQuickPickChoice(distanceX > 0 ? 'known' : 'unknown');
        return;
      }
      card.style.removeProperty('transform');
      card.parentElement.style.removeProperty('--swipe-progress');
      card.parentElement.removeAttribute('data-swipe-direction');
    };
    card.addEventListener('pointerup', finishPointer);
    card.addEventListener('pointercancel', finishPointer);
    card.addEventListener('click', () => {
      if (quickPickSuppressClick) {
        quickPickSuppressClick = false;
        return;
      }
      toggleQuickPickTranslation();
    });
  }

  function weakestStudyWordIds() {
    const now = Date.now();
    return words
      .map((word, index) => ({ word, index, knowledge: currentKnowledge(word, now) }))
      .sort((left, right) => (
        left.knowledge - right.knowledge
        || left.word.difficulty - right.word.difficulty
        || left.index - right.index
      ))
      .slice(0, STUDY_SERIES_SIZE)
      .map(({ word }) => word.id);
  }

  function startStudy(mechanic = session.mechanic) {
    if (!words.length) return;
    if (mechanic === 'quiz' && new Set(words.map((word) => word.russian.toLocaleLowerCase())).size < 2) return;
    if (mechanic === 'timed' && new Set(words.map((word) => word.russian.toLocaleLowerCase())).size < 2) return;
    stopTimedRound();
    session.mechanic = mechanic;
    session.ids = mechanic === 'timed' ? shuffled(words.map((word) => word.id)) : weakestStudyWordIds();
    session.index = 0;
    session.flipped = false;
    session.answered = false;
    session.correctCount = 0;
    session.attemptCount = 0;
    session.startedAt = Date.now();
    session.statsRecorded = false;
    recordStudyDay();
    setPhase('play');
    renderExercise();
    if (mechanic === 'timed') startTimedRound();
  }

  function syncSession() {
    if (session.phase !== 'play') return;
    session.ids = session.ids.filter((id) => words.some((word) => word.id === id));
    if (!session.ids.length) { setPhase('feed'); return; }
    session.index = Math.min(session.index, session.ids.length - 1);
    renderExercise();
  }

  function renderProgress() {
    $('progress-text').textContent = session.mechanic === 'timed'
      ? `${session.correctCount} верных`
      : `${session.index + 1}/${session.ids.length}`;
  }

  function renderExercise() {
    const word = words.find((entry) => entry.id === session.ids[session.index]);
    if (!word) return;
    renderProgress();
    if (session.mechanic === 'cards') renderCard(word);
    if (session.mechanic === 'quiz') renderQuiz(word);
    if (session.mechanic === 'typing') renderTyping(word);
    if (session.mechanic === 'timed') renderTimed(word);
  }

  function renderCard(word) {
    const englishSide = session.flipped;
    $('card-term').textContent = englishSide ? word.english : word.russian;
    $('card-side').textContent = englishSide ? 'СЛОВО' : 'ПЕРЕВОД';
    $('card-hint').textContent = session.flipped ? 'Нажмите, чтобы вернуться' : `Нажмите, чтобы увидеть ${englishSide ? 'перевод' : 'слово'}`;
    $('flashcard').classList.toggle('is-flipped', session.flipped);
    $('flashcard').setAttribute('aria-label', `${englishSide ? 'Английское слово' : 'Перевод'}: ${englishSide ? word.english : word.russian}. Перевернуть карточку`);
    $('next-button-label').textContent = session.index === session.ids.length - 1 ? 'Завершить' : 'Дальше';
  }

  function renderQuiz(word) {
    session.answered = false;
    $('quiz-prompt').textContent = word.english;
    $('quiz-feedback').textContent = '';
    $('quiz-feedback').removeAttribute('data-result');
    $('quiz-next-button').disabled = true;
    $('quiz-next-label').textContent = session.index === session.ids.length - 1 ? 'Завершить' : 'Дальше';
    const translations = [...new Map(words.map((entry) => [entry.russian.toLocaleLowerCase(), entry.russian])).values()];
    const distractors = shuffled(translations.filter((answer) => answer.toLocaleLowerCase() !== word.russian.toLocaleLowerCase())).slice(0, 2);
    const options = shuffled([...distractors, word.russian]);
    const fragment = document.createDocumentFragment();
    options.forEach((answer) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer-option';
      button.dataset.answer = answer;
      button.setAttribute('aria-pressed', 'false');
      const label = document.createElement('span');
      label.textContent = answer;
      const radio = document.createElement('span');
      radio.className = 'answer-option-radio';
      radio.setAttribute('aria-hidden', 'true');
      const check = document.createElement('img');
      check.src = './icons/check.svg';
      check.alt = '';
      radio.append(check);
      button.append(label, radio);
      button.addEventListener('click', () => answerQuiz(answer, word.russian));
      fragment.append(button);
    });
    $('quiz-options').replaceChildren(fragment);
  }

  function answerQuiz(answer, correctAnswer) {
    if (session.answered) return;
    session.answered = true;
    const word = words.find((entry) => entry.id === session.ids[session.index]);
    const correct = answer.toLocaleLowerCase() === correctAnswer.toLocaleLowerCase();
    if (correct) session.correctCount += 1;
    recordWordReview(word, correct, { positiveDelta: .05, penalty: .05 });
    $('quiz-options').querySelectorAll('button').forEach((button) => {
      button.disabled = true;
      const selected = button.dataset.answer === answer;
      button.setAttribute('aria-pressed', String(selected));
      if (selected) button.classList.add('is-selected');
      if (button.dataset.answer.toLocaleLowerCase() === correctAnswer.toLocaleLowerCase()) button.classList.add('is-correct');
    });
    $('quiz-feedback').textContent = correct ? 'Верно!' : `Правильный ответ: ${correctAnswer}`;
    $('quiz-feedback').dataset.result = correct ? 'correct' : 'incorrect';
    $('quiz-next-button').disabled = false;
  }

  function renderTyping(word) {
    session.answered = false;
    $('typing-prompt').textContent = word.russian;
    $('typing-input').value = '';
    $('typing-input').disabled = false;
    $('typing-check-button').hidden = false;
    $('typing-feedback').textContent = '';
    $('typing-feedback').removeAttribute('data-result');
    $('typing-next-button').hidden = true;
    $('typing-next-button').textContent = session.index === session.ids.length - 1 ? 'Завершить' : 'Дальше';
  }

  function answerTyping() {
    if (session.answered) return;
    const word = words.find((entry) => entry.id === session.ids[session.index]);
    if (!word) return;
    const answer = $('typing-input').value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (!answer) return;
    session.answered = true;
    const correct = answer === word.english.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (correct) session.correctCount += 1;
    recordWordReview(word, correct, { positiveDelta: .12, penalty: .10 });
    $('typing-input').disabled = true;
    $('typing-check-button').hidden = true;
    $('typing-feedback').textContent = correct ? 'Верно!' : `Правильный ответ: ${word.english}`;
    $('typing-feedback').dataset.result = correct ? 'correct' : 'incorrect';
    $('typing-next-button').hidden = false;
  }

  function stopTimedRound() {
    clearInterval(timedInterval);
    clearTimeout(timedAdvanceTimer);
    timedInterval = null;
    timedAdvanceTimer = null;
    timedLocked = false;
  }

  function updateTimedClock() {
    if (session.phase !== 'play' || session.mechanic !== 'timed') return;
    const remaining = Math.max(0, timedDeadline - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    $('timed-seconds').textContent = String(seconds);
    $('timed-progress-fill').style.width = `${Math.min(100, (remaining / 15000) * 100)}%`;
    $('timed-clock').setAttribute('aria-label', `Осталось ${seconds} секунд`);
    $('timed-clock').classList.toggle('is-critical', remaining <= 5000);
    if (remaining <= 0) setPhase('finish');
  }

  function startTimedRound() {
    stopTimedRound();
    timedDeadline = Date.now() + 15000;
    updateTimedClock();
    timedInterval = setInterval(updateTimedClock, 100);
  }

  function renderTimed(word) {
    timedLocked = false;
    $('timed-prompt').textContent = word.english;
    $('timed-score').textContent = String(session.correctCount);
    $('timed-feedback').textContent = '';
    $('timed-feedback').removeAttribute('data-result');
    $('timed-clock').classList.remove('is-rewarded', 'is-penalized');
    const russianWords = [...new Map(words.map((entry) => [entry.russian.toLocaleLowerCase(), entry.russian])).values()];
    const distractors = shuffled(russianWords.filter((answer) => answer.toLocaleLowerCase() !== word.russian.toLocaleLowerCase())).slice(0, 3);
    const options = shuffled([...distractors, word.russian]);
    const fragment = document.createDocumentFragment();
    options.forEach((answer) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer-option timed-answer-option';
      button.dataset.answer = answer;
      button.setAttribute('aria-pressed', 'false');
      const label = document.createElement('span');
      label.textContent = answer;
      const radio = document.createElement('span');
      radio.className = 'answer-option-radio';
      radio.setAttribute('aria-hidden', 'true');
      const check = document.createElement('img');
      check.src = './icons/check.svg';
      check.alt = '';
      radio.append(check);
      button.append(label, radio);
      button.addEventListener('click', (event) => {
        event.currentTarget.blur();
        answerTimed(answer, word.russian);
      });
      fragment.append(button);
    });
    $('timed-options').replaceChildren(fragment);
  }

  function advanceTimedWord() {
    if (session.phase !== 'play' || session.mechanic !== 'timed' || !session.ids.length) return;
    const previousId = session.ids[session.index];
    if (session.index < session.ids.length - 1) session.index += 1;
    else {
      session.ids = shuffled(session.ids);
      if (session.ids.length > 1 && session.ids[0] === previousId) session.ids.push(session.ids.shift());
      session.index = 0;
    }
    session.answered = false;
    renderExercise();
  }

  function answerTimed(answer, correctAnswer) {
    if (timedLocked || session.phase !== 'play' || session.mechanic !== 'timed') return;
    const word = words.find((entry) => entry.id === session.ids[session.index]);
    const correct = answer.toLocaleLowerCase() === correctAnswer.toLocaleLowerCase();
    timedLocked = true;
    session.answered = true;
    session.attemptCount += 1;
    if (correct) session.correctCount += 1;
    recordWordReview(word, correct, { positiveDelta: .05, penalty: .05 });
    timedDeadline += correct ? 3000 : -3000;
    $('timed-score').textContent = String(session.correctCount);
    renderProgress();
    $('timed-options').querySelectorAll('button').forEach((button) => {
      button.disabled = true;
      const selected = button.dataset.answer === answer;
      const correctOption = button.dataset.answer.toLocaleLowerCase() === correctAnswer.toLocaleLowerCase();
      button.setAttribute('aria-pressed', String(selected));
      if (correctOption) button.classList.add('is-correct');
      else if (selected) button.classList.add('is-incorrect');
      button.blur();
    });
    $('timed-feedback').textContent = correct ? '+3 секунды' : `−3 секунды · Правильно: ${correctAnswer}`;
    $('timed-feedback').dataset.result = correct ? 'correct' : 'incorrect';
    $('timed-clock').classList.remove('is-rewarded', 'is-penalized');
    $('timed-clock').classList.add(correct ? 'is-rewarded' : 'is-penalized');
    updateTimedClock();
    if (session.phase !== 'play') return;
    timedAdvanceTimer = setTimeout(advanceTimedWord, correct ? 700 : 900);
  }

  function nextCard() {
    if (session.phase !== 'play') return;
    if (session.mechanic !== 'cards' && !session.answered) return;
    if (session.index >= session.ids.length - 1) { setPhase('finish'); return; }
    session.index += 1;
    session.flipped = false;
    session.answered = false;
    renderExercise();
  }

  $('profile-button').addEventListener('click', () => switchTab(activeTab === 'profile' ? 'home' : 'profile'));
  document.querySelectorAll('[data-profile-close]').forEach((button) => button.addEventListener('click', () => switchTab('home')));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    renderStreak();
    updateTimedClock();
  });

  $('add-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      addWord($('english-input').value, $('russian-input').value);
      $('add-form').reset();
      setAddPanel(false);
      showToast('Слово добавлено');
    } catch (error) { showToast(error.message); }
  });
  $('add-word-toggle').addEventListener('click', () => setAddPanel($('add-overlay').hidden));
  document.querySelectorAll('[data-add-close]').forEach((button) => button.addEventListener('click', () => setAddPanel(false)));
  $('empty-add-button').addEventListener('click', () => setAddPanel(true));
  enableSortSwipe();
  enableCollectionSwipe();
  enableWordCardSwipe();
  $('collection-add-button').addEventListener('click', addActiveCollection);
  document.querySelectorAll('[data-collection-close]').forEach((button) => button.addEventListener('click', () => setCollectionOpen(false)));
  document.querySelectorAll('[data-delete-cancel]').forEach((button) => button.addEventListener('click', () => setDeleteConfirm(false)));
  document.querySelectorAll('[data-word-card-close]').forEach((button) => button.addEventListener('click', () => setWordCardOpen(false)));
  $('word-card-listen').addEventListener('click', listenToActiveWordCard);
  $('word-card-delete').addEventListener('click', () => setDeleteConfirm(true, activeWordCardId));
  $('confirm-delete-button').addEventListener('click', confirmDelete);
  $('sort-button').addEventListener('click', () => setSortOpen(true));
  document.querySelectorAll('[data-sort-close]').forEach((button) => button.addEventListener('click', () => setSortOpen(false)));
  document.querySelectorAll('[data-sort]').forEach((button) => button.addEventListener('click', () => {
    sortMode = button.dataset.sort;
    document.querySelectorAll('[data-sort]').forEach((option) => option.setAttribute('aria-pressed', String(option === button)));
    renderDictionary();
    setSortOpen(false);
  }));
  document.addEventListener('keydown', (event) => {
    const addOpen = !$('add-overlay').hidden;
    const collectionOpen = $('collection-overlay').classList.contains('is-visible');
    const wordCardOpen = $('word-card-overlay').classList.contains('is-visible');
    const deleteOpen = $('delete-overlay').classList.contains('is-visible');
    const overlay = deleteOpen
      ? $('delete-overlay')
      : (wordCardOpen ? $('word-card-overlay') : (addOpen ? $('add-overlay') : (collectionOpen ? $('collection-overlay') : ($('sort-overlay').classList.contains('is-visible') ? $('sort-overlay') : null))));
    if (!overlay) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (deleteOpen) setDeleteConfirm(false);
      else if (wordCardOpen) setWordCardOpen(false);
      else if (addOpen) setAddPanel(false);
      else if (collectionOpen) setCollectionOpen(false);
      else setSortOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll('button, input')].filter((item) => item.tabIndex !== -1);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.go)));
  document.querySelectorAll('[data-study]').forEach((button) => button.addEventListener('click', () => startStudy(button.dataset.study)));
  setupQuickPickGestures();
  $('quick-pick-start').addEventListener('click', requestQuickPick);
  $('quick-pick-close').addEventListener('click', closeQuickPick);
  $('quick-pick-review-close').addEventListener('click', closeQuickPick);
  $('quick-pick-known').addEventListener('click', () => animateQuickPickChoice('known'));
  $('quick-pick-unknown').addEventListener('click', () => animateQuickPickChoice('unknown'));
  $('quick-pick-undo').addEventListener('click', undoQuickPickChoice);
  $('quick-pick-review-undo').addEventListener('click', undoQuickPickChoice);
  $('quick-pick-select-all').addEventListener('click', () => setQuickPickSelection(true));
  $('quick-pick-select-none').addEventListener('click', () => setQuickPickSelection(false));
  $('quick-pick-add-selected').addEventListener('click', addQuickPickSelection);
  $('quick-pick-skip').addEventListener('click', () => finishQuickPick('Слова не добавлены'));
  $('flashcard').addEventListener('click', () => { session.flipped = !session.flipped; renderExercise(); });
  $('next-button').addEventListener('click', nextCard);
  $('quiz-next-button').addEventListener('click', nextCard);
  $('typing-next-button').addEventListener('click', nextCard);
  $('typing-form').addEventListener('submit', (event) => { event.preventDefault(); answerTyping(); });
  $('exit-study-button').addEventListener('click', () => setPhase('feed'));
  $('repeat-button').addEventListener('click', () => startStudy());
  $('finish-mode-button').addEventListener('click', () => setPhase('feed'));
  document.addEventListener('keydown', (event) => {
    if (activeTab !== 'cards' || session.phase !== 'play') return;
    if (event.key === 'Escape') { event.preventDefault(); setPhase('feed'); return; }
    if (session.mechanic !== 'cards' || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); nextCard(); }
    if (event.key === ' ' && document.activeElement === document.body) { event.preventDefault(); $('flashcard').click(); }
  });

  // Keep the Mini App at its native scale inside Telegram's iOS WebView.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
  });
  document.addEventListener('touchmove', (event) => {
    if (event.touches.length > 1) event.preventDefault();
  }, { passive: false });

  // Telegram provides this object when the page is opened from a bot's Web App button.
  window.addEventListener('load', () => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    if (webApp.initData) {
      document.documentElement.classList.add('telegram-app');
      syncTelegramProfile(webApp);
    }
    webApp.ready();
    webApp.expand();
    if (webApp.isVersionAtLeast?.('8.0') && !webApp.isFullscreen) webApp.requestFullscreen?.();
    if (webApp.isVersionAtLeast?.('7.7')) webApp.disableVerticalSwipes?.();
    webApp.setHeaderColor?.('#f3f5f2');
    webApp.setBackgroundColor?.('#f3f5f2');
  });

  // Supported browsers can expose the same dictionary actions to an assistant.
  const context = document.modelContext;
  if (context?.registerTool) {
    try {
      Promise.resolve(context.registerTool({
        name: 'list_words', title: 'Показать словарь', description: 'Вернуть слова, сохранённые в личном словаре Вордика.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => ({
          words: words.map((word) => ({
            english: word.english,
            russian: word.russian,
            difficulty: word.difficulty,
            cefr: word.cefr_level,
            knowledge: Number(currentKnowledge(word).toFixed(4)),
          })),
        }),
      })).catch(() => {});
      Promise.resolve(context.registerTool({
        name: 'add_word', title: 'Добавить слово', description: 'Сохранить английское слово и его русский перевод в личном словаре Вордика.',
        inputSchema: { type: 'object', properties: { english: { type: 'string', maxLength: 80 }, russian: { type: 'string', maxLength: 120 } }, required: ['english', 'russian'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: (input) => {
          if (!input || typeof input.english !== 'string' || typeof input.russian !== 'string') throw new Error('Укажите слово и перевод.');
          const word = addWord(input.english, input.russian);
          return { english: word.english, russian: word.russian, saved: true };
        },
      })).catch(() => {});
    } catch { /* Browser support is optional. */ }
  }

  renderReadyCollections();
  renderDictionary();
  loadDifficultyData();
  renderStreak();
  renderProfile();
  updateQuickPickLaunch();
})();
