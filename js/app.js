(() => {
  'use strict';

  // ---------- DOM refs ----------
  const englishInput = document.getElementById('englishInput');
  const charCount = document.getElementById('charCount');
  const translateBtn = document.getElementById('translateBtn');
  const sampleBtn = document.getElementById('sampleBtn');
  const clearBtn = document.getElementById('clearBtn');

  const accentSelect = document.getElementById('accentSelect');
  const voiceSelect = document.getElementById('voiceSelect');
  const rateRange = document.getElementById('rateRange');
  const rateValue = document.getElementById('rateValue');
  const pitchRange = document.getElementById('pitchRange');
  const pitchValue = document.getElementById('pitchValue');
  const chips = Array.from(document.querySelectorAll('.chip'));

  const playBtn = document.getElementById('playBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const stopBtn = document.getElementById('stopBtn');
  const loopToggle = document.getElementById('loopToggle');
  const speechWarning = document.getElementById('speechWarning');
  const textDisplay = document.getElementById('textDisplay');

  const translationOutput = document.getElementById('translationOutput');
  const saveFullBtn = document.getElementById('saveFullBtn');
  const sentenceList = document.getElementById('sentenceList');

  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  const SAMPLE_TEXT = "Learning a new language takes patience and practice. Try to read a little every day, and don't be afraid to make mistakes. The more you listen and repeat, the more natural your pronunciation will become.";

  const ACCENT_LABELS = {
    'en-US': '🇺🇸 アメリカ英語 (US)',
    'en-GB': '🇬🇧 イギリス英語 (UK)',
    'en-AU': '🇦🇺 オーストラリア英語 (AU)',
    'en-CA': '🇨🇦 カナダ英語 (CA)',
    'en-IN': '🇮🇳 インド英語 (IN)',
    'en-IE': '🇮🇪 アイルランド英語 (IE)',
    'en-ZA': '🇿🇦 南アフリカ英語 (ZA)',
    'en-NZ': '🇳🇿 ニュージーランド英語 (NZ)'
  };

  const HISTORY_KEY = 'ert_history_v1';
  const TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

  // ---------- State ----------
  let allVoices = [];
  let wordSpans = [];
  let activeSentenceItem = null;
  let playToken = 0;

  // ---------- Utilities ----------
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function updateCharCount() {
    charCount.textContent = `${englishInput.value.length} 文字`;
  }

  // ---------- Voices ----------
  function refreshVoices() {
    allVoices = ('speechSynthesis' in window) ? window.speechSynthesis.getVoices() : [];
    populateAccentSelect();
    populateVoiceSelect();
  }

  function populateAccentSelect() {
    const langs = new Set(['en-US', 'en-GB']);
    allVoices.forEach((v) => {
      if (v.lang && v.lang.toLowerCase().startsWith('en')) langs.add(v.lang);
    });
    const priority = ['en-US', 'en-GB'];
    const sorted = Array.from(langs).sort((a, b) => {
      const ia = priority.indexOf(a);
      const ib = priority.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b);
    });

    const prevValue = accentSelect.value;
    accentSelect.innerHTML = '';
    sorted.forEach((lang) => {
      const opt = document.createElement('option');
      opt.value = lang;
      opt.textContent = ACCENT_LABELS[lang] || `英語 (${lang})`;
      accentSelect.appendChild(opt);
    });
    if (sorted.includes(prevValue)) accentSelect.value = prevValue;
  }

  function populateVoiceSelect() {
    const lang = accentSelect.value;
    const matches = allVoices.filter((v) => v.lang && v.lang.toLowerCase() === lang.toLowerCase());
    voiceSelect.innerHTML = '';

    const autoOpt = document.createElement('option');
    autoOpt.value = '';
    autoOpt.textContent = matches.length ? '自動選択' : '（対応音声が見つかりません・自動選択）';
    voiceSelect.appendChild(autoOpt);

    matches.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = v.localService ? v.name : `${v.name}（オンライン）`;
      voiceSelect.appendChild(opt);
    });
  }

  function getSelectedVoice() {
    if (!voiceSelect.value) return null;
    return allVoices.find((v) => v.name === voiceSelect.value) || null;
  }

  accentSelect.addEventListener('change', populateVoiceSelect);

  if ('speechSynthesis' in window) {
    refreshVoices();
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  } else {
    speechWarning.classList.remove('hidden');
    playBtn.disabled = true;
  }

  // ---------- Rate / pitch controls ----------
  function updateChipActive() {
    const current = parseFloat(rateRange.value);
    chips.forEach((c) => c.classList.toggle('active', parseFloat(c.dataset.rate) === current));
  }

  rateRange.addEventListener('input', () => {
    rateValue.textContent = `${parseFloat(rateRange.value).toFixed(2)}x`;
    updateChipActive();
  });

  pitchRange.addEventListener('input', () => {
    pitchValue.textContent = parseFloat(pitchRange.value).toFixed(2);
  });

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      rateRange.value = chip.dataset.rate;
      rateRange.dispatchEvent(new Event('input'));
    });
  });

  // ---------- Word highlighting ----------
  function buildWordSpans(text) {
    textDisplay.innerHTML = '';
    wordSpans = [];
    const regex = /\S+/g;
    let match;
    let lastIndex = 0;
    const frag = document.createDocumentFragment();
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = match[0];
      frag.appendChild(span);
      wordSpans.push({ start: match.index, end: match.index + match[0].length, el: span });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    textDisplay.appendChild(frag);
  }

  function highlightWordAt(charIndex) {
    clearHighlightClassOnly();
    const found = wordSpans.find((w) => charIndex >= w.start && charIndex < w.end);
    if (found) found.el.classList.add('active');
  }

  function clearHighlightClassOnly() {
    wordSpans.forEach((w) => w.el.classList.remove('active'));
  }

  // ---------- Playback engine ----------
  function buildUtterance(text) {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = parseFloat(rateRange.value);
    utter.pitch = parseFloat(pitchRange.value);
    const voice = getSelectedVoice();
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    } else {
      utter.lang = accentSelect.value;
    }
    return utter;
  }

  function setPlaybackState(state) {
    if (state === 'playing') {
      playBtn.disabled = true;
      pauseBtn.disabled = false;
      stopBtn.disabled = false;
      pauseBtn.textContent = '⏸ 一時停止';
    } else if (state === 'paused') {
      pauseBtn.textContent = '▶ 再開';
    } else {
      playBtn.disabled = false;
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
      pauseBtn.textContent = '⏸ 一時停止';
      clearHighlightClassOnly();
    }
  }

  function speak(text, opts = {}) {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    clearHighlightClassOnly();
    const myToken = ++playToken;

    if (opts.highlightWords) {
      buildWordSpans(text);
    }

    const utter = buildUtterance(text);

    utter.onboundary = (e) => {
      if (myToken !== playToken || !opts.highlightWords) return;
      if (!e.name || e.name === 'word') highlightWordAt(e.charIndex);
    };

    utter.onstart = () => {
      if (myToken !== playToken) return;
      setPlaybackState('playing');
    };

    utter.onend = () => {
      if (myToken !== playToken) return;
      clearHighlightClassOnly();
      if (loopToggle.checked) {
        setTimeout(() => {
          if (myToken !== playToken || !loopToggle.checked) return;
          speak(text, opts);
        }, 400);
      } else {
        setPlaybackState('stopped');
        if (activeSentenceItem) {
          activeSentenceItem.classList.remove('active');
          activeSentenceItem = null;
        }
      }
    };

    utter.onerror = () => {
      if (myToken !== playToken) return;
      setPlaybackState('stopped');
    };

    window.speechSynthesis.speak(utter);
  }

  function stopAll() {
    loopToggle.checked = false;
    playToken++;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlaybackState('stopped');
    if (activeSentenceItem) {
      activeSentenceItem.classList.remove('active');
      activeSentenceItem = null;
    }
  }

  playBtn.addEventListener('click', () => {
    const text = englishInput.value.trim();
    if (!text) return;
    if (activeSentenceItem) {
      activeSentenceItem.classList.remove('active');
      activeSentenceItem = null;
    }
    speak(text, { highlightWords: true });
  });

  pauseBtn.addEventListener('click', () => {
    if (!('speechSynthesis' in window)) return;
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
      setPlaybackState('paused');
    } else if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setPlaybackState('playing');
    }
  });

  stopBtn.addEventListener('click', stopAll);

  // ---------- Translation ----------
  async function translateText(text) {
    const url = `${TRANSLATE_ENDPOINT}?client=gtx&sl=en&tl=ja&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Translation request failed: ${res.status}`);
    const data = await res.json();
    const segments = data[0] || [];
    const pairs = segments
      .filter((s) => s[1] && s[1].trim())
      .map((s) => ({ en: s[1].trim(), ja: s[0] }));
    const fullJa = pairs.map((p) => p.ja).join('');
    return { fullJa, pairs };
  }

  let lastTranslation = null;

  async function handleTranslate() {
    const text = englishInput.value.trim();
    if (!text) {
      translationOutput.textContent = '英文を入力してください。';
      return;
    }
    translateBtn.disabled = true;
    translateBtn.textContent = '翻訳中...';
    translationOutput.textContent = '翻訳中...';
    try {
      const { fullJa, pairs } = await translateText(text);
      lastTranslation = { en: text, ja: fullJa };
      translationOutput.textContent = fullJa || '(翻訳結果が空でした)';
      renderSentenceList(pairs);
    } catch (err) {
      translationOutput.textContent = '翻訳に失敗しました。しばらくしてからもう一度お試しください。';
      console.error(err);
    } finally {
      translateBtn.disabled = false;
      translateBtn.textContent = '🔤 翻訳する';
    }
  }

  function renderSentenceList(pairs) {
    sentenceList.innerHTML = '';
    if (!pairs.length) {
      sentenceList.innerHTML = '<li class="muted small">文が見つかりませんでした。</li>';
      return;
    }
    pairs.forEach((pair, idx) => {
      const li = document.createElement('li');
      li.className = 'sentence-item';
      li.innerHTML = `
        <div class="sentence-en">${idx + 1}. ${escapeHtml(pair.en)}</div>
        <div class="sentence-ja">${escapeHtml(pair.ja)}</div>
        <div class="sentence-actions">
          <button type="button" class="btn btn-ghost btn-sm sentence-play">▶ 再生</button>
          <button type="button" class="btn btn-ghost btn-sm sentence-save">💾 保存</button>
        </div>
      `;
      li.querySelector('.sentence-play').addEventListener('click', () => {
        if (activeSentenceItem) activeSentenceItem.classList.remove('active');
        activeSentenceItem = li;
        li.classList.add('active');
        speak(pair.en, {});
      });
      const saveBtn = li.querySelector('.sentence-save');
      saveBtn.addEventListener('click', () => {
        saveToHistory(pair.en, pair.ja);
        saveBtn.textContent = '✅ 保存済み';
        setTimeout(() => { saveBtn.textContent = '💾 保存'; }, 1200);
      });
      sentenceList.appendChild(li);
    });
  }

  saveFullBtn.addEventListener('click', () => {
    if (!lastTranslation) return;
    saveToHistory(lastTranslation.en, lastTranslation.ja);
    saveFullBtn.textContent = '✅ 保存済み';
    setTimeout(() => { saveFullBtn.textContent = '💾 全文を保存'; }, 1200);
  });

  // ---------- History (My Phrases) ----------
  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveHistoryList(list) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  }

  function saveToHistory(en, ja) {
    const list = loadHistory();
    if (list.some((item) => item.en === en)) return;
    list.unshift({ en, ja, date: new Date().toISOString() });
    saveHistoryList(list);
    renderHistory();
  }

  function renderHistory() {
    const list = loadHistory();
    historyList.innerHTML = '';
    if (!list.length) {
      historyList.innerHTML = '<li class="muted small">保存したフレーズはここに表示されます。</li>';
      return;
    }
    list.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = 'sentence-item';
      li.innerHTML = `
        <div class="sentence-en">${escapeHtml(item.en)}</div>
        <div class="sentence-ja">${escapeHtml(item.ja)}</div>
        <div class="sentence-actions">
          <button type="button" class="btn btn-ghost btn-sm h-play">▶ 再生</button>
          <button type="button" class="btn btn-ghost btn-sm h-load">📥 入力欄へ</button>
          <button type="button" class="btn btn-ghost btn-sm h-delete">🗑 削除</button>
        </div>
      `;
      li.querySelector('.h-play').addEventListener('click', () => speak(item.en, {}));
      li.querySelector('.h-load').addEventListener('click', () => {
        englishInput.value = item.en;
        updateCharCount();
        handleTranslate();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      li.querySelector('.h-delete').addEventListener('click', () => {
        const l = loadHistory();
        l.splice(idx, 1);
        saveHistoryList(l);
        renderHistory();
      });
      historyList.appendChild(li);
    });
  }

  clearHistoryBtn.addEventListener('click', () => {
    if (!loadHistory().length) return;
    if (confirm('保存したフレーズをすべて削除しますか？')) {
      saveHistoryList([]);
      renderHistory();
    }
  });

  // ---------- Input area actions ----------
  translateBtn.addEventListener('click', handleTranslate);

  sampleBtn.addEventListener('click', () => {
    englishInput.value = SAMPLE_TEXT;
    updateCharCount();
    handleTranslate();
  });

  clearBtn.addEventListener('click', () => {
    englishInput.value = '';
    updateCharCount();
    translationOutput.textContent = 'ここに日本語訳が表示されます。';
    sentenceList.innerHTML = '<li class="muted small">翻訳すると、ここに文ごとのリストが表示されます。</li>';
    textDisplay.innerHTML = '';
    lastTranslation = null;
    stopAll();
  });

  englishInput.addEventListener('input', updateCharCount);
  englishInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleTranslate();
    }
  });

  // ---------- Init ----------
  updateCharCount();
  updateChipActive();
  renderHistory();
})();
