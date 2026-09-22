(() => {
  'use strict';

  const STORAGE_KEY = 'vordik.words.v1';
  const STUDY_DAYS_KEY = 'vordik.studyDays.v1';
  const QUICK_PICK_KNOWN_KEY = 'vordik.quickPickKnown.v1';
  const QUICK_PICK_SESSION_KEY = 'vordik.quickPickSession.v1';
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
  const quickPickKnown = loadQuickPickKnown();
  let quickPickSession = loadQuickPickSession();
  const session = { mechanic: 'cards', ids: [], index: 0, flipped: false, answered: false, correctCount: 0, phase: 'feed' };
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
  let quickPickAnimating = false;
  let quickPickFlipped = false;
  let quickPickSuppressClick = false;
  let quickPickResetArmed = false;
  let quickPickResetTimer;

  function localDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return [year, month, day].join('-');
  }

  function loadStudyDays() {
    try {
      const saved = JSON.parse(localStorage.getItem(STUDY_DAYS_KEY) ?? '[]');
      if (!Array.isArray(saved)) return [];
      return [...new Set(saved.filter((day) => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort();
    } catch { return []; }
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
      if (!deck.length) return null;
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
    const count = streakLength();
    const label = streakDayLabel(count);
    $('streak-count').textContent = count;
    $('streak-label').textContent = label;
    $('streak-widget').setAttribute('aria-label', String(count) + ' ' + label);
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
      if (saved === null) return sampleWords.map((word) => ({ ...word }));
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error('Invalid word list');
      const normalized = parsed
        .filter((word) => word && typeof word.id === 'string' && typeof word.english === 'string' && typeof word.russian === 'string')
        .map((word) => ({
          id: word.id,
          english: normalizeDictionaryText(word.english, 'en-US').slice(0, 80),
          russian: normalizeDictionaryText(word.russian, 'ru-RU').slice(0, 120),
        }))
        .filter((word) => word.english && word.russian);
      if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      }
      return normalized;
    } catch {
      return sampleWords.map((word) => ({ ...word }));
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

  function renderReadyCollections() {
    const fragment = document.createDocumentFragment();
    wordCollections.forEach((collection) => {
      const button = document.createElement('button');
      button.className = 'ready-collection-card';
      button.type = 'button';
      button.dataset.collectionId = collection.id;
      button.setAttribute('aria-label', `Открыть подборку «${collection.title}»`);
      const title = document.createElement('strong');
      title.textContent = collection.title;
      const description = document.createElement('span');
      description.textContent = collection.description;
      button.append(title, description);
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
    if (restoreFocus && activeTab === 'dictionary') {
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
      additions.push({
        id: globalThis.crypto?.randomUUID?.() ?? `collection-${collection.id}-${Date.now()}-${index}`,
        english,
        russian,
      });
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
    $('home-word-count').textContent = words.length;
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
      speaker.src = './icons/speaker.svg';
      speaker.alt = '';
      speaker.setAttribute('aria-hidden', 'true');
      listen.append(speaker);
      listen.addEventListener('click', () => speakWord(word.english));
      const copy = document.createElement('div');
      copy.className = 'dictionary-word-copy';
      const english = document.createElement('strong');
      english.className = 'dictionary-word-english';
      english.lang = 'en';
      english.textContent = word.english;
      const russian = document.createElement('span');
      russian.className = 'dictionary-word-russian';
      russian.textContent = word.russian;
      copy.append(english, russian);
      const remove = document.createElement('button');
      remove.className = 'dictionary-delete-button';
      remove.type = 'button';
      const deleteIcon = document.createElement('img');
      deleteIcon.src = './icons/delete.svg';
      deleteIcon.alt = '';
      deleteIcon.setAttribute('aria-hidden', 'true');
      remove.append(deleteIcon);
      remove.dataset.deleteWordId = word.id;
      remove.setAttribute('aria-label', `Удалить ${word.english}`);
      remove.addEventListener('click', () => setDeleteConfirm(true, word.id));
      row.append(listen, copy, remove);
      fragment.append(row);
    });
    $('word-list').replaceChildren(fragment);
    $('typing-start').disabled = words.length === 0;
    document.querySelector('[data-study="cards"]').disabled = words.length === 0;
    const hasQuizOptions = new Set(words.map((word) => word.russian.toLocaleLowerCase())).size >= 2;
    $('quiz-start').disabled = !hasQuizOptions;
    $('quiz-start').setAttribute('aria-label', hasQuizOptions ? 'Выбрать перевод: начать тренировку' : 'Для выбора перевода нужны хотя бы два разных перевода в словаре');
    $('study-empty-hint').hidden = words.length !== 0;
  }

  function wordNoun(count) {
    const ending = count % 100;
    if (ending >= 11 && ending <= 14) return 'слов';
    if (count % 10 === 1) return 'слово';
    if (count % 10 >= 2 && count % 10 <= 4) return 'слова';
    return 'слов';
  }

  function addWord(englishValue, russianValue) {
    const english = normalizeDictionaryText(englishValue, 'en-US');
    const russian = normalizeDictionaryText(russianValue, 'ru-RU');
    if (!english || !russian || english.length > 80 || russian.length > 120) throw new Error('Заполните оба поля: слово и перевод.');
    if (words.some((word) => word.english.toLocaleLowerCase() === english.toLocaleLowerCase() && word.russian.toLocaleLowerCase() === russian.toLocaleLowerCase())) {
      throw new Error('Это слово с таким переводом уже есть в словаре.');
    }
    const word = { id: globalThis.crypto?.randomUUID?.() ?? `word-${Date.now()}-${Math.random()}`, english, russian };
    words.unshift(word);
    if (!saveWords()) {
      words.shift();
      throw new Error('Не удалось сохранить слово на устройстве. Проверьте настройки браузера.');
    }
    renderDictionary();
    return word;
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
      const trigger = [...document.querySelectorAll('[data-delete-word-id]')].find((button) => button.dataset.deleteWordId === previousId);
      trigger?.focus();
    }
  }

  function confirmDelete() {
    const wordId = pendingDeleteId;
    if (!wordId) return;
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
    if (tab !== 'dictionary' && !$('collection-overlay').hidden) setCollectionOpen(false, activeCollectionId, false);
    if (tab !== 'dictionary' && !$('delete-overlay').hidden) setDeleteConfirm(false, pendingDeleteId, false);
    if (tab !== 'cards' && !$('quick-pick-screen').hidden) closeQuickPick();
    activeTab = tab;
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
    window.scrollTo(0, 0);
  }

  function setPhase(phase) {
    session.phase = phase;
    document.body.classList.toggle('is-studying', phase === 'play');
    document.body.classList.toggle('is-quiz-studying', phase === 'play' && session.mechanic === 'quiz');
    document.body.classList.toggle('is-card-studying', phase === 'play' && session.mechanic === 'cards');
    $('study-feed').hidden = phase !== 'feed';
    $('study-play').hidden = phase !== 'play';
    $('study-finish').hidden = phase !== 'finish';
    $('flashcard-activity').hidden = phase !== 'play' || session.mechanic !== 'cards';
    $('quiz-activity').hidden = phase !== 'play' || session.mechanic !== 'quiz';
    $('typing-activity').hidden = phase !== 'play' || session.mechanic !== 'typing';
    if (phase === 'finish') {
      $('finish-copy').textContent = session.mechanic === 'cards'
        ? `Вы повторили ${session.ids.length} ${wordNoun(session.ids.length)}.`
        : `Верных ответов: ${session.correctCount} из ${session.ids.length}.`;
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
    $('quick-pick-reset').hidden = !hasProgress && quickPickKnown.size === 0;
    if (!quickPickResetArmed) $('quick-pick-reset').textContent = 'Сбросить результаты';
  }

  function createQuickPickSession() {
    const dictionaryWords = new Set(words.map((word) => normalizeDictionaryText(word.english, 'en-US')));
    const available = quickPickWords.filter((word) => {
      const english = normalizeDictionaryText(word.english, 'en-US');
      return !dictionaryWords.has(english) && !quickPickKnown.has(word.id);
    });
    const deck = shuffled(available).slice(0, 20).map((word) => word.id);
    quickPickSession = { deck, index: 0, unknown: [], history: [], selected: null };
    saveQuickPickSession();
  }

  function openQuickPick() {
    if (!quickPickSession) createQuickPickSession();
    recordStudyDay();
    document.body.classList.add('is-picking');
    $('study-feed').hidden = true;
    document.querySelector('.study-stage').hidden = true;
    $('quick-pick-screen').hidden = false;
    if (quickPickSession.index >= quickPickSession.deck.length) renderQuickPickReview();
    else renderQuickPickCard();
    window.scrollTo(0, 0);
  }

  function closeQuickPick() {
    saveQuickPickSession();
    document.body.classList.remove('is-picking');
    $('quick-pick-screen').hidden = true;
    $('study-feed').hidden = false;
    document.querySelector('.study-stage').hidden = false;
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
      additions.push({ id: globalThis.crypto?.randomUUID?.() ?? `quick-word-${Date.now()}-${index}`, english, russian });
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

  function resetQuickPickResults() {
    if (!quickPickResetArmed) {
      quickPickResetArmed = true;
      $('quick-pick-reset').textContent = 'Подтвердить сброс';
      clearTimeout(quickPickResetTimer);
      quickPickResetTimer = setTimeout(() => {
        quickPickResetArmed = false;
        updateQuickPickLaunch();
      }, 4500);
      return;
    }
    clearTimeout(quickPickResetTimer);
    quickPickResetArmed = false;
    quickPickKnown.clear();
    saveQuickPickKnown();
    quickPickSession = null;
    saveQuickPickSession();
    showToast('Результаты подбора сброшены');
    openQuickPick();
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

  function startStudy(mechanic = session.mechanic) {
    if (!words.length) return;
    if (mechanic === 'quiz' && new Set(words.map((word) => word.russian.toLocaleLowerCase())).size < 2) return;
    session.mechanic = mechanic;
    session.ids = words.map((word) => word.id);
    session.index = 0;
    session.flipped = false;
    session.answered = false;
    session.correctCount = 0;
    recordStudyDay();
    setPhase('play');
    renderExercise();
  }

  function syncSession() {
    if (session.phase !== 'play') return;
    session.ids = session.ids.filter((id) => words.some((word) => word.id === id));
    if (!session.ids.length) { setPhase('feed'); return; }
    session.index = Math.min(session.index, session.ids.length - 1);
    renderExercise();
  }

  function renderProgress() {
    $('progress-text').textContent = `${session.index + 1}/${session.ids.length}`;
  }

  function renderExercise() {
    const word = words.find((entry) => entry.id === session.ids[session.index]);
    if (!word) return;
    renderProgress();
    if (session.mechanic === 'cards') renderCard(word);
    if (session.mechanic === 'quiz') renderQuiz(word);
    if (session.mechanic === 'typing') renderTyping(word);
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
    const correct = answer.toLocaleLowerCase() === correctAnswer.toLocaleLowerCase();
    if (correct) session.correctCount += 1;
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
    $('typing-input').disabled = true;
    $('typing-check-button').hidden = true;
    $('typing-feedback').textContent = correct ? 'Верно!' : `Правильный ответ: ${word.english}`;
    $('typing-feedback').dataset.result = correct ? 'correct' : 'incorrect';
    $('typing-next-button').hidden = false;
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

  $('notifications-button').addEventListener('click', () => showToast('Уведомлений пока нет'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderStreak(); });

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
  $('collection-add-button').addEventListener('click', addActiveCollection);
  document.querySelectorAll('[data-collection-close]').forEach((button) => button.addEventListener('click', () => setCollectionOpen(false)));
  document.querySelectorAll('[data-delete-cancel]').forEach((button) => button.addEventListener('click', () => setDeleteConfirm(false)));
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
    const deleteOpen = $('delete-overlay').classList.contains('is-visible');
    const overlay = deleteOpen
      ? $('delete-overlay')
      : (addOpen ? $('add-overlay') : (collectionOpen ? $('collection-overlay') : ($('sort-overlay').classList.contains('is-visible') ? $('sort-overlay') : null)));
    if (!overlay) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (deleteOpen) setDeleteConfirm(false);
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
  $('quick-pick-start').addEventListener('click', openQuickPick);
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
  $('quick-pick-reset').addEventListener('click', resetQuickPickResults);
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
    if (webApp.initData) document.documentElement.classList.add('telegram-app');
    webApp.ready();
    webApp.expand();
    if (!webApp.isFullscreen) webApp.requestFullscreen?.();
    webApp.disableVerticalSwipes?.();
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
        execute: () => ({ words: words.map(({ english, russian }) => ({ english, russian })) }),
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
  updateQuickPickLaunch();
})();
