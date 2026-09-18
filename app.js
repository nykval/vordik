(() => {
  'use strict';

  const STORAGE_KEY = 'vordik.words.v1';
  const sampleWords = [
    { id: 'sample-horizon', english: 'horizon', russian: 'горизонт' },
    { id: 'sample-curious', english: 'curious', russian: 'любопытный' },
    { id: 'sample-breathe', english: 'breathe', russian: 'дышать' },
  ];
  const $ = (id) => document.getElementById(id);
  const words = loadWords();
  const session = { mode: 'english', ids: [], index: 0, flipped: false, phase: 'setup' };
  let activeTab = 'home';
  let toastTimer;

  function loadWords() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === null) return sampleWords.map((word) => ({ ...word }));
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error('Invalid word list');
      return parsed.filter((word) => word && typeof word.id === 'string' && typeof word.english === 'string' && typeof word.russian === 'string')
        .map((word) => ({ id: word.id, english: word.english.slice(0, 80), russian: word.russian.slice(0, 120) }));
    } catch {
      return sampleWords.map((word) => ({ ...word }));
    }
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

  function renderDictionary() {
    $('home-word-count').textContent = words.length;
    $('word-count').textContent = words.length;
    $('list-help').hidden = words.length === 0;
    $('dictionary-empty').hidden = words.length !== 0;
    const fragment = document.createDocumentFragment();
    words.forEach((word, index) => {
      const row = document.createElement('div');
      row.className = 'word-row';
      const number = document.createElement('span');
      number.className = 'word-index';
      number.textContent = String(index + 1).padStart(2, '0');
      const english = document.createElement('strong');
      english.className = 'word-english';
      english.textContent = word.english;
      const russian = document.createElement('span');
      russian.className = 'word-russian';
      russian.textContent = word.russian;
      const remove = document.createElement('button');
      remove.className = 'delete-button';
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Удалить ${word.english}`);
      remove.addEventListener('click', () => removeWord(word.id));
      row.append(number, english, russian, remove);
      fragment.append(row);
    });
    $('word-list').replaceChildren(fragment);
    $('start-button').disabled = words.length === 0;
    $('setup-note').textContent = words.length ? `В тренировке ${words.length} ${wordNoun(words.length)}.` : 'Добавьте слово в словарь, чтобы начать.';
  }

  function wordNoun(count) {
    const ending = count % 100;
    if (ending >= 11 && ending <= 14) return 'слов';
    if (count % 10 === 1) return 'слово';
    if (count % 10 >= 2 && count % 10 <= 4) return 'слова';
    return 'слов';
  }

  function addWord(englishValue, russianValue) {
    const english = String(englishValue ?? '').trim().replace(/\s+/g, ' ');
    const russian = String(russianValue ?? '').trim().replace(/\s+/g, ' ');
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
    activeTab = tab;
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

  function setMode(mode) {
    session.mode = mode;
    document.querySelectorAll('[data-mode]').forEach((button) => {
      const selected = button.dataset.mode === mode;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function setPhase(phase) {
    session.phase = phase;
    $('study-setup').hidden = phase !== 'setup';
    $('study-play').hidden = phase !== 'play';
    $('study-finish').hidden = phase !== 'finish';
  }

  function startStudy() {
    if (!words.length) return;
    session.ids = words.map((word) => word.id);
    session.index = 0;
    session.flipped = false;
    setPhase('play');
    renderCard();
  }

  function syncSession() {
    if (session.phase !== 'play') return;
    session.ids = session.ids.filter((id) => words.some((word) => word.id === id));
    if (!session.ids.length) { setPhase('setup'); return; }
    session.index = Math.min(session.index, session.ids.length - 1);
    renderCard();
  }

  function renderCard() {
    const word = words.find((entry) => entry.id === session.ids[session.index]);
    if (!word) return;
    const firstIsEnglish = session.mode === 'english';
    const englishSide = session.flipped ? !firstIsEnglish : firstIsEnglish;
    $('card-term').textContent = englishSide ? word.english : word.russian;
    $('card-side').textContent = englishSide ? 'АНГЛИЙСКОЕ СЛОВО' : 'ПЕРЕВОД';
    $('card-hint').replaceChildren(document.createTextNode(session.flipped ? 'Нажмите, чтобы вернуться ' : `Нажмите, чтобы увидеть ${englishSide ? 'перевод' : 'слово'} `));
    const glyph = document.createElement('span');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = '↻';
    $('card-hint').append(glyph);
    $('flashcard').classList.toggle('is-flipped', session.flipped);
    $('flashcard').setAttribute('aria-label', `${englishSide ? 'Английское слово' : 'Перевод'}: ${englishSide ? word.english : word.russian}. Перевернуть карточку`);
    $('progress-text').textContent = `${String(session.index + 1).padStart(2, '0')} / ${String(session.ids.length).padStart(2, '0')}`;
    $('progress-fill').style.width = `${((session.index + 1) / session.ids.length) * 100}%`;
    $('previous-button').disabled = session.index === 0;
    $('next-button').textContent = session.index === session.ids.length - 1 ? 'Завершить →' : 'Дальше →';
  }

  function nextCard() {
    if (session.phase !== 'play') return;
    if (session.index >= session.ids.length - 1) { setPhase('finish'); return; }
    session.index += 1;
    session.flipped = false;
    renderCard();
  }

  function previousCard() {
    if (session.phase !== 'play' || session.index === 0) return;
    session.index -= 1;
    session.flipped = false;
    renderCard();
  }

  $('add-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      addWord($('english-input').value, $('russian-input').value);
      $('add-form').reset();
      $('english-input').focus();
      showToast('Слово добавлено');
    } catch (error) { showToast(error.message); }
  });
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.go)));
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('start-button').addEventListener('click', startStudy);
  $('flashcard').addEventListener('click', () => { session.flipped = !session.flipped; renderCard(); });
  $('next-button').addEventListener('click', nextCard);
  $('previous-button').addEventListener('click', previousCard);
  $('change-mode-button').addEventListener('click', () => setPhase('setup'));
  $('repeat-button').addEventListener('click', startStudy);
  $('finish-mode-button').addEventListener('click', () => setPhase('setup'));
  document.addEventListener('keydown', (event) => {
    if (activeTab !== 'cards' || session.phase !== 'play' || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); nextCard(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); previousCard(); }
    if (event.key === ' ' && document.activeElement === document.body) { event.preventDefault(); $('flashcard').click(); }
  });

  // Telegram provides this object when the page is opened from a bot's Web App button.
  window.addEventListener('load', () => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    webApp.ready();
    webApp.expand();
    webApp.setHeaderColor?.('#102c38');
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

  renderDictionary();
  setMode('english');
})();
