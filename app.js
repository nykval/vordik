(() => {
  'use strict';

  const STORAGE_KEY = 'vordik.words.v1';
  const STUDY_DAYS_KEY = 'vordik.studyDays.v1';
  const PROFILE_KEY = 'vordik.profile.v1';
  const PROFILE_STATS_KEY = 'vordik.profileStats.v1';
  const RATING_GUEST_ID_KEY = 'vordik.ratingGuestId.v1';
  const QUICK_PICK_KNOWN_KEY = 'vordik.quickPickKnown.v1';
  const QUICK_PICK_SESSION_KEY = 'vordik.quickPickSession.v1';
  const QUICK_PICK_WORD_COUNT = 15;
  const STUDY_SERIES_SIZE = 15;
  const FIVE_LETTER_ATTEMPTS = 7;
  const PUZZLE_WORD_COUNT = 3;
  const KNOWLEDGE_MAX = 10;
  const KNOWLEDGE_SCALE_VERSION = 10;
  const KNOWLEDGE_GAIN_BY_DIFFICULTY = Object.freeze([0, 4, 3, 3, 2, 2, 1]);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const AVATAR_OPTIONS = Object.freeze([
    { id: 'avatar-blond-green', label: 'Аватар 1', src: './icons/avatars-pack/avatar-blond-green.png?v=2' },
    { id: 'avatar-bob-blue', label: 'Аватар 2', src: './icons/avatars-pack/avatar-bob-blue.png?v=2' },
    { id: 'avatar-bun-pink', label: 'Аватар 3', src: './icons/avatars-pack/avatar-bun-pink.png?v=2' },
    { id: 'avatar-cat', label: 'Аватар 4', src: './icons/avatars-pack/avatar-cat.png?v=2' },
    { id: 'avatar-curly-yellow', label: 'Аватар 5', src: './icons/avatars-pack/avatar-curly-yellow.png?v=2' },
    { id: 'avatar-dog', label: 'Аватар 6', src: './icons/avatars-pack/avatar-dog.png?v=2' },
    { id: 'avatar-frog', label: 'Аватар 7', src: './icons/avatars-pack/avatar-frog.png?v=2' },
    { id: 'avatar-panda', label: 'Аватар 8', src: './icons/avatars-pack/avatar-panda.png?v=2' },
    { id: 'avatar-rabbit', label: 'Аватар 9', src: './icons/avatars-pack/avatar-rabbit.png?v=2' },
    { id: 'avatar-short-hair-cyan', label: 'Аватар 10', src: './icons/avatars-pack/avatar-short-hair-cyan.png?v=2' },
  ]);
  const avatarById = new Map(AVATAR_OPTIONS.map((avatar) => [avatar.id, avatar]));
  const CEFR_DIFFICULTY = Object.freeze({ A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 });
  const commonAudioFiles = new Set(Array.isArray(window.VORDIK_COMMON_AUDIO_FILES) ? window.VORDIK_COMMON_AUDIO_FILES : []);
  const wordCatalog = Array.isArray(window.VORDIK_WORD_CATALOG) ? window.VORDIK_WORD_CATALOG : [];
  const commonWords = [];
  const commonWordById = new Map();
  const commonWordByPair = new Map();
  const commonWordsByWord = new Map();
  wordCatalog.forEach((entry, index) => {
    const cefr = normalizeCefr(entry.cefr);
    const word = normalizeDictionaryText(entry.word, 'en-US');
    const rawTranslations = Array.isArray(entry.translations) ? entry.translations : [entry.translation];
    const translations = [...new Set(rawTranslations
      .map((translation) => normalizeDictionaryText(translation, 'ru-RU'))
      .filter(Boolean))];
    if (!word || !translations.length || !cefr) return;
    const commonWord = {
      id: String(entry.id || `common-${String(index + 1).padStart(5, '0')}`),
      word,
      translations,
      partOfSpeech: normalizeDictionaryText(entry.partOfSpeech, 'ru-RU') || null,
      cefr,
      difficulty: CEFR_DIFFICULTY[cefr],
      audio: commonAudioSource(word),
    };
    commonWords.push(commonWord);
    commonWordById.set(commonWord.id, commonWord);
    const sameSpelling = commonWordsByWord.get(commonWord.word) ?? [];
    sameSpelling.push(commonWord);
    commonWordsByWord.set(commonWord.word, sameSpelling);
    commonWord.translations.forEach((translation) => {
      const key = difficultyKey(commonWord.word, translation);
      if (!commonWordByPair.has(key)) commonWordByPair.set(key, commonWord);
    });
  });
  const sampleWords = [];
  const wordCollections = Array.isArray(window.VORDIK_COLLECTIONS) ? window.VORDIK_COLLECTIONS : [];
  const rawQuickPickWords = Array.isArray(window.VORDIK_QUICK_PICK_WORDS) ? window.VORDIK_QUICK_PICK_WORDS : [];
  const legacyQuickPickCommonByPair = new Map();
  const quickPickCommonIds = new Set();
  const quickPickWords = rawQuickPickWords.map((source) => {
    const commonWord = resolveQuickPickCommonWord(source);
    if (!commonWord) return null;
    legacyQuickPickCommonByPair.set(difficultyKey(source.english, source.russian), commonWord.id);
    if (quickPickCommonIds.has(commonWord.id)) return null;
    quickPickCommonIds.add(commonWord.id);
    return {
      id: source.id,
      english: commonWord.word,
      russian: commonWord.translations[0],
      translations: [...commonWord.translations],
      commonWordId: commonWord.id,
      audio: commonWord.audio,
    };
  }).filter(Boolean);
  const $ = (id) => document.getElementById(id);
  const words = loadWords();
  const studyDays = loadStudyDays();
  const userProfile = loadProfile();
  const profileStats = loadProfileStats();
  const ratingGuestId = loadRatingGuestId();
  const configuredRatingApiBase = document.querySelector('meta[name="vordik-api-base"]')?.content.trim().replace(/\/+$/, '') ?? '';
  let appVisibleStartedAt = document.hidden ? 0 : Date.now();
  const quickPickKnown = loadQuickPickKnown();
  let quickPickSession = loadQuickPickSession();
  const session = { mechanic: 'cards', ids: [], translations: new Map(), index: 0, flipped: false, answered: false, correctCount: 0, attemptCount: 0, phase: 'feed', startedAt: 0, statsRecorded: false };
  const fiveLetterGame = { answer: '', guesses: [], current: '', finished: false, won: false, message: '', result: '' };
  const puzzleGame = { roundKey: '', pieceOrder: [], solvedIds: new Set(), mistakeIds: new Set(), selectedId: null, pendingWrong: null, message: '', result: '' };
  let activeTab = 'home';
  let toastTimer;
  let activeAudio = null;
  let sortMode = 'recent';
  let dictionarySearchQuery = '';
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
  let puzzleFeedbackTimer;
  let timedDeadline = 0;
  let timedLocked = false;
  let quickPickAnimating = false;
  let quickPickFlipped = false;
  let quickPickSuppressClick = false;
  let ratingRequestVersion = 0;

  function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return [year, month, day].join('-');
  }

  function clampKnowledge(value) {
    return Math.min(KNOWLEDGE_MAX, Math.max(1, Math.round(Number(value) || 1)));
  }

  function normalizeStoredKnowledge(value, scaleVersion) {
    const numeric = Number(value) || 0;
    if (scaleVersion === KNOWLEDGE_SCALE_VERSION) return clampKnowledge(numeric);
    if (numeric >= 0 && numeric <= 1) return clampKnowledge(numeric * KNOWLEDGE_MAX);
    return clampKnowledge(numeric);
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

  function commonAudioSource(word) {
    const fileName = `${normalizeDictionaryText(word, 'en-US').replace(/\s+/g, '')}1.mp3`;
    return commonAudioFiles.has(fileName) ? `./audio/common/${encodeURIComponent(fileName)}` : null;
  }

  function commonWordForPair(english, russian) {
    const normalizedEnglish = normalizeDictionaryText(english, 'en-US');
    const exactMatch = commonWordByPair.get(difficultyKey(normalizedEnglish, russian));
    if (exactMatch || normalizedEnglish.startsWith('to ')) return exactMatch ?? null;
    return commonWordByPair.get(difficultyKey(`to ${normalizedEnglish}`, russian)) ?? null;
  }

  function resolveQuickPickCommonWord(source) {
    const english = normalizeDictionaryText(source?.english, 'en-US');
    const russian = normalizeDictionaryText(source?.russian, 'ru-RU');
    const exactMatch = commonWordForPair(english, russian);
    if (exactMatch) return exactMatch;
    const candidates = [
      ...(commonWordsByWord.get(english) ?? []),
      ...(english.startsWith('to ') ? [] : (commonWordsByWord.get(`to ${english}`) ?? [])),
    ];
    return candidates.find((candidate) => candidate.translations.includes(russian)) ?? candidates[0] ?? null;
  }

  function wordTranslations(word) {
    const values = Array.isArray(word?.translations) && word.translations.length
      ? word.translations
      : [word?.russian];
    return [...new Set(values
      .map((translation) => normalizeDictionaryText(translation, 'ru-RU'))
      .filter(Boolean))];
  }

  function hasUserWordPair(list, english, russian) {
    const normalizedEnglish = normalizeDictionaryText(english, 'en-US');
    const normalizedRussian = normalizeDictionaryText(russian, 'ru-RU');
    const commonWord = commonWordForPair(normalizedEnglish, normalizedRussian);
    return list.some((word) => {
      if (commonWord && word.common_word_id === commonWord.id) return true;
      return word.english === normalizedEnglish && wordTranslations(word).includes(normalizedRussian);
    });
  }

  function randomTranslation(word, excluded = null) {
    const translations = shuffled(wordTranslations(word));
    return translations.find((translation) => !excluded?.has(translation))
      ?? translations[0]
      ?? normalizeDictionaryText(word?.russian, 'ru-RU');
  }

  function assignDistinctPuzzleTranslations(ids, index, assignments, used) {
    if (index >= ids.length) return true;
    const word = words.find((entry) => entry.id === ids[index]);
    if (!word) return assignDistinctPuzzleTranslations(ids, index + 1, assignments, used);
    const options = shuffled(wordTranslations(word)).filter((translation) => !used.has(translation));
    for (const translation of options) {
      assignments.set(word.id, translation);
      used.add(translation);
      if (assignDistinctPuzzleTranslations(ids, index + 1, assignments, used)) return true;
      assignments.delete(word.id);
      used.delete(translation);
    }
    return false;
  }

  function initializeSessionTranslations() {
    session.translations = new Map();
    if (session.mechanic === 'puzzle') {
      let allRoundsAssigned = true;
      for (let index = 0; index < session.ids.length; index += PUZZLE_WORD_COUNT) {
        const roundAssignments = new Map();
        const roundIds = session.ids.slice(index, index + PUZZLE_WORD_COUNT);
        if (!assignDistinctPuzzleTranslations(roundIds, 0, roundAssignments, new Set())) {
          allRoundsAssigned = false;
          break;
        }
        roundAssignments.forEach((translation, id) => session.translations.set(id, translation));
      }
      if (allRoundsAssigned) return;
      session.translations.clear();
    }
    const usedPuzzleTranslations = new Set();
    session.ids.forEach((id) => {
      const word = words.find((entry) => entry.id === id);
      if (!word) return;
      const translation = randomTranslation(word, session.mechanic === 'puzzle' ? usedPuzzleTranslations : null);
      session.translations.set(id, translation);
      if (session.mechanic === 'puzzle') usedPuzzleTranslations.add(translation);
    });
  }

  function studyTranslation(word) {
    if (!session.translations.has(word.id)) session.translations.set(word.id, randomTranslation(word));
    return session.translations.get(word.id);
  }

  function findStoredCommonWord(word, english, russian, allowLegacyQuickPickMigration = false) {
    const storedId = typeof word.common_word_id === 'string'
      ? word.common_word_id
      : (typeof word.commonWordId === 'string' ? word.commonWordId : null);
    const storedCommonWord = storedId ? commonWordById.get(storedId) : null;
    if (storedCommonWord?.word === english) return storedCommonWord;
    const exactMatch = commonWordForPair(english, russian);
    if (exactMatch) return exactMatch;
    if (allowLegacyQuickPickMigration) {
      const legacyCommonId = legacyQuickPickCommonByPair.get(difficultyKey(english, russian));
      const legacyCommonWord = legacyCommonId ? commonWordById.get(legacyCommonId) : null;
      if (legacyCommonWord) return legacyCommonWord;
    }
    if (word.source) return null;
    const legacyTranslations = russian.split(',').map((translation) => normalizeDictionaryText(translation, 'ru-RU'));
    return legacyTranslations.map((translation) => commonWordForPair(english, translation)).find(Boolean) ?? null;
  }

  function normalizeWordRecord(word, initialKnowledge = 1, allowLegacyQuickPickMigration = false) {
    const english = normalizeDictionaryText(word.english, 'en-US').slice(0, 80);
    const enteredRussian = normalizeDictionaryText(word.russian, 'ru-RU').slice(0, 120);
    const commonWord = findStoredCommonWord(word, english, enteredRussian, allowLegacyQuickPickMigration);
    const translations = commonWord ? [...commonWord.translations] : [enteredRussian].filter(Boolean);
    return {
      id: word.id,
      english: commonWord?.word ?? english,
      russian: translations.join(', '),
      translations,
      source: commonWord ? 'common' : 'custom',
      common_word_id: commonWord?.id ?? null,
      part_of_speech: commonWord?.partOfSpeech ?? null,
      difficulty: commonWord?.difficulty ?? null,
      cefr_level: commonWord?.cefr ?? null,
      audio: commonWord?.audio ?? null,
      knowledge: normalizeStoredKnowledge(word.knowledge ?? initialKnowledge, word.knowledge_scale),
      knowledge_scale: KNOWLEDGE_SCALE_VERSION,
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

  function createWordRecord(id, english, russian, initialKnowledge = 1) {
    return normalizeWordRecord({ id, english, russian, knowledge: initialKnowledge, knowledge_scale: KNOWLEDGE_SCALE_VERSION }, initialKnowledge);
  }

  function currentKnowledge(word, now = Date.now()) {
    return clampKnowledge(word.knowledge);
  }

  function knowledgeDescription(knowledge) {
    if (knowledge <= 2) return 'начинает узнавать';
    if (knowledge <= 4) return 'частично знает';
    if (knowledge <= 6) return 'хорошо знает';
    if (knowledge <= 8) return 'уверенно знает';
    if (knowledge < KNOWLEDGE_MAX) return 'почти освоено';
    return 'освоено';
  }

  function calendarDayDifference(fromIso, toDate) {
    const from = new Date(fromIso);
    if (Number.isNaN(from.getTime())) return null;
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
    return Math.round((end - start) / DAY_MS);
  }

  function correctKnowledgeGain(word, knowledge) {
    if (knowledge >= 8) return 1;
    const difficulty = Math.min(6, Math.max(1, Math.round(Number(word.difficulty) || 1)));
    const baseGain = KNOWLEDGE_GAIN_BY_DIFFICULTY[difficulty];
    const taperedGain = knowledge >= 5 ? Math.min(baseGain, 2) : baseGain;
    const consecutiveCorrectBonus = word.last_result === 'correct' ? 1 : 0;
    return Math.max(1, taperedGain + consecutiveCorrectBonus);
  }

  function wrongKnowledgePenalty(word) {
    return word.last_result === 'wrong' ? 2 : 1;
  }

  function recordWordReview(word, correct) {
    if (!word) return;
    const now = new Date();
    const today = localDateKey(now);
    const knowledgeBefore = currentKnowledge(word, now.getTime());
    if (word.reviews_today_date !== today) {
      word.reviews_today_date = today;
      word.reviews_today = 0;
    }
    const knowledgeDelta = correct
      ? correctKnowledgeGain(word, knowledgeBefore)
      : -wrongKnowledgePenalty(word);
    const knowledgeAfter = clampKnowledge(knowledgeBefore + knowledgeDelta);
    if (correct) {
      const reviewNumber = word.reviews_today + 1;
      const correctDayGap = word.last_correct_at ? calendarDayDifference(word.last_correct_at, now) : null;
      const isFirstCorrectToday = correctDayGap !== 0;
      if (isFirstCorrectToday) {
        word.correct_streak = correctDayGap === 1 ? word.correct_streak + 1 : 1;
      }
      word.reviews_today = reviewNumber;
      word.correct_answers += 1;
      word.last_correct_at = now.toISOString();
    } else {
      word.wrong_answers += 1;
      word.correct_streak = 0;
    }
    word.knowledge = knowledgeAfter;
    word.knowledge_scale = KNOWLEDGE_SCALE_VERSION;
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
    const fallback = { name: 'Пользователь Вордик', joinedAt: new Date().toISOString(), avatarId: randomAvatarId() };
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null');
      const profile = {
        name: typeof saved?.name === 'string' && saved.name.trim() ? saved.name.trim().slice(0, 80) : fallback.name,
        joinedAt: typeof saved?.joinedAt === 'string' && !Number.isNaN(Date.parse(saved.joinedAt)) ? saved.joinedAt : fallback.joinedAt,
        avatarId: avatarById.has(saved?.avatarId) ? saved.avatarId : fallback.avatarId,
        avatarCustomized: saved?.avatarCustomized === true,
      };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      return profile;
    } catch { return fallback; }
  }

  function loadRatingGuestId() {
    try {
      const stored = localStorage.getItem(RATING_GUEST_ID_KEY);
      if (stored && /^[a-zA-Z0-9_-]{8,100}$/.test(stored)) return stored;
      const generated = globalThis.crypto?.randomUUID?.().replaceAll('-', '')
        ?? `guest${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(RATING_GUEST_ID_KEY, generated);
      return generated;
    } catch {
      return `guest${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    }
  }

  function loadProfileStats() {
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_STATS_KEY) ?? 'null');
      const totalSessionMs = Math.max(0, Math.floor(Number(saved?.totalSessionMs) || 0));
      return {
        sessionsCompleted: Math.max(0, Math.floor(Number(saved?.sessionsCompleted) || 0)),
        totalSessionMs,
        totalAppMs: Math.max(totalSessionMs, Math.floor(Number(saved?.totalAppMs) || 0)),
      };
    } catch { return { sessionsCompleted: 0, totalSessionMs: 0, totalAppMs: 0 }; }
  }

  function saveProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(userProfile)); } catch { /* Profile remains available for this visit. */ }
  }

  function saveProfileStats() {
    try { localStorage.setItem(PROFILE_STATS_KEY, JSON.stringify(profileStats)); } catch { /* Stats remain available for this visit. */ }
  }

  function randomAvatarId() {
    return AVATAR_OPTIONS[Math.floor(Math.random() * AVATAR_OPTIONS.length)].id;
  }

  function avatarSource(avatarId) {
    return avatarById.get(avatarId)?.src ?? AVATAR_OPTIONS[0].src;
  }

  function createAvatarImage(avatarId) {
    const image = document.createElement('img');
    image.src = avatarSource(avatarId);
    image.alt = '';
    image.width = 700;
    image.height = 525;
    return image;
  }

  function deterministicAvatarId(value) {
    let hash = 2166136261;
    for (const character of String(value ?? '')) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return AVATAR_OPTIONS[(hash >>> 0) % AVATAR_OPTIONS.length].id;
  }

  function ratingAvatarId(entry) {
    if (entry?.isMe) return userProfile.avatarId;
    if (entry?.avatarCustomized === true && avatarById.has(entry?.avatarId)) return entry.avatarId;
    return deterministicAvatarId(`${entry?.name ?? ''}:${entry?.rank ?? ''}`);
  }

  function renderAvatarPicker() {
    const fragment = document.createDocumentFragment();
    AVATAR_OPTIONS.forEach((avatar) => {
      const button = document.createElement('button');
      button.className = 'avatar-option';
      button.type = 'button';
      button.dataset.avatarId = avatar.id;
      button.setAttribute('aria-label', avatar.label);
      button.setAttribute('aria-pressed', String(avatar.id === userProfile.avatarId));
      button.classList.toggle('is-selected', avatar.id === userProfile.avatarId);
      button.append(createAvatarImage(avatar.id));
      fragment.append(button);
    });
    $('avatar-options').replaceChildren(fragment);
  }

  function setAvatarPickerOpen(open, restoreFocus = true) {
    $('avatar-picker-overlay').hidden = !open;
    document.body.classList.toggle('is-avatar-picker-open', open);
    if (open) {
      renderAvatarPicker();
      requestAnimationFrame(() => $('avatar-options').querySelector('.is-selected')?.focus());
    } else if (restoreFocus && activeTab === 'profile') {
      $('profile-avatar-button').focus();
    }
  }

  function selectAvatar(avatarId) {
    if (!avatarById.has(avatarId) || (avatarId === userProfile.avatarId && userProfile.avatarCustomized)) return;
    userProfile.avatarId = avatarId;
    userProfile.avatarCustomized = true;
    saveProfile();
    renderProfile();
    renderAvatarPicker();
    void syncRating({ silent: true });
    showToast('Аватар обновлён');
  }

  function currentAppUsageMs() {
    return profileStats.totalAppMs + (appVisibleStartedAt ? Math.max(0, Date.now() - appVisibleStartedAt) : 0);
  }

  function commitAppUsage() {
    if (!appVisibleStartedAt) return;
    profileStats.totalAppMs += Math.max(0, Date.now() - appVisibleStartedAt);
    appVisibleStartedAt = 0;
    saveProfileStats();
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
    const vocabularyLevel = vocabularyScore();
    const streak = streakLength();
    if ($('home-greeting')) $('home-greeting').textContent = `Привет, ${userProfile.name}!`;
    $('profile-name').textContent = userProfile.name;
    $('profile-avatar-image').src = avatarSource(userProfile.avatarId);
    $('profile-button-avatar').src = avatarSource(userProfile.avatarId);
    $('profile-avatar-button').setAttribute('aria-label', `Выбрать аватар. Сейчас ${avatarById.get(userProfile.avatarId)?.label ?? 'выбранный аватар'}`);
    $('profile-joined').textContent = joinedLabel(userProfile.joinedAt);
    $('profile-average-time').textContent = durationLabel(averageMs);
    $('profile-total-time').textContent = durationLabel(currentAppUsageMs());
    $('profile-vocabulary-level').textContent = `${vocabularyLevel} ${pointNoun(vocabularyLevel)}`;
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
    void syncRating({ silent: activeTab !== 'rating' });
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
        .map((word) => normalizeWordRecord(word, 1, true))
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
    return String(value ?? '')
      .trim()
      .replace(/[’‘`´]/g, "'")
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase(locale);
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

  function stopActiveAudio() {
    if (!activeAudio) return;
    activeAudio.pause();
    activeAudio = null;
  }

  function speakWord(word, { silent = false } = {}) {
    if (!word?.audio) {
      if (!silent) showToast('Для этого слова озвучка пока не добавлена');
      return;
    }
    try {
      stopActiveAudio();
      const audio = new Audio(word.audio);
      activeAudio = audio;
      let failed = false;
      const handleFailure = () => {
        if (failed) return;
        failed = true;
        if (activeAudio === audio) activeAudio = null;
        if (!silent) showToast('Не удалось воспроизвести озвучку');
      };
      audio.onended = () => { if (activeAudio === audio) activeAudio = null; };
      audio.onerror = handleFailure;
      void audio.play().catch(handleFailure);
    } catch {
      activeAudio = null;
      if (!silent) showToast('Не удалось воспроизвести озвучку');
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
    const hasMissingWords = collection.words.some(([english, russian]) => !hasUserWordPair(words, english, russian));
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
    const additions = [];
    collection.words.forEach(([englishValue, russianValue], index) => {
      const english = normalizeDictionaryText(englishValue, 'en-US');
      const russian = normalizeDictionaryText(russianValue, 'ru-RU');
      if (hasUserWordPair([...words, ...additions], english, russian)) return;
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
    const currentVocabularyScore = vocabularyScore(now);
    const scoreText = String(currentVocabularyScore);
    const scoreElement = $('home-vocabulary-score');
    scoreElement.textContent = scoreText;
    scoreElement.dataset.digits = String(Math.min(Math.max(scoreText.replace(/\D/g, '').length, 1), 6));
    $('home-vocabulary-score-unit').textContent = pointNoun(currentVocabularyScore);
    const normalizedQuery = dictionarySearchQuery.trim().toLocaleLowerCase('ru-RU');
    const filteredWords = normalizedQuery
      ? words.filter((word) => word.english.toLocaleLowerCase('en-US').includes(normalizedQuery)
        || word.russian.toLocaleLowerCase('ru-RU').includes(normalizedQuery))
      : words;
    $('word-count').textContent = filteredWords.length;
    $('word-count-noun').textContent = wordNoun(filteredWords.length);
    $('dictionary-empty').hidden = words.length !== 0;
    $('dictionary-search-empty').hidden = words.length === 0 || filteredWords.length !== 0;
    $('word-list').hidden = words.length === 0 || filteredWords.length === 0;
    const displayedWords = sortMode === 'alphabetical'
      ? [...filteredWords].sort((a, b) => a.english.localeCompare(b.english, 'en', { sensitivity: 'base' }))
      : filteredWords;
    const fragment = document.createDocumentFragment();
    displayedWords.forEach((word) => {
      const row = document.createElement('div');
      row.className = 'dictionary-word-row';
      row.setAttribute('role', 'listitem');
      const listen = document.createElement('button');
      listen.className = 'listen-button';
      listen.type = 'button';
      listen.disabled = !word.audio;
      listen.setAttribute('aria-label', word.audio ? `Произнести ${word.english}` : `Озвучка слова ${word.english} пока не добавлена`);
      listen.title = word.audio ? `Произнести ${word.english}` : 'Озвучка пока не добавлена';
      const speaker = document.createElement('img');
      speaker.src = './icons/speaker-user.svg';
      speaker.alt = '';
      speaker.setAttribute('aria-hidden', 'true');
      listen.append(speaker);
      listen.addEventListener('click', () => speakWord(word));
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
      const difficultyLevel = normalizeCefr(word.cefr_level);
      if (difficultyLevel) {
        const difficulty = document.createElement('span');
        difficulty.className = 'dictionary-word-metric is-difficulty';
        const difficultyIcon = document.createElement('img');
        difficultyIcon.className = 'dictionary-difficulty-icon';
        difficultyIcon.src = `./icons/indicator-pack/cropped/all-indicators-cropped/levels/level-${difficultyLevel.toLocaleLowerCase('en-US')}.png?v=1`;
        difficultyIcon.alt = '';
        difficultyIcon.setAttribute('aria-hidden', 'true');
        difficulty.append(difficultyIcon);
        difficulty.title = `Сложность ${word.difficulty} из 6`;
        difficulty.setAttribute('aria-label', `Сложность: ${difficultyLevel}`);
        metrics.append(difficulty);
      }
      const knowledgeMetric = document.createElement('span');
      knowledgeMetric.className = 'dictionary-word-metric is-knowledge';
      const knowledgeLevel = currentKnowledge(word, now);
      const knowledgeIcon = document.createElement('img');
      knowledgeIcon.className = 'dictionary-knowledge-icon';
      knowledgeIcon.src = `./icons/indicator-pack/cropped/all-indicators-cropped/knowledge/knowledge-${String(knowledgeLevel).padStart(2, '0')}.png?v=1`;
      knowledgeIcon.alt = '';
      knowledgeIcon.setAttribute('aria-hidden', 'true');
      knowledgeMetric.append(knowledgeIcon);
      knowledgeMetric.title = knowledgeDescription(knowledge);
      knowledgeMetric.setAttribute('aria-label', `Уровень знания: ${knowledgeLevel} из ${KNOWLEDGE_MAX}`);
      metrics.append(knowledgeMetric);
      copy.append(english, russian);
      row.append(listen, copy, metrics);
      fragment.append(row);
    });
    $('word-list').replaceChildren(fragment);
    $('typing-start').disabled = words.length === 0;
    document.querySelector('[data-study="cards"]').disabled = words.length === 0;
    const availableTranslations = new Set(words.flatMap((word) => wordTranslations(word)));
    const hasQuizOptions = availableTranslations.size >= 2;
    $('quiz-start').disabled = !hasQuizOptions;
    $('quiz-start').setAttribute('aria-label', hasQuizOptions ? 'Выбрать перевод: начать тренировку' : 'Для выбора перевода нужны хотя бы два разных перевода в словаре');
    const hasTimedOptions = availableTranslations.size >= 2;
    $('timed-start').disabled = !hasTimedOptions;
    $('timed-start').setAttribute('aria-label', hasTimedOptions ? 'Перевод на время: начать тренировку с запасом 15 секунд' : 'Для перевода на время нужны хотя бы два разных слова в словаре');
    const hasFiveLetterWords = words.some((word) => /^[a-z]{5}$/i.test(word.english.trim()));
    $('five-letter-start').disabled = !hasFiveLetterWords;
    $('five-letter-start').setAttribute('aria-label', hasFiveLetterWords ? 'Пять букв: начать игру' : 'Для игры добавьте в словарь английское слово из пяти букв');
    const hasPuzzleWords = availableTranslations.size >= PUZZLE_WORD_COUNT && words.length >= PUZZLE_WORD_COUNT;
    $('puzzle-start').disabled = !hasPuzzleWords;
    $('puzzle-start').setAttribute('aria-label', hasPuzzleWords ? 'Пазлы: соединить три слова с переводами' : 'Для пазлов нужны хотя бы три слова с разными переводами');
    $('study-empty-hint').hidden = words.length !== 0;
  }

  function wordNoun(count) {
    const ending = count % 100;
    if (ending >= 11 && ending <= 14) return 'слов';
    if (count % 10 === 1) return 'слово';
    if (count % 10 >= 2 && count % 10 <= 4) return 'слова';
    return 'слов';
  }

  function attemptNoun(count) {
    const ending = Math.abs(count) % 100;
    if (ending >= 11 && ending <= 14) return 'попыток';
    if (Math.abs(count) % 10 === 1) return 'попытка';
    if (Math.abs(count) % 10 >= 2 && Math.abs(count) % 10 <= 4) return 'попытки';
    return 'попыток';
  }

  function pointNoun(value) {
    if (!Number.isInteger(value)) return 'балла';
    const ending = Math.abs(value) % 100;
    if (ending >= 11 && ending <= 14) return 'баллов';
    if (Math.abs(value) % 10 === 1) return 'балл';
    if (Math.abs(value) % 10 >= 2 && Math.abs(value) % 10 <= 4) return 'балла';
    return 'баллов';
  }

  function userNoun(count) {
    const ending = Math.abs(count) % 100;
    if (ending >= 11 && ending <= 14) return 'пользователей';
    if (Math.abs(count) % 10 === 1) return 'пользователя';
    return 'пользователей';
  }

  function vocabularyScore(now = Date.now()) {
    return words.reduce((total, word) => total + ((Number(word.difficulty) || 1) * currentKnowledge(word, now)), 0);
  }

  function ratingApiUrl(path) {
    return configuredRatingApiBase ? `${configuredRatingApiBase}${path}` : path;
  }

  function renderRatingPodium(leaders) {
    const podium = $('rating-podium');
    const places = [2, 1, 3];
    const classes = ['is-second', 'is-first', 'is-third'];
    const fragment = document.createDocumentFragment();
    places.forEach((place, index) => {
      const entry = leaders[place - 1];
      const item = document.createElement('article');
      item.className = `rating-podium-player ${classes[index]}`;
      if (entry?.isMe) item.classList.add('is-me');

      const medal = document.createElement('span');
      medal.className = 'rating-podium-medal';
      medal.textContent = String(place);

      const avatar = document.createElement('span');
      avatar.className = 'rating-podium-avatar';
      if (entry) avatar.append(createAvatarImage(ratingAvatarId(entry)));
      else avatar.textContent = '?';

      const name = document.createElement('strong');
      name.textContent = entry ? (entry.isMe ? `${entry.name} · вы` : entry.name) : 'Свободное место';

      const points = document.createElement('small');
      const score = Math.max(0, Number(entry?.score) || 0);
      points.textContent = `${score} ${pointNoun(score)}`;

      item.append(medal, avatar, name, points);
      fragment.append(item);
    });
    podium.replaceChildren(fragment);
  }

  function renderRatingLeaderboard(result) {
    const player = result?.player;
    const totalPlayers = Math.max(0, Number(result?.totalPlayers) || 0);
    const leaders = Array.isArray(result?.leaders) ? result.leaders : [];
    const score = Math.max(0, Number(player?.score) || vocabularyScore());
    $('profile-rating-rank').textContent = player?.rank ? `#${player.rank}` : '—';
    $('profile-rating-total').textContent = totalPlayers
      ? `Среди ${totalPlayers} ${userNoun(totalPlayers)}`
      : 'Среди пользователей Вордика';
    $('profile-rating-score').textContent = `${score} ${pointNoun(score)}`;
    renderRatingPodium(leaders);

    const shown = leaders.slice(0, 10);
    if (player?.rank > 10 && !shown.some((entry) => entry.isMe)) shown.push(player);
    const fragment = document.createDocumentFragment();
    shown.forEach((entry, index) => {
      const item = document.createElement('li');
      item.className = 'rating-player';
      if (entry.isMe) item.classList.add('is-me');
      if (index === 10) item.classList.add('is-separated');

      const rank = document.createElement('span');
      rank.className = 'rating-player-rank';
      rank.textContent = String(entry.rank);

      const avatar = document.createElement('span');
      avatar.className = 'rating-player-avatar';
      avatar.append(createAvatarImage(ratingAvatarId(entry)));

      const identity = document.createElement('span');
      identity.className = 'rating-player-identity';
      const name = document.createElement('strong');
      name.textContent = entry.isMe ? `${entry.name} · вы` : entry.name;
      const details = document.createElement('small');
      const vocabularySize = Math.max(0, Number(entry.vocabularySize) || 0);
      details.textContent = `${vocabularySize} ${wordNoun(vocabularySize)} в словаре`;
      identity.append(name, details);

      const points = document.createElement('b');
      const entryScore = Math.max(0, Number(entry.score) || 0);
      points.textContent = String(entryScore);
      points.title = `${entryScore} ${pointNoun(entryScore)}`;
      item.append(rank, avatar, identity, points);
      fragment.append(item);
    });
    $('profile-rating-list').replaceChildren(fragment);
  }

  async function syncRating({ silent = false } = {}) {
    const requestVersion = ++ratingRequestVersion;
    const card = document.querySelector('.rating-card');
    const status = $('profile-rating-status');
    const score = vocabularyScore();
    $('profile-rating-score').textContent = `${score} ${pointNoun(score)}`;
    card?.setAttribute('aria-busy', 'true');
    if (!silent) status.textContent = 'Обновляем рейтинг…';
    try {
      const response = await fetch(ratingApiUrl('/api/ratings/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramInitData: window.Telegram?.WebApp?.initData ?? '',
          guestId: ratingGuestId,
          name: userProfile.name,
          avatarId: userProfile.avatarId,
          avatarCustomized: userProfile.avatarCustomized,
          score,
          vocabularySize: words.length,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Сервер рейтинга недоступен');
      if (requestVersion !== ratingRequestVersion) return;
      if (!userProfile.avatarCustomized && avatarById.has(result?.player?.avatarId) && result.player.avatarId !== userProfile.avatarId) {
        userProfile.avatarId = result.player.avatarId;
        saveProfile();
        renderProfile();
        if (!$('avatar-picker-overlay').hidden) renderAvatarPicker();
      }
      renderRatingLeaderboard(result);
      status.textContent = 'Рейтинг обновлён';
    } catch (error) {
      if (requestVersion !== ratingRequestVersion) return;
      if (!silent) status.textContent = error instanceof TypeError
        ? 'Не удалось подключиться к серверу рейтинга.'
        : (error.message || 'Не удалось обновить рейтинг.');
    } finally {
      if (requestVersion === ratingRequestVersion) card?.removeAttribute('aria-busy');
    }
  }

  function addWord(englishValue, russianValue) {
    const english = normalizeDictionaryText(englishValue, 'en-US');
    const russian = normalizeDictionaryText(russianValue, 'ru-RU');
    if (!english || !russian || english.length > 80 || russian.length > 120) throw new Error('Заполните оба поля: слово и перевод.');
    if (hasUserWordPair(words, english, russian)) {
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
      $('word-card-listen').disabled = !word.audio;
      $('word-card-listen').setAttribute('aria-label', word.audio ? `Произнести ${word.english}` : `Озвучка слова ${word.english} пока не добавлена`);
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
    if (word) speakWord(word);
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
    if (tab !== 'profile' && !$('avatar-picker-overlay').hidden) setAvatarPickerOpen(false, false);
    if (tab !== 'dictionary' && !$('sort-overlay').hidden) setSortOpen(false, false);
    if (tab !== 'dictionary' && !$('add-overlay').hidden) setAddPanel(false, false);
    if (tab !== 'home' && !$('collection-overlay').hidden) setCollectionOpen(false, activeCollectionId, false);
    if (tab !== 'dictionary' && !$('delete-overlay').hidden) setDeleteConfirm(false, pendingDeleteId, false);
    if (tab !== 'dictionary' && !$('word-card-overlay').hidden) setWordCardOpen(false, activeWordCardId, false);
    if (tab !== 'home' && !$('quick-pick-screen').hidden) closeQuickPick();
    activeTab = tab;
    document.body.classList.toggle('is-home', tab === 'home');
    document.body.classList.toggle('is-profile', tab === 'profile');
    const headerColor = '#f3f5f2';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', headerColor);
    window.Telegram?.WebApp?.setHeaderColor?.(headerColor);
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
    $('rating-view').hidden = tab !== 'rating';
    $('profile-view').hidden = tab !== 'profile';
    $('profile-button').setAttribute('aria-pressed', String(tab === 'profile'));
    if (tab === 'home' || tab === 'dictionary') renderDictionary();
    if (tab === 'profile') renderProfile();
    if (tab === 'rating') void syncRating();
    window.scrollTo(0, 0);
  }

  function setPhase(phase) {
    if (phase !== 'play' || session.mechanic !== 'timed') stopTimedRound();
    if (phase !== 'play' && session.mechanic === 'five-letter') $('five-letter-input')?.blur();
    if (phase !== 'play' && session.mechanic === 'puzzle') clearTimeout(puzzleFeedbackTimer);
    session.phase = phase;
    if (phase === 'finish') recordCompletedSession();
    document.body.classList.toggle('is-studying', phase === 'play');
    document.body.classList.toggle('is-quiz-studying', phase === 'play' && session.mechanic === 'quiz');
    document.body.classList.toggle('is-card-studying', phase === 'play' && session.mechanic === 'cards');
    document.body.classList.toggle('is-timed-studying', phase === 'play' && session.mechanic === 'timed');
    document.body.classList.toggle('is-five-letter-studying', phase === 'play' && session.mechanic === 'five-letter');
    document.body.classList.toggle('is-puzzle-studying', phase === 'play' && session.mechanic === 'puzzle');
    $('study-feed').hidden = phase !== 'feed';
    $('study-play').hidden = phase !== 'play';
    $('study-finish').hidden = phase !== 'finish';
    $('flashcard-activity').hidden = phase !== 'play' || session.mechanic !== 'cards';
    $('quiz-activity').hidden = phase !== 'play' || session.mechanic !== 'quiz';
    $('typing-activity').hidden = phase !== 'play' || session.mechanic !== 'typing';
    $('timed-activity').hidden = phase !== 'play' || session.mechanic !== 'timed';
    $('five-letter-activity').hidden = phase !== 'play' || session.mechanic !== 'five-letter';
    $('puzzle-activity').hidden = phase !== 'play' || session.mechanic !== 'puzzle';
    if (phase === 'finish') {
      $('finish-title').textContent = session.mechanic === 'timed'
        ? 'Время вышло!'
        : (session.mechanic === 'five-letter' ? (fiveLetterGame.won ? 'Слово угадано!' : 'Попытки закончились') : 'Готово!');
      $('finish-copy').textContent = session.mechanic === 'cards'
        ? `Вы повторили ${session.ids.length} ${wordNoun(session.ids.length)}.`
        : (session.mechanic === 'timed'
            ? `Верных ответов: ${session.correctCount}. Всего ответов: ${session.attemptCount}.`
            : (session.mechanic === 'five-letter'
                ? (fiveLetterGame.won
                    ? `Вы угадали слово ${fiveLetterGame.answer.toUpperCase()} ${fiveLetterGame.guesses.length === 1 ? 'за одну попытку' : `за ${fiveLetterGame.guesses.length} ${attemptNoun(fiveLetterGame.guesses.length)}`}.`
                    : `Загаданное слово: ${fiveLetterGame.answer.toUpperCase()}.`)
                : `Верных ответов: ${session.correctCount} из ${session.ids.length}.`));
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
    if (quickPickSession.index >= quickPickSession.deck.length) addAllQuickPickWords();
    else renderQuickPickCard();
    window.scrollTo(0, 0);
  }

  function closeQuickPick() {
    stopActiveAudio();
    saveQuickPickSession();
    document.body.classList.remove('is-picking');
    $('quick-pick-screen').hidden = true;
    updateQuickPickLaunch();
    window.scrollTo(0, 0);
  }

  function renderQuickPickCard() {
    if (!quickPickSession || quickPickSession.index >= quickPickSession.deck.length) {
      addAllQuickPickWords();
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
    $('quick-pick-translation').textContent = wordTranslations(word).join(', ');
    $('quick-pick-translation').hidden = true;
    $('quick-pick-card-hint').textContent = 'Нажмите, чтобы увидеть перевод';
    $('quick-pick-progress').textContent = `${quickPickSession.index + 1} из ${quickPickSession.deck.length}`;
    $('quick-pick-deck-view').hidden = false;
    $('quick-pick-review').hidden = true;
    speakWord(word, { silent: true });
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
    saveQuickPickSession();
    if (quickPickSession.index >= quickPickSession.deck.length) addAllQuickPickWords();
    else renderQuickPickCard();
  }

  function animateQuickPickChoice(choice) {
    if (quickPickAnimating || !quickPickSession || quickPickSession.index >= quickPickSession.deck.length) return;
    quickPickAnimating = true;
    const card = $('quick-pick-card');
    const deck = card.parentElement;
    const direction = choice === 'known' ? 1 : -1;
    deck.dataset.swipeDirection = choice;
    deck.style.setProperty('--swipe-progress', '1');
    card.classList.add(choice === 'known' ? 'is-leaving-known' : 'is-leaving-unknown');
    card.style.transform = `translateX(${direction * 120}vw) rotate(${direction * 18}deg)`;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 230;
    setTimeout(() => commitQuickPickChoice(choice), duration);
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
      russian.textContent = wordTranslations(word).join(', ');
      copy.append(english, russian);
      label.append(checkbox, copy);
      fragment.append(label);
    });
    $('quick-pick-review-list').replaceChildren(fragment);
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

  function addAllQuickPickWords() {
    if (!quickPickSession) return;
    const choices = new Map(quickPickSession.history.map((item) => [item.id, item.choice]));
    const additions = [];
    quickPickSession.deck.forEach((id, index) => {
      const source = quickPickWordById(id);
      if (!source) return;
      const english = normalizeDictionaryText(source.english, 'en-US');
      const russian = normalizeDictionaryText(source.russian, 'ru-RU');
      if (!english || hasUserWordPair([...words, ...additions], english, russian)) return;
      const choice = choices.get(id)
        ?? (quickPickSession.unknown.includes(id) ? 'unknown' : (quickPickKnown.has(id) ? 'known' : 'unknown'));
      additions.push(createWordRecord(
        globalThis.crypto?.randomUUID?.() ?? `quick-word-${Date.now()}-${index}`,
        english,
        russian,
        choice === 'known' ? 5 : 1,
      ));
    });
    if (additions.length) {
      words.unshift(...additions);
      if (!saveWords()) {
        words.splice(0, additions.length);
        quickPickAnimating = false;
        showToast('Не удалось сохранить слова');
        return;
      }
      renderDictionary();
      syncSession();
    }
    finishQuickPick(additions.length ? `Добавлено ${additions.length} ${wordNoun(additions.length)}` : 'Все слова уже есть в словаре');
  }

  function addQuickPickSelection() {
    if (!quickPickSession) return;
    const selectedIds = new Set(quickPickSession.selected ?? []);
    const additions = [];
    quickPickSession.unknown.forEach((id, index) => {
      if (!selectedIds.has(id)) return;
      const source = quickPickWordById(id);
      if (!source) return;
      const english = normalizeDictionaryText(source.english, 'en-US');
      const russian = normalizeDictionaryText(source.russian, 'ru-RU');
      if (hasUserWordPair([...words, ...additions], english, russian)) return;
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
        || (Number(left.word.difficulty) || 1) - (Number(right.word.difficulty) || 1)
        || left.index - right.index
      ))
      .slice(0, STUDY_SERIES_SIZE)
      .map(({ word }) => word.id);
  }

  function fiveLetterStudyWords() {
    const now = Date.now();
    return words
      .filter((word) => /^[a-z]{5}$/i.test(word.english.trim()))
      .map((word, index) => ({ word, index, knowledge: currentKnowledge(word, now) }))
      .sort((left, right) => (
        left.knowledge - right.knowledge
        || (Number(left.word.difficulty) || 1) - (Number(right.word.difficulty) || 1)
        || left.index - right.index
      ))
      .map(({ word }) => word);
  }

  function puzzleStudyWordIds() {
    const now = Date.now();
    const selected = [];
    const translations = new Set();
    words
      .map((word, index) => ({ word, index, knowledge: currentKnowledge(word, now) }))
      .sort((left, right) => (
        left.knowledge - right.knowledge
        || (Number(left.word.difficulty) || 1) - (Number(right.word.difficulty) || 1)
        || left.index - right.index
      ))
      .some(({ word }) => {
        const translation = wordTranslations(word).find((value) => !translations.has(value));
        if (!translation || translations.has(translation)) return false;
        translations.add(translation);
        selected.push(word.id);
        return selected.length >= STUDY_SERIES_SIZE;
      });
    return selected.slice(0, Math.floor(selected.length / PUZZLE_WORD_COUNT) * PUZZLE_WORD_COUNT);
  }

  function resetPuzzleRound() {
    clearTimeout(puzzleFeedbackTimer);
    const roundIds = session.ids.slice(session.index, session.index + PUZZLE_WORD_COUNT);
    puzzleGame.roundKey = roundIds.join('|');
    puzzleGame.pieceOrder = shuffled(roundIds);
    puzzleGame.solvedIds = new Set();
    puzzleGame.mistakeIds = new Set();
    puzzleGame.selectedId = null;
    puzzleGame.pendingWrong = null;
    puzzleGame.message = '';
    puzzleGame.result = '';
  }

  function resetFiveLetterGame(word) {
    fiveLetterGame.answer = word.english.trim().toLocaleLowerCase('en-US');
    fiveLetterGame.guesses = [];
    fiveLetterGame.current = '';
    fiveLetterGame.finished = false;
    fiveLetterGame.won = false;
    fiveLetterGame.message = '';
    fiveLetterGame.result = '';
  }

  function startStudy(mechanic = session.mechanic) {
    if (!words.length) return;
    const availableTranslations = new Set(words.flatMap((word) => wordTranslations(word)));
    if (mechanic === 'quiz' && availableTranslations.size < 2) return;
    if (mechanic === 'timed' && availableTranslations.size < 2) return;
    const fiveLetterCandidates = mechanic === 'five-letter' ? fiveLetterStudyWords() : [];
    const puzzleCandidates = mechanic === 'puzzle' ? puzzleStudyWordIds() : [];
    if (mechanic === 'five-letter' && !fiveLetterCandidates.length) return;
    if (mechanic === 'puzzle' && puzzleCandidates.length < PUZZLE_WORD_COUNT) return;
    stopTimedRound();
    session.mechanic = mechanic;
    if (mechanic === 'timed') session.ids = shuffled(words.map((word) => word.id));
    else if (mechanic === 'five-letter') {
      const weakestPool = fiveLetterCandidates.slice(0, Math.min(5, fiveLetterCandidates.length));
      const selectedWord = weakestPool[Math.floor(Math.random() * weakestPool.length)];
      session.ids = [selectedWord.id];
      resetFiveLetterGame(selectedWord);
    } else if (mechanic === 'puzzle') session.ids = puzzleCandidates;
    else session.ids = weakestStudyWordIds();
    initializeSessionTranslations();
    session.index = 0;
    session.flipped = false;
    session.answered = false;
    session.correctCount = 0;
    session.attemptCount = 0;
    session.startedAt = Date.now();
    session.statsRecorded = false;
    if (mechanic === 'puzzle') resetPuzzleRound();
    recordStudyDay();
    setPhase('play');
    renderExercise();
    if (mechanic === 'timed') startTimedRound();
    if (mechanic === 'five-letter') focusFiveLetterInput();
  }

  function syncSession() {
    if (session.phase !== 'play') return;
    session.ids = session.ids.filter((id) => words.some((word) => word.id === id));
    if (session.mechanic === 'puzzle' && session.ids.length < PUZZLE_WORD_COUNT) { setPhase('feed'); return; }
    if (!session.ids.length) { setPhase('feed'); return; }
    session.index = Math.min(session.index, session.ids.length - 1);
    renderExercise();
  }

  function renderProgress() {
    if (session.mechanic === 'timed') $('progress-text').textContent = `${session.correctCount} верных`;
    else if (session.mechanic === 'five-letter') {
      const attempt = Math.min(FIVE_LETTER_ATTEMPTS, fiveLetterGame.guesses.length + (fiveLetterGame.finished ? 0 : 1));
      $('progress-text').textContent = `${attempt}/${FIVE_LETTER_ATTEMPTS}`;
    } else if (session.mechanic === 'puzzle') {
      const round = Math.floor(session.index / PUZZLE_WORD_COUNT) + 1;
      const rounds = Math.ceil(session.ids.length / PUZZLE_WORD_COUNT);
      $('progress-text').textContent = `${round}/${rounds}`;
    } else $('progress-text').textContent = `${session.index + 1}/${session.ids.length}`;
  }

  function renderExercise() {
    const word = words.find((entry) => entry.id === session.ids[session.index]);
    if (!word) return;
    renderProgress();
    if (session.mechanic === 'cards') renderCard(word);
    if (session.mechanic === 'quiz') renderQuiz(word);
    if (session.mechanic === 'typing') renderTyping(word);
    if (session.mechanic === 'timed') renderTimed(word);
    if (session.mechanic === 'five-letter') renderFiveLetter(word);
    if (session.mechanic === 'puzzle') renderPuzzle();
  }

  function renderCard(word) {
    const englishSide = session.flipped;
    const translation = studyTranslation(word);
    $('card-term').textContent = englishSide ? word.english : translation;
    $('card-side').textContent = englishSide ? 'СЛОВО' : 'ПЕРЕВОД';
    $('card-hint').textContent = session.flipped ? 'Нажмите, чтобы вернуться' : `Нажмите, чтобы увидеть ${englishSide ? 'перевод' : 'слово'}`;
    $('flashcard').classList.toggle('is-flipped', session.flipped);
    $('flashcard').setAttribute('aria-label', `${englishSide ? 'Английское слово' : 'Перевод'}: ${englishSide ? word.english : translation}. Перевернуть карточку`);
    $('next-button-label').textContent = session.index === session.ids.length - 1 ? 'Завершить' : 'Дальше';
    if (englishSide) speakWord(word, { silent: true });
  }

  function renderQuiz(word) {
    session.answered = false;
    $('quiz-prompt').textContent = word.english;
    $('quiz-feedback').textContent = '';
    $('quiz-feedback').removeAttribute('data-result');
    $('quiz-next-button').disabled = true;
    $('quiz-next-label').textContent = session.index === session.ids.length - 1 ? 'Завершить' : 'Дальше';
    const correctAnswer = studyTranslation(word);
    const translations = [...new Set(words.map((entry) => studyTranslation(entry)))];
    const distractors = shuffled(translations.filter((answer) => answer !== correctAnswer)).slice(0, 2);
    const options = shuffled([...distractors, correctAnswer]);
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
      button.addEventListener('click', (event) => {
        event.currentTarget.blur();
        answerQuiz(answer, correctAnswer);
      });
      fragment.append(button);
    });
    $('quiz-options').replaceChildren(fragment);
    speakWord(word, { silent: true });
  }

  function answerQuiz(answer, correctAnswer) {
    if (session.answered) return;
    session.answered = true;
    const word = words.find((entry) => entry.id === session.ids[session.index]);
    const correct = answer.toLocaleLowerCase() === correctAnswer.toLocaleLowerCase();
    if (correct) session.correctCount += 1;
    recordWordReview(word, correct);
    $('quiz-options').querySelectorAll('button').forEach((button) => {
      button.disabled = true;
      const selected = button.dataset.answer === answer;
      const correctOption = button.dataset.answer.toLocaleLowerCase() === correctAnswer.toLocaleLowerCase();
      button.setAttribute('aria-pressed', String(selected));
      if (correctOption) button.classList.add('is-correct');
      else if (selected) button.classList.add('is-incorrect');
      button.blur();
    });
    $('quiz-feedback').textContent = correct ? 'Верно!' : `Правильный ответ: ${correctAnswer}`;
    $('quiz-feedback').dataset.result = correct ? 'correct' : 'incorrect';
    $('quiz-next-button').disabled = false;
  }

  function renderTyping(word) {
    session.answered = false;
    $('typing-prompt').textContent = studyTranslation(word);
    $('typing-input').value = '';
    $('typing-input').disabled = false;
    $('typing-input').classList.remove('is-error');
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
    if (!answer) {
      $('typing-input').classList.add('is-error');
      $('typing-feedback').textContent = 'Введите слово, чтобы проверить ответ';
      $('typing-feedback').dataset.result = 'warning';
      return;
    }
    session.answered = true;
    const correct = answer === word.english.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    if (correct) session.correctCount += 1;
    recordWordReview(word, correct);
    $('typing-input').disabled = true;
    $('typing-check-button').hidden = true;
    $('typing-feedback').textContent = correct ? 'Верно!' : `Правильный ответ: ${word.english}`;
    $('typing-feedback').dataset.result = correct ? 'correct' : 'incorrect';
    $('typing-next-button').hidden = false;
    speakWord(word, { silent: true });
  }

  function currentPuzzleWords() {
    return session.ids
      .slice(session.index, session.index + PUZZLE_WORD_COUNT)
      .map((id) => words.find((word) => word.id === id))
      .filter(Boolean);
  }

  function selectPuzzlePiece(wordId) {
    if (session.answered || puzzleGame.pendingWrong || puzzleGame.solvedIds.has(wordId)) return;
    puzzleGame.selectedId = puzzleGame.selectedId === wordId ? null : wordId;
    puzzleGame.message = puzzleGame.selectedId ? 'Теперь выберите подходящее слово' : '';
    puzzleGame.result = '';
    renderPuzzle();
  }

  function beginPuzzleDrag(event) {
    if (event.button !== 0 || session.answered || puzzleGame.pendingWrong) return;
    const source = event.currentTarget;
    const wordId = source.dataset.puzzlePiece;
    if (!wordId || puzzleGame.solvedIds.has(wordId)) return;
    event.preventDefault();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    let ghost = null;

    const moveGhost = (clientX, clientY) => {
      if (!ghost) {
        ghost = source.cloneNode(true);
        ghost.classList.remove('is-selected');
        ghost.classList.add('puzzle-drag-ghost');
        ghost.removeAttribute('id');
        ghost.disabled = true;
        document.body.append(ghost);
        source.classList.add('is-dragging-source');
      }
      ghost.style.left = `${clientX}px`;
      ghost.style.top = `${clientY}px`;
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onEnd);
      document.removeEventListener('pointercancel', onCancel);
      source.classList.remove('is-dragging-source');
      ghost?.remove();
    };

    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!moved && distance < 6) return;
      moved = true;
      moveEvent.preventDefault();
      moveGhost(moveEvent.clientX, moveEvent.clientY);
    };

    const onEnd = (endEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      const dropTarget = moved ? document.elementFromPoint(endEvent.clientX, endEvent.clientY)?.closest('[data-puzzle-slot]') : null;
      cleanup();
      if (dropTarget) tryPuzzlePair(wordId, dropTarget.dataset.puzzleSlot);
      else if (!moved) selectPuzzlePiece(wordId);
    };

    const onCancel = (cancelEvent) => {
      if (cancelEvent.pointerId === pointerId) cleanup();
    };

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onEnd);
    document.addEventListener('pointercancel', onCancel);
  }

  function createPuzzlePiece(word, state = '') {
    const piece = document.createElement('button');
    piece.type = 'button';
    piece.className = 'puzzle-piece';
    piece.dataset.puzzlePiece = word.id;
    const translation = studyTranslation(word);
    piece.textContent = translation;
    piece.draggable = false;
    piece.setAttribute('aria-label', `Перевод: ${translation}`);
    if (state) piece.classList.add(`is-${state}`);
    if (state === 'locked' || state === 'wrong') {
      piece.disabled = true;
    } else {
      if (puzzleGame.selectedId === word.id) piece.classList.add('is-selected');
      piece.addEventListener('pointerdown', beginPuzzleDrag);
      piece.addEventListener('click', (event) => {
        if (event.detail === 0) selectPuzzlePiece(word.id);
      });
    }
    return piece;
  }

  function completePuzzleRound() {
    if (session.answered) return;
    const roundWords = currentPuzzleWords();
    session.answered = true;
    session.attemptCount += roundWords.length;
    roundWords.forEach((word) => {
      const correctOnFirstTry = !puzzleGame.mistakeIds.has(word.id);
      if (correctOnFirstTry) session.correctCount += 1;
      recordWordReview(word, correctOnFirstTry);
    });
    puzzleGame.selectedId = null;
    puzzleGame.message = '';
    puzzleGame.result = 'correct';
  }

  function tryPuzzlePair(pieceId, slotId) {
    if (session.answered || puzzleGame.pendingWrong || puzzleGame.solvedIds.has(pieceId) || puzzleGame.solvedIds.has(slotId)) return;
    const roundWords = currentPuzzleWords();
    const pieceWord = roundWords.find((word) => word.id === pieceId);
    const slotWord = roundWords.find((word) => word.id === slotId);
    if (!pieceWord || !slotWord) return;
    puzzleGame.selectedId = null;
    if (pieceId === slotId) {
      puzzleGame.solvedIds.add(pieceId);
      puzzleGame.message = '';
      puzzleGame.result = 'correct';
      if (puzzleGame.solvedIds.size === roundWords.length) completePuzzleRound();
      renderPuzzle();
      speakWord(pieceWord, { silent: true });
      return;
    }

    puzzleGame.mistakeIds.add(pieceId);
    puzzleGame.mistakeIds.add(slotId);
    puzzleGame.pendingWrong = { pieceId, slotId };
    puzzleGame.message = '';
    puzzleGame.result = 'incorrect';
    renderPuzzle();
    clearTimeout(puzzleFeedbackTimer);
    puzzleFeedbackTimer = setTimeout(() => {
      if (puzzleGame.pendingWrong?.pieceId !== pieceId || puzzleGame.pendingWrong?.slotId !== slotId) return;
      puzzleGame.pendingWrong = null;
      puzzleGame.message = '';
      puzzleGame.result = '';
      if (session.phase === 'play' && session.mechanic === 'puzzle') renderPuzzle();
    }, 560);
  }

  function renderPuzzle() {
    const roundWords = currentPuzzleWords();
    const roundKey = roundWords.map((word) => word.id).join('|');
    if (puzzleGame.roundKey !== roundKey) resetPuzzleRound();
    const wordById = new Map(roundWords.map((word) => [word.id, word]));
    const board = document.createDocumentFragment();

    roundWords.forEach((word) => {
      const row = document.createElement('div');
      row.className = 'puzzle-row';
      const english = document.createElement('div');
      english.className = 'puzzle-word';
      english.textContent = word.english;

      const slot = document.createElement('div');
      slot.className = 'puzzle-slot';
      slot.dataset.puzzleSlot = word.id;
      slot.setAttribute('role', 'button');
      slot.setAttribute('aria-label', `Место для перевода слова ${word.english}`);
      const solved = puzzleGame.solvedIds.has(word.id);
      const pendingWrong = puzzleGame.pendingWrong?.slotId === word.id ? wordById.get(puzzleGame.pendingWrong.pieceId) : null;
      if (solved) {
        slot.classList.add('is-correct');
        slot.tabIndex = -1;
        slot.textContent = studyTranslation(word);
      } else if (pendingWrong) {
        slot.classList.add('is-wrong');
        slot.tabIndex = -1;
        slot.textContent = studyTranslation(pendingWrong);
      } else {
        slot.tabIndex = 0;
        slot.textContent = 'Перевод';
        if (puzzleGame.selectedId) slot.classList.add('is-ready');
        slot.addEventListener('click', () => {
          if (puzzleGame.selectedId) tryPuzzlePair(puzzleGame.selectedId, word.id);
        });
        slot.addEventListener('keydown', (event) => {
          if (!puzzleGame.selectedId || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          tryPuzzlePair(puzzleGame.selectedId, word.id);
        });
      }
      row.append(english, slot);
      board.append(row);
    });
    $('puzzle-board').replaceChildren(board);

    const tray = document.createDocumentFragment();
    puzzleGame.pieceOrder.forEach((wordId) => {
      if (puzzleGame.solvedIds.has(wordId) || puzzleGame.pendingWrong?.pieceId === wordId) return;
      const word = wordById.get(wordId);
      if (word) tray.append(createPuzzlePiece(word));
    });
    $('puzzle-tray').replaceChildren(tray);
    $('puzzle-feedback').textContent = puzzleGame.message;
    if (puzzleGame.result) $('puzzle-feedback').dataset.result = puzzleGame.result;
    else $('puzzle-feedback').removeAttribute('data-result');
    $('puzzle-next-button').hidden = !session.answered;
    $('puzzle-next-button').textContent = session.index + PUZZLE_WORD_COUNT >= session.ids.length ? 'Завершить' : 'Дальше';
  }

  function nextPuzzleRound() {
    if (session.phase !== 'play' || session.mechanic !== 'puzzle' || !session.answered) return;
    if (session.index + PUZZLE_WORD_COUNT >= session.ids.length) {
      setPhase('finish');
      return;
    }
    session.index += PUZZLE_WORD_COUNT;
    session.answered = false;
    resetPuzzleRound();
    renderExercise();
  }

  function evaluateFiveLetterGuess(guess, answer) {
    const statuses = Array(5).fill('absent');
    const remaining = new Map();
    for (let index = 0; index < 5; index += 1) {
      if (guess[index] === answer[index]) statuses[index] = 'correct';
      else remaining.set(answer[index], (remaining.get(answer[index]) || 0) + 1);
    }
    for (let index = 0; index < 5; index += 1) {
      if (statuses[index] === 'correct') continue;
      const count = remaining.get(guess[index]) || 0;
      if (count > 0) {
        statuses[index] = 'present';
        remaining.set(guess[index], count - 1);
      }
    }
    return statuses;
  }

  function fiveLetterStatusLabel(status) {
    if (status === 'correct') return 'на правильном месте';
    if (status === 'present') return 'есть в слове, но в другом месте';
    return 'нет в слове';
  }

  function renderFiveLetterBoard() {
    const fragment = document.createDocumentFragment();
    for (let rowIndex = 0; rowIndex < FIVE_LETTER_ATTEMPTS; rowIndex += 1) {
      const row = document.createElement('div');
      row.className = 'five-letter-row';
      row.setAttribute('role', 'row');
      const submitted = fiveLetterGame.guesses[rowIndex];
      const draft = !fiveLetterGame.finished && rowIndex === fiveLetterGame.guesses.length ? fiveLetterGame.current : '';
      const letters = submitted?.word ?? draft;
      for (let columnIndex = 0; columnIndex < 5; columnIndex += 1) {
        const cell = document.createElement('span');
        cell.className = 'five-letter-cell';
        cell.setAttribute('role', 'gridcell');
        const letter = letters[columnIndex] ?? '';
        cell.textContent = letter;
        if (letter) cell.classList.add('has-letter');
        const status = submitted?.statuses[columnIndex];
        if (status) {
          cell.classList.add(`is-${status}`);
          cell.setAttribute('aria-label', `${letter.toUpperCase()}: ${fiveLetterStatusLabel(status)}`);
        } else {
          cell.setAttribute('aria-label', letter ? letter.toUpperCase() : 'Пустая клетка');
        }
        row.append(cell);
      }
      fragment.append(row);
    }
    $('five-letter-board').replaceChildren(fragment);
  }

  function renderFiveLetterKeyboard() {
    const priorities = { absent: 1, present: 2, correct: 3 };
    const letterStatuses = new Map();
    fiveLetterGame.guesses.forEach((guess) => {
      [...guess.word].forEach((letter, index) => {
        const nextStatus = guess.statuses[index];
        const currentStatus = letterStatuses.get(letter);
        if (!currentStatus || priorities[nextStatus] > priorities[currentStatus]) letterStatuses.set(letter, nextStatus);
      });
    });
    const rows = [
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
      ['enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'],
    ];
    const fragment = document.createDocumentFragment();
    rows.forEach((keys) => {
      const row = document.createElement('div');
      row.className = 'five-letter-keyboard-row';
      keys.forEach((key) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'five-letter-key';
        button.dataset.fiveLetterKey = key;
        button.disabled = fiveLetterGame.finished;
        if (key === 'enter' || key === 'backspace') button.classList.add('is-wide');
        if (key === 'enter') {
          button.textContent = 'Готово';
          button.setAttribute('aria-label', 'Проверить слово');
        } else if (key === 'backspace') {
          button.textContent = '⌫';
          button.setAttribute('aria-label', 'Удалить букву');
        } else {
          button.textContent = key;
          button.setAttribute('aria-label', key.toUpperCase());
          const status = letterStatuses.get(key);
          if (status) button.classList.add(`is-${status}`);
        }
        row.append(button);
      });
      fragment.append(row);
    });
    $('five-letter-keyboard').replaceChildren(fragment);
  }

  function renderFiveLetter(word) {
    const answer = word.english.trim().toLocaleLowerCase('en-US');
    if (fiveLetterGame.answer !== answer) resetFiveLetterGame(word);
    renderFiveLetterBoard();
    const nativeInput = $('five-letter-input');
    nativeInput.value = fiveLetterGame.current;
    nativeInput.disabled = fiveLetterGame.finished;
    if (fiveLetterGame.finished) nativeInput.blur();
    const remaining = Math.max(0, FIVE_LETTER_ATTEMPTS - fiveLetterGame.guesses.length);
    $('five-letter-attempts').textContent = fiveLetterGame.finished
      ? (fiveLetterGame.won ? `Угадано за ${fiveLetterGame.guesses.length}` : 'Попытки закончились')
      : `${remaining} ${attemptNoun(remaining)}`;
    $('five-letter-feedback').textContent = fiveLetterGame.message;
    if (fiveLetterGame.result) $('five-letter-feedback').dataset.result = fiveLetterGame.result;
    else $('five-letter-feedback').removeAttribute('data-result');
    $('five-letter-finish').hidden = !fiveLetterGame.finished;
    renderProgress();
  }

  function submitFiveLetterGuess() {
    if (fiveLetterGame.finished) return;
    if (fiveLetterGame.current.length !== 5) {
      fiveLetterGame.message = 'Введите все 5 букв';
      fiveLetterGame.result = 'incorrect';
      renderExercise();
      return;
    }
    const word = words.find((entry) => entry.id === session.ids[0]);
    if (!word) return;
    const guess = fiveLetterGame.current;
    const statuses = evaluateFiveLetterGuess(guess, fiveLetterGame.answer);
    fiveLetterGame.guesses.push({ word: guess, statuses });
    fiveLetterGame.current = '';
    session.attemptCount = fiveLetterGame.guesses.length;
    const correct = statuses.every((status) => status === 'correct');
    const exhausted = fiveLetterGame.guesses.length >= FIVE_LETTER_ATTEMPTS;
    if (correct || exhausted) {
      fiveLetterGame.finished = true;
      fiveLetterGame.won = correct;
      fiveLetterGame.message = correct ? 'Верно! Слово угадано' : `Правильное слово: ${fiveLetterGame.answer.toUpperCase()}`;
      fiveLetterGame.result = correct ? 'correct' : 'incorrect';
      session.answered = true;
      session.correctCount = correct ? 1 : 0;
      recordWordReview(word, correct);
    } else {
      fiveLetterGame.message = '';
      fiveLetterGame.result = '';
    }
    renderExercise();
    if (correct || exhausted) speakWord(word, { silent: true });
  }

  function inputFiveLetter(key) {
    if (session.phase !== 'play' || session.mechanic !== 'five-letter' || fiveLetterGame.finished) return;
    if (key === 'enter') {
      submitFiveLetterGuess();
      return;
    }
    if (key === 'backspace') fiveLetterGame.current = fiveLetterGame.current.slice(0, -1);
    else if (/^[a-z]$/i.test(key) && fiveLetterGame.current.length < 5) fiveLetterGame.current += key.toLocaleLowerCase('en-US');
    else return;
    fiveLetterGame.message = '';
    fiveLetterGame.result = '';
    renderExercise();
  }

  function focusFiveLetterInput() {
    if (session.phase !== 'play' || session.mechanic !== 'five-letter' || fiveLetterGame.finished) return;
    const input = $('five-letter-input');
    input.disabled = false;
    input.value = fiveLetterGame.current;
    try { input.focus({ preventScroll: true }); } catch { input.focus(); }
    const position = input.value.length;
    try { input.setSelectionRange(position, position); } catch { /* Selection is optional. */ }
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
    const correctAnswer = studyTranslation(word);
    const translations = [...new Set(words.map((entry) => studyTranslation(entry)))];
    const distractors = shuffled(translations.filter((answer) => answer !== correctAnswer)).slice(0, 3);
    const options = shuffled([...distractors, correctAnswer]);
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
        answerTimed(answer, correctAnswer);
      });
      fragment.append(button);
    });
    $('timed-options').replaceChildren(fragment);
    speakWord(word, { silent: true });
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
    recordWordReview(word, correct);
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
  $('profile-avatar-button').addEventListener('click', () => setAvatarPickerOpen(true));
  document.querySelectorAll('[data-avatar-close]').forEach((button) => button.addEventListener('click', () => setAvatarPickerOpen(false)));
  $('avatar-options').addEventListener('click', (event) => {
    const option = event.target.closest('[data-avatar-id]');
    if (option) selectAvatar(option.dataset.avatarId);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopActiveAudio();
      commitAppUsage();
      return;
    }
    appVisibleStartedAt = Date.now();
    renderStreak();
    renderProfile();
    updateTimedClock();
    if (!$('quick-pick-screen').hidden && quickPickSession && quickPickSession.index < quickPickSession.deck.length) {
      const word = quickPickWordById(quickPickSession.deck[quickPickSession.index]);
      if (word) speakWord(word, { silent: true });
    }
  });
  window.addEventListener('pagehide', commitAppUsage);

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
  $('dictionary-search-input').addEventListener('input', (event) => {
    dictionarySearchQuery = event.currentTarget.value;
    renderDictionary();
  });
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
    const avatarPickerOpen = !$('avatar-picker-overlay').hidden;
    const overlay = avatarPickerOpen
      ? $('avatar-picker-overlay')
      : (deleteOpen
      ? $('delete-overlay')
      : (wordCardOpen ? $('word-card-overlay') : (addOpen ? $('add-overlay') : (collectionOpen ? $('collection-overlay') : ($('sort-overlay').classList.contains('is-visible') ? $('sort-overlay') : null)))));
    if (!overlay) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (avatarPickerOpen) setAvatarPickerOpen(false);
      else if (deleteOpen) setDeleteConfirm(false);
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
  $('quick-pick-select-all').addEventListener('click', () => setQuickPickSelection(true));
  $('quick-pick-select-none').addEventListener('click', () => setQuickPickSelection(false));
  $('quick-pick-add-selected').addEventListener('click', addQuickPickSelection);
  $('quick-pick-skip').addEventListener('click', () => finishQuickPick('Слова не добавлены'));
  $('flashcard').addEventListener('click', () => { session.flipped = !session.flipped; renderExercise(); });
  $('next-button').addEventListener('click', nextCard);
  $('quiz-next-button').addEventListener('click', nextCard);
  $('typing-next-button').addEventListener('click', nextCard);
  $('puzzle-next-button').addEventListener('click', nextPuzzleRound);
  $('typing-form').addEventListener('submit', (event) => { event.preventDefault(); answerTyping(); });
  $('typing-input').addEventListener('input', () => {
    if ($('typing-feedback').dataset.result !== 'warning') return;
    $('typing-input').classList.remove('is-error');
    $('typing-feedback').textContent = '';
    $('typing-feedback').removeAttribute('data-result');
  });
  $('five-letter-input').addEventListener('input', (event) => {
    if (session.phase !== 'play' || session.mechanic !== 'five-letter' || fiveLetterGame.finished) return;
    const value = event.currentTarget.value.toLocaleLowerCase('en-US').replace(/[^a-z]/g, '').slice(0, 5);
    event.currentTarget.value = value;
    fiveLetterGame.current = value;
    fiveLetterGame.message = '';
    fiveLetterGame.result = '';
    renderExercise();
  });
  $('five-letter-input').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') return;
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      submitFiveLetterGuess();
    }
  });
  $('five-letter-board').addEventListener('click', focusFiveLetterInput);
  $('five-letter-finish').addEventListener('click', () => setPhase('finish'));
  $('exit-study-button').addEventListener('click', () => setPhase('feed'));
  $('repeat-button').addEventListener('click', () => startStudy());
  $('finish-mode-button').addEventListener('click', () => setPhase('feed'));
  document.addEventListener('keydown', (event) => {
    if (activeTab !== 'cards' || session.phase !== 'play') return;
    if (event.key === 'Escape') { event.preventDefault(); setPhase('feed'); return; }
    if (session.mechanic === 'five-letter') {
      if (document.activeElement === $('five-letter-input')) return;
      const key = event.key === 'Enter' ? 'enter' : (event.key === 'Backspace' ? 'backspace' : event.key);
      if (key === 'enter' || key === 'backspace' || /^[a-z]$/i.test(key)) {
        event.preventDefault();
        inputFiveLetter(key);
      }
      return;
    }
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
    const telegramLaunchParams = `${window.location.search}${window.location.hash}`.includes('tgWebAppVersion');
    const isTelegramContext = Boolean(webApp.initData || telegramLaunchParams || (webApp.platform && webApp.platform !== 'unknown'));
    if (!isTelegramContext) return;
    document.documentElement.classList.add('telegram-app');
    if (webApp.initData) syncTelegramProfile(webApp);
    const syncTelegramSafeArea = () => {
      const safeTop = Math.max(0, Number(webApp.safeAreaInset?.top) || 0);
      const contentTop = Math.max(0, Number(webApp.contentSafeAreaInset?.top) || 0);
      document.documentElement.style.setProperty('--tg-safe-area-inset-top', `${safeTop}px`);
      document.documentElement.style.setProperty('--tg-content-safe-area-inset-top', `${contentTop}px`);
    };
    webApp.onEvent?.('safeAreaChanged', syncTelegramSafeArea);
    webApp.onEvent?.('contentSafeAreaChanged', syncTelegramSafeArea);
    webApp.onEvent?.('viewportChanged', syncTelegramSafeArea);
    webApp.ready();
    webApp.expand();
    if (webApp.isVersionAtLeast?.('8.0') && !webApp.isFullscreen) webApp.requestFullscreen?.();
    if (webApp.isVersionAtLeast?.('7.7')) webApp.disableVerticalSwipes?.();
    webApp.setHeaderColor?.('#f3f5f2');
    webApp.setBackgroundColor?.('#f3f5f2');
    syncTelegramSafeArea();
    requestAnimationFrame(syncTelegramSafeArea);
    setTimeout(syncTelegramSafeArea, 300);
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
            translations: wordTranslations(word),
            source: word.source,
            partOfSpeech: word.part_of_speech,
            audio: word.audio,
            difficulty: word.difficulty,
            cefr: word.cefr_level,
            knowledge: currentKnowledge(word),
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
  renderStreak();
  renderProfile();
  updateQuickPickLaunch();
})();
