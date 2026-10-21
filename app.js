(() => {
  'use strict';

  const DB_NAME = 'namiama-local-vault';
  const DB_VERSION = 1;
  const STORE_NAME = 'entries';
  const output = document.getElementById('console-output');
  const storageStatus = document.getElementById('storage-status');
  const songForm = document.getElementById('song-form');
  const evidenceForm = document.getElementById('evidence-form');
  const songLyrics = document.getElementById('song-lyrics');
  const songAudio = document.getElementById('song-audio');
  const evidenceMedia = document.getElementById('evidence-media');
  const songList = document.getElementById('vault-song-list');
  const evidenceList = document.getElementById('vault-evidence-list');
  const songFileNote = document.getElementById('song-file-note');
  const evidenceFileNote = document.getElementById('evidence-file-note');
  const breathPanel = document.getElementById('breath-panel');
  const breathToggle = document.getElementById('breath-toggle');
  const breathInstrument = document.getElementById('breath-instrument');
  const breathPhase = document.getElementById('breath-phase');
  const breathCount = document.getElementById('breath-count');
  let dbPromise;
  let breathTimer = null;
  let breathSeconds = 0;
  let objectUrls = [];

  const actuatorOutput = {
    phonetics: [
      ['SOLAFIN-8', 'The Boundless Solar Spark in the 8th Sphere.'],
      ['SALEREIN', 'The Alchemical Fixed Sovereign Vessel.'],
      ['NYNAXAS', 'The 9-Axis Grid Center Point.']
    ],
    gematria: [
      ['Target Matrix Key', 'SOVEREIGN'],
      ['Raw Gematria Score', '114'],
      ['Nous Core Reduction', '6 — Perfect Hexagram Macrocosm Seal', 'accent']
    ],
    abjad: [
      ['Target Space Tensor', 'WESZAX'],
      ['Total Aligned Weight', '379'],
      ['Spindle Reduction', '19 → 1+9 = 10 → 1 — The Vertical I-Axis Established']
    ],
    manus: [
      ['Actuator Target', 'MANUS (The Hand)'],
      ['Alphanumeric Weight', '68 → 6+8 = 14 → 5 — Pentagram Execution Key', 'gold'],
      ['Scribal Verdict', 'Nous conceives the loop, Manus seals the matrix.']
    ]
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setStatus(message, state = 'ready') {
    storageStatus.dataset.state = state;
    const label = storageStatus.querySelector('span:nth-child(2)');
    if (label) label.textContent = message;
  }

  function showOutput(lines) {
    output.replaceChildren();
    lines.forEach(([key, value, accent]) => {
      const row = el('p', 'console-line');
      const keyNode = el('span', 'console-key', `${key.padEnd(23, ' ')}: `);
      const valueClass = accent === 'accent' ? 'console-accent' : 'console-value';
      const valueNode = el('span', valueClass, value);
      if (accent === 'gold') valueNode.style.color = 'var(--gold)';
      row.append(keyNode, valueNode);
      output.appendChild(row);
    });
  }

  function openDatabase() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support IndexedDB.'));
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            store.createIndex('kind', 'kind', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Unable to open the local archive.'));
        request.onblocked = () => reject(new Error('The archive is blocked by another open tab. Close the other NAMIAMA tab and reload.'));
      });
    }
    return dbPromise;
  }

  async function storeEntry(entry) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const request = transaction.objectStore(STORE_NAME).add(entry);
      let savedId;
      request.onsuccess = () => { savedId = request.result; };
      transaction.oncomplete = () => resolve(savedId);
      transaction.onerror = () => reject(transaction.error || new Error('The entry could not be saved.'));
      transaction.onabort = () => reject(transaction.error || new Error('The archive could not complete this save.'));
    });
  }

  async function readEntries() {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
      request.onerror = () => reject(request.error || new Error('Could not read the local archive.'));
    });
  }

  async function deleteEntry(id) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(Number(id));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('The entry could not be removed.'));
      transaction.onabort = () => reject(transaction.error || new Error('The archive could not complete this removal.'));
    });
  }

  function formatDate(timestamp) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
  }

  function createAttachment(entry, contextLabel) {
    if (!entry.media || !(entry.media.blob instanceof Blob)) return null;
    const url = URL.createObjectURL(entry.media.blob);
    objectUrls.push(url);
    const mime = entry.media.mimeType || entry.media.blob.type || '';
    let mediaNode;
    if (mime.startsWith('audio/')) {
      mediaNode = el('audio', 'entry-attachment');
      mediaNode.controls = true;
      mediaNode.preload = 'metadata';
    } else if (mime.startsWith('video/')) {
      mediaNode = el('video', 'entry-attachment');
      mediaNode.controls = true;
      mediaNode.preload = 'metadata';
      mediaNode.playsInline = true;
    } else if (mime.startsWith('image/')) {
      mediaNode = el('img', 'entry-attachment');
      mediaNode.alt = contextLabel;
      mediaNode.loading = 'lazy';
    } else {
      return null;
    }
    mediaNode.src = url;
    return mediaNode;
  }

  function makeEntryCard(entry) {
    const card = el('article', 'entry-card');
    const head = el('div', 'entry-head');
    const titleGroup = el('div');
    const title = el('h4', 'entry-title', entry.title || entry.time || 'Untitled entry');
    const meta = el('time', 'entry-meta', entry.kind === 'track' ? formatDate(entry.createdAt) : `${entry.time} · ${formatDate(entry.createdAt)}`);
    meta.dateTime = new Date(entry.createdAt).toISOString();
    titleGroup.append(title, meta);
    const deleteButton = el('button', 'entry-delete', 'REMOVE');
    deleteButton.type = 'button';
    deleteButton.dataset.deleteEntry = String(entry.id);
    deleteButton.setAttribute('aria-label', `Remove ${entry.title || entry.time || 'entry'} from this device`);
    head.append(titleGroup, deleteButton);
    card.appendChild(head);

    if (entry.kind === 'track' && entry.lyrics) card.appendChild(el('p', 'entry-body', entry.lyrics));
    if (entry.kind === 'evidence' && entry.description) card.appendChild(el('p', 'entry-body', entry.description));
    if (entry.media) {
      const attachmentLabel = el('p', 'attachment-label', `ATTACHED // ${entry.media.fileName || 'Local media'}`);
      card.append(attachmentLabel);
      const preview = createAttachment(entry, entry.kind === 'track' ? `${entry.title} audio` : `Evidence from ${entry.time}`);
      if (preview) card.appendChild(preview);
    }
    return card;
  }

  function renderList(container, entries, kind, emptyMessage) {
    const filtered = entries.filter((entry) => entry.kind === kind);
    container.replaceChildren();
    if (!filtered.length) {
      container.appendChild(el('p', 'empty-state', emptyMessage));
      return;
    }
    filtered.forEach((entry) => container.appendChild(makeEntryCard(entry)));
  }

  async function loadVaultData() {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls = [];
    const entries = await readEntries();
    const tracks = entries.filter((entry) => entry.kind === 'track');
    const evidence = entries.filter((entry) => entry.kind === 'evidence');
    renderList(songList, entries, 'track', 'No tracks anchored yet. Your archive begins with the first signal.');
    renderList(evidenceList, entries, 'evidence', 'No observations recorded. The field is quiet.');
    document.getElementById('track-count').firstChild.textContent = String(tracks.length).padStart(2, '0');
    document.getElementById('evidence-count').firstChild.textContent = String(evidence.length).padStart(2, '0');
    setStatus(`${tracks.length} track${tracks.length === 1 ? '' : 's'} · ${evidence.length} observation${evidence.length === 1 ? '' : 's'} indexed in this browser`);
  }

  function updateCharacterCount() {
    const count = songLyrics.value.length;
    const counter = document.getElementById('lyrics-count');
    counter.firstChild.textContent = String(count);
    counter.style.color = count >= 4900 ? 'var(--fuchsia)' : '';
    songLyrics.setCustomValidity(count > 4999 ? 'Use fewer than 5,000 characters.' : '');
  }

  function fileNote(fileInput, note, baseMessage) {
    const file = fileInput.files && fileInput.files[0];
    note.textContent = file ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB · stored only on this device` : baseMessage;
  }

  async function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
      try { await navigator.storage.persist(); } catch (_) { /* Browser may decline persistence; IndexedDB still works. */ }
    }
  }

  async function handleSongSubmit(event) {
    event.preventDefault();
    updateCharacterCount();
    if (!songForm.reportValidity()) return;
    const submit = songForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const file = songAudio.files && songAudio.files[0];
      await storeEntry({
        kind: 'track',
        title: document.getElementById('song-title').value.trim(),
        lyrics: songLyrics.value,
        createdAt: Date.now(),
        media: file ? { blob: file, fileName: file.name, mimeType: file.type } : null
      });
      await requestPersistentStorage();
      songForm.reset();
      updateCharacterCount();
      fileNote(songAudio, songFileNote, "Audio stays in this browser's local archive.");
      await loadVaultData();
      showOutput([['Vault action', 'Personal-code track anchored.'], ['Storage', 'Indexed locally on this device.']]);
    } catch (error) {
      setStatus(error.message || 'Track could not be saved. Check available browser storage.', 'error');
    } finally {
      submit.disabled = false;
    }
  }

  async function handleEvidenceSubmit(event) {
    event.preventDefault();
    if (!evidenceForm.reportValidity()) return;
    const submit = evidenceForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const file = evidenceMedia.files && evidenceMedia.files[0];
      await storeEntry({
        kind: 'evidence',
        time: document.getElementById('evidence-time').value.trim(),
        description: document.getElementById('evidence-desc').value.trim(),
        createdAt: Date.now(),
        media: file ? { blob: file, fileName: file.name, mimeType: file.type } : null
      });
      await requestPersistentStorage();
      evidenceForm.reset();
      fileNote(evidenceMedia, evidenceFileNote, "Images and video remain in this browser's local archive.");
      await loadVaultData();
      showOutput([['Evidence log', 'Anomalous occurrence recorded.'], ['Storage', 'Indexed locally on this device.']]);
    } catch (error) {
      setStatus(error.message || 'Evidence could not be saved. Check available browser storage.', 'error');
    } finally {
      submit.disabled = false;
    }
  }

  const breathPhases = [
    { label: 'INHALE', cue: 'Draw the current up the Z-Axis spine.' },
    { label: 'HOLD / FULL', cue: 'Filter volatile voltage via Solar-Fin 8.' },
    { label: 'EXHALE', cue: 'Ground the solar currency into the flesh vehicle.' },
    { label: 'HOLD / EMPTY', cue: 'Drop completely into the Nynaxos Void.' }
  ];

  function stopBreath(finished = false) {
    if (breathTimer) window.clearInterval(breathTimer);
    breathTimer = null;
    breathInstrument.classList.remove('is-breathing');
    breathToggle.textContent = 'Begin the 8-8-8-8 cycle →';
    breathPhase.textContent = finished ? 'CYCLE COMPLETE' : 'SEQUENCE READY';
    breathCount.textContent = '08';
    if (finished) showOutput([['Breath void', 'One 9-Axis cycle complete. Return whenever you are ready.']]);
  }

  function updateBreathReadout() {
    const phaseIndex = Math.floor(breathSeconds / 8);
    const secondsIntoPhase = breathSeconds % 8;
    const phase = breathPhases[phaseIndex];
    breathPhase.textContent = phase.label;
    breathCount.textContent = String(8 - secondsIntoPhase).padStart(2, '0');
  }

  function startBreath() {
    if (breathTimer) {
      stopBreath(false);
      showOutput([['Breath void', 'Sequence paused. Return to idle when ready.']]);
      return;
    }
    breathSeconds = 0;
    breathInstrument.classList.add('is-breathing');
    breathToggle.textContent = 'Stop sequence ■';
    updateBreathReadout();
    showOutput([['Breath void', '8-8-8-8 sequence engaged.'], ['Current phase', `${breathPhases[0].label} — ${breathPhases[0].cue}`], ['Timing', 'Eight seconds per phase · 32 seconds total']]);
    breathTimer = window.setInterval(() => {
      breathSeconds += 1;
      if (breathSeconds >= 32) {
        stopBreath(true);
        return;
      }
      updateBreathReadout();
      if (breathSeconds % 8 === 0) {
        const phase = breathPhases[Math.floor(breathSeconds / 8)];
        showOutput([['Breath void', '8-8-8-8 sequence engaged.'], ['Current phase', `${phase.label} — ${phase.cue}`], ['Timing', `${32 - breathSeconds} seconds remaining`]]);
      }
    }, 1000);
  }

  function showActuator(action) {
    if (action === 'breath') {
      breathPanel.hidden = false;
      showOutput([['Breath void', 'Prepare for four measured phases: inhale, hold, exhale, hold.'], ['Cycle', '8 seconds per phase · 8-8-8-8'], ['Ready', 'Begin when comfortable; you may stop at any time.']]);
      breathPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (breathTimer) stopBreath(false);
    breathPanel.hidden = true;
    if (actuatorOutput[action]) showOutput(actuatorOutput[action]);
  }

  async function handleDelete(event) {
    const button = event.target.closest('[data-delete-entry]');
    if (!button) return;
    const card = button.closest('.entry-card');
    const title = card && card.querySelector('.entry-title') ? card.querySelector('.entry-title').textContent : 'this entry';
    if (!window.confirm(`Remove “${title}” and its attached media from this browser? This cannot be undone.`)) return;
    try {
      await deleteEntry(button.dataset.deleteEntry);
      await loadVaultData();
      setStatus('Entry and attached media removed from this browser.');
    } catch (error) {
      setStatus(error.message || 'Could not remove this entry.', 'error');
    }
  }

  function updateClock() {
    document.getElementById('console-clock').textContent = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
  }

  document.querySelector('.actuator-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (button) showActuator(button.dataset.action);
  });
  songForm.addEventListener('submit', handleSongSubmit);
  evidenceForm.addEventListener('submit', handleEvidenceSubmit);
  songLyrics.addEventListener('input', updateCharacterCount);
  songAudio.addEventListener('change', () => fileNote(songAudio, songFileNote, "Audio stays in this browser's local archive."));
  evidenceMedia.addEventListener('change', () => fileNote(evidenceMedia, evidenceFileNote, "Images and video remain in this browser's local archive."));
  songList.addEventListener('click', handleDelete);
  evidenceList.addEventListener('click', handleDelete);
  breathToggle.addEventListener('click', startBreath);

  updateCharacterCount();
  updateClock();
  window.setInterval(updateClock, 1000);
  loadVaultData().catch((error) => setStatus(error.message || 'The local archive could not be opened.', 'error'));
})();
