// Yapboz sayfası: kurulum, birlikte eşleme (SÖZLEŞME §12), HUD ve kayıt.
// Üstteki saf yardımcılar dışa aktarılır ve testlenir (tests/yapboz-page-*.test.mjs).
// Sayfa kodu yalnız tarayıcıda çalışır; modüller dinamik yüklenir, böylece Node testleri
// çekirdek modüllere dokunmadan bu dosyayı içe aktarabilir.

const NS = 'yapboz';
const SEND_MS = 100; // move ve cur en kısa aralığı
const HASH_MS = 5000; // ev sahibi -> misafir özet
const SAVE_MS = 3000; // kayıt kısma
const QUIET_MS = 1000; // need öncesi sessizlik
const NEED_GAP_MS = 2000; // iki need arası en az
const JOIN_RETRY_MS = 5000; // misafir hello beklerken join tekrarı
const PEER_GRACE_MS = 10000; // presence gecikse de son mesajdan sonra karşı taraf "ulaşılır"
const BANNER_DELAY_MS = 4000; // ilk presence gelmeden "burada değil" yanıp sönmesin
const NOTE_MAX = 200;
const DEFAULT_COUNT = 200;
const ZOOM_STEP = 1.25;

// ---------------------------------------------------------------------------
// Saf yardımcılar
// ---------------------------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, '0');
const safeMs = (ms) => (Number.isFinite(ms) && ms > 0 ? ms : 0);

// Sayaç: mm:ss, bir saati geçince h:mm:ss.
export function formatClock(ms) {
  const s = Math.floor(safeMs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}

// Bitiş ekranı için okunur süre: "45 sn", "12 dk 34 sn", "1 sa 5 dk".
export function formatDuration(ms) {
  const s = Math.round(safeMs(ms) / 1000);
  if (s < 60) return `${s} sn`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (!h) return sec ? `${m} dk ${sec} sn` : `${m} dk`;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
}

// Durdurulabilir sayaç. set() tabanı değiştirir; çalışıyorsa oradan sayar.
export function createClock(now = () => Date.now()) {
  let base = 0;
  let since = null;
  return {
    value: () => base + (since === null ? 0 : now() - since),
    set(ms) {
      base = safeMs(ms);
      if (since !== null) since = now();
    },
    start() {
      if (since === null) since = now();
    },
    stop() {
      if (since === null) return;
      base += now() - since;
      since = null;
    },
    get running() {
      return since !== null;
    },
  };
}

// Oyun içi giden mesajları kısar (§4 bütçe, §12 eylemler).
// Tek sıra: interval'de en fazla BİR mesaj gider (sürekli en fazla 10 mesaj/sn).
// Sıra korunur: grab o grubun move'larından önce, bekleyen move drop'tan önce gider.
// Aynı grubun art arda move'ları tek kayıtta birleşir (yalnız son konum); grab / drop / scatter
// araya girince o gruplar için yeni kayıt açılır. İmleç yalnız sıra boşken gider, o da birleşir.
// push(msg): deny, hash gibi ham mesajlar aynı sıraya girer.
export function createSender(send, {
  interval = SEND_MS,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  const queue = []; // [{ g, msg }] gönderim sırası
  const open = new Map(); // g -> sıradaki birleşebilir move kaydı
  let cursor = null;
  let last = -Infinity;
  let timer = null;

  function tick() {
    timer = null;
    let msg = null;
    const item = queue.shift();
    if (item) {
      if (open.get(item.g) === item) open.delete(item.g);
      msg = item.msg;
    } else if (cursor) {
      msg = cursor;
      cursor = null;
    }
    if (!msg) return;
    last = now();
    send(msg);
    if (queue.length || cursor) schedule();
  }

  function schedule() {
    if (timer !== null) return;
    const wait = last + interval - now();
    if (wait <= 0) tick();
    else timer = setTimer(tick, wait);
  }

  function push(msg, g = null) {
    const item = { g, msg };
    // Birleşebilir kayıt, hemen gidebileceği için sıraya girmeden önce işaretlenir.
    if (g !== null) open.set(g, item);
    queue.push(item);
    schedule();
  }

  return {
    act(a) {
      if (!a || typeof a !== 'object') return;
      if (a.type === 'cursor') {
        cursor = { t: 'cur', x: a.x, y: a.y };
        schedule();
        return;
      }
      if (a.type === 'move') {
        const item = open.get(a.g);
        if (item) item.msg = { t: 'act', a };
        else push({ t: 'act', a }, a.g);
        return;
      }
      // grab / drop / scatter: dokunduğu grupların sonraki move'ları bunun ardına yazılır.
      open.delete(a.g);
      if (Array.isArray(a.pieces)) a.pieces.forEach((id) => open.delete(id));
      if (Array.isArray(a.moves)) a.moves.forEach((m) => open.delete(m?.g));
      push({ t: 'act', a });
    },
    push(msg) {
      push(msg);
    },
    // Yerel sürükleme iptal: o grubun henüz gitmemiş grab ve move'ları atılır
    // (cancelLocalDrag drop yaymaz; geç giden grab karşıda tutma bırakmasın).
    forget(g) {
      open.delete(g);
      for (let i = queue.length - 1; i >= 0; i--) {
        const a = queue[i].msg.a;
        if (a && a.g === g && (a.type === 'grab' || a.type === 'move')) queue.splice(i, 1);
      }
    },
    clear() {
      queue.length = 0;
      open.clear();
      cursor = null;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
  };
}

// Gönderen kabul edilir mi? (§10) Misafir yalnız ev sahibini (hostId), ev sahibi yalnız şimdiki partneri dinler.
export function acceptSender({ isHost, hostId, partnerId, fromId }) {
  if (!fromId) return false;
  return isHost ? fromId === partnerId : fromId === hostId;
}

// Yalnız ev sahibinin yolladığı mesajlar (§12).
const HOST_MSGS = new Set(['hello', 'state', 'setup', 'hash', 'deny']);

// Rol çakışması: küçük clientId ev sahibidir. Dönüş: sayfanın yeniden açılacağı host | null.
// Ev sahibi başkasından ev sahibi mesajı alırsa ikisi de ev sahibi: büyük olan misafir olur.
// Misafir, ev sahibi sandığı kişiden join alırsa ikisi de misafir: küçük olan ev sahibi olur.
export function roleConflict({ isHost, myId, hostId, t, fromId }) {
  if (!myId || !fromId || fromId === myId) return null;
  if (isHost) return HOST_MSGS.has(t) && myId > fromId ? fromId : null;
  return t === 'join' && fromId === hostId && myId < fromId ? myId : null;
}

// Gelen eylem için karar (§12 çakışma). dragging = yerelde sürüklenen grup id | null.
// Dönüş: { apply, cancelLocal, deny (g | null), resync }.
// Ev sahibi kazanır: kendi tuttuğu grubu isteyen grab'e deny; o grubun move/drop'u yok;
// tuttuğu gruba dokunan drop/scatter uygulanmaz, misafire tam durum (resync) gider.
// Misafir: tuttuğu gruba dokunan eylemde önce cancelLocalDrag, sonra uygular.
export function createConflictGate(isHost) {
  const denied = new Set();
  const NONE = { apply: false, cancelLocal: false, deny: null, resync: false };
  const APPLY = { apply: true, cancelLocal: false, deny: null, resync: false };
  const KNOWN = new Set(['grab', 'move', 'drop', 'scatter']);
  const touches = (a, g) =>
    g !== null &&
    g !== undefined &&
    (a.g === g ||
      (Array.isArray(a.pieces) && a.pieces.includes(g)) ||
      (Array.isArray(a.moves) && a.moves.some((m) => m && m.g === g)));

  function host(a, dragging) {
    switch (a.type) {
      case 'grab':
        if (a.g === dragging) {
          denied.add(a.g);
          return { ...NONE, deny: a.g };
        }
        denied.delete(a.g);
        return APPLY;
      case 'move':
        return a.g === dragging || denied.has(a.g) ? NONE : APPLY;
      case 'drop':
        if (denied.has(a.g)) {
          denied.delete(a.g);
          return { ...NONE, resync: true };
        }
        return touches(a, dragging) ? { ...NONE, resync: true } : APPLY;
      default: // scatter
        return touches(a, dragging) ? { ...NONE, resync: true } : APPLY;
    }
  }

  return {
    incoming(a, dragging) {
      if (!a || typeof a !== 'object' || !KNOWN.has(a.type)) return NONE;
      if (isHost) return host(a, dragging);
      return touches(a, dragging) ? { ...APPLY, cancelLocal: true } : APPLY;
    },
    reset() {
      denied.clear();
    },
  };
}

// Misafir: hash farkında need gönderilsin mi? (§12: sürüklemiyor ve son 1 sn eylem yok)
export function shouldRequestState({ local, remote, dragging, lastActAt, lastNeedAt, now }) {
  if (remote === undefined || remote === null || remote === local) return false;
  if (dragging) return false;
  if (now - lastActAt < QUIET_MS) return false;
  return now - lastNeedAt >= NEED_GAP_MS;
}

// onProgress ile aynı formül: round(100*(total-groups)/(total-1)).
export function progressFromState(state, total) {
  const groups = Array.isArray(state?.groups) ? state.groups.length : 0;
  if (!groups || !(total > 1)) return groups === 1 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((100 * (total - groups)) / (total - 1))));
}

export function isBoardState(s) {
  return Boolean(s) && typeof s === 'object' && Array.isArray(s.groups);
}

// hello mesajını doğrular ve normalleştirir; bozuksa null.
export function readHello(m) {
  if (!m || typeof m !== 'object' || typeof m.photo !== 'string' || !m.photo) return null;
  const { cols, rows } = m;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 || cols * rows > 5000) {
    return null;
  }
  if (typeof m.seed !== 'number' || !Number.isFinite(m.seed)) return null;
  return {
    photo: m.photo,
    cols,
    rows,
    seed: m.seed,
    count: Number.isInteger(m.count) && m.count > 0 ? m.count : cols * rows,
    note: typeof m.note === 'string' ? m.note.slice(0, NOTE_MAX) : '',
    elapsed: safeMs(m.elapsed),
    sig: `${m.photo}|${cols}x${rows}|${m.seed}`,
  };
}

// ---------------------------------------------------------------------------
// Sayfa
// ---------------------------------------------------------------------------

const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const ICON = {
  out: svg('<path d="M5 12h14"/>'),
  in: svg('<path d="M12 5v14M5 12h14"/>'),
  fit: svg('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  edge: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M9 9h6v6H9z" stroke-dasharray="2 2.4"/>'),
  ghost: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>'),
  shuffle: svg('<path d="M3 7h3.5c5 0 6 10 11 10H21M3 17h3.5c2 0 3.2-1.6 4.2-3.5M13.3 9.5C14.3 8 15.5 7 17.5 7H21M18 4l3 3-3 3M18 14l3 3-3 3"/>'),
  fresh: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M12 8v8M8 12h8"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  heart: svg('<path d="M12 20.5s-7.6-4.6-9.4-9.3C1.4 7.9 3.6 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.4 4.4 6.7-1.8 4.7-9.4 9.3-9.4 9.3Z"/>'),
};

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value; // yalnız sabit SVG simgeleri
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const kid of kids.flat()) {
    if (kid !== null && kid !== undefined && kid !== false) node.append(kid);
  }
  return node;
}

function showFatal(app) {
  app.replaceChildren(
    el('section', { class: 'screen center yb-screen' },
      el('div', { class: 'card stack yb-card yb-wait' },
        el('p', { class: 'subtitle', text: 'Yapboz açılamadı. Sayfayı yenilemeyi dener misin?' }),
        el('button', { type: 'button', class: 'btn primary', text: 'Yenile', onclick: () => location.reload() }))),
  );
}

async function loadModules() {
  const [room, identity, ui, sound, storage, db, grid, board, image, store] = await Promise.all([
    import('../../js/core/room.js'),
    import('../../js/core/identity.js'),
    import('../../js/core/ui.js'),
    import('../../js/core/sound.js'),
    import('../../js/core/storage.js'),
    import('../../js/core/db.js'),
    import('./grid.js'),
    import('./board.js'),
    import('./image.js'),
    import('./store.js'),
  ]);
  return { room, identity, ui, sound, storage, db, grid, board, image, store };
}

async function main() {
  const app = document.getElementById('app');
  let mods;
  let room;
  let roomId;
  let hostId;
  let isHost;
  try {
    mods = await loadModules();
    ({ roomId, hostId, isHost } = mods.identity.readGameParams());
    room = await mods.room.joinRoom({ roomId, ns: NS });
    mods.ui.mountShell({ title: 'Yapboz', room });
  } catch (err) {
    console.error(err);
    showFatal(app);
    return;
  }
  const { identity, ui, sound, storage, db, grid, store } = mods;
  const { normalizeImage, decodeImage, PhotoError } = mods.image;
  const Board = mods.board.Board || mods.board.default;
  const PIECE_COUNTS = Array.isArray(grid.PIECE_COUNTS) && grid.PIECE_COUNTS.length ? grid.PIECE_COUNTS : [100, 200, 500, 1000];

  // ---- durum ----
  let screen = ''; // 'start' | 'setup' | 'wait' | 'game'
  let board = null;
  let game = null; // { photoBlob?, photoUrl|photo, cols, rows, seed, count, note, done, sig? }
  let view = null; // oyun görünümü DOM referansları
  let saved = null; // ev sahibi: son kayıt
  let dirty = false;
  let partnerHere = false;
  let lastHeardAt = -Infinity;
  let lastActAt = -Infinity;
  let lastNeedAt = -Infinity;
  let lastJoinAt = -Infinity;
  let loadSeq = 0;
  let loadingSig = null;
  let pendingState = null;
  let pendingActs = [];
  let waitKind = '';
  let waitText = null;
  let setupApi = null;
  let closeCelebrate = null;
  let screenUrls = [];
  let bannerReady = false;
  let bannerDismissed = false;
  let relaunching = false;
  const toggles = { edge: false, ghost: false };
  const now = () => performance.now();
  const clock = createClock(now);
  const gate = createConflictGate(isHost);
  const peerOnline = () => Boolean(roomId) && (partnerHere || now() - lastHeardAt < PEER_GRACE_MS);
  const sender = createSender((msg) => {
    if (peerOnline()) room.send(msg);
  }, { now });

  // ---- "Sevgilin henüz burada değil" şeridi (ev sahibi, odalı) ----
  // Kurulum/devam kartının başında durur; oyunda masanın üstünde yüzer.
  const banner = isHost && roomId
    ? el('div', { class: 'yb-banner', role: 'status', hidden: true },
      el('span', { class: 'yb-banner-text', text: 'Sevgilin henüz burada değil' }),
      el('button', { type: 'button', class: 'btn small primary', text: 'Davet et', onclick: () => ui.shareInvite(roomId) }),
      el('button', {
        type: 'button',
        class: 'yb-x',
        'aria-label': 'Kapat',
        html: ICON.close,
        onclick: () => {
          bannerDismissed = true;
          updatePresenceUi();
        },
      }))
    : null;
  setTimeout(() => {
    bannerReady = true;
    updatePresenceUi();
  }, BANNER_DELAY_MS);

  // ---- ekran yönetimi ----
  function leaveGame() {
    sender.clear();
    gate.reset();
    if (board) {
      try {
        board.destroy();
      } catch (err) {
        console.error(err);
      }
      board = null;
    }
    view = null;
    clock.stop();
    document.documentElement.classList.remove('yb-lock');
  }

  function clearApp() {
    leaveGame();
    setupApi = null;
    waitText = null;
    for (const url of screenUrls) URL.revokeObjectURL(url);
    screenUrls = [];
    app.replaceChildren();
    screen = '';
  }

  function dismissCelebrate() {
    const close = closeCelebrate;
    closeCelebrate = null;
    if (typeof close === 'function') close();
  }

  function goLobby() {
    location.href = identity.lobbyUrl();
  }

  // Rol çakışmasında sayfayı doğru rolle yeniden aç. Yerel kayıt silinmez; önce son hâli yazılır.
  async function relaunch(host) {
    if (relaunching) return;
    relaunching = true;
    sender.clear();
    await saveNow();
    location.replace(identity.gameUrl(NS, { roomId, host }));
  }

  // ---- ev sahibi: yarım kalan yapboz ----
  function renderStart(rec) {
    clearApp();
    screen = 'start';
    const url = rec.photoBlob ? URL.createObjectURL(rec.photoBlob) : null;
    if (url) screenUrls.push(url);
    const pct = progressFromState(rec.state, rec.cols * rec.rows);
    const status = el('p', { class: 'yb-status', role: 'status', 'aria-live': 'polite' });
    const goBtn = el('button', { type: 'button', class: 'btn primary', text: 'Kaldığın yerden devam' });
    const newBtn = el('button', { type: 'button', class: 'btn ghost', text: 'Yeni yapboz', onclick: () => renderSetup() });
    goBtn.addEventListener('click', async () => {
      goBtn.disabled = newBtn.disabled = true;
      status.classList.remove('is-error');
      status.textContent = 'Yapboz açılıyor…';
      if (await resume(rec)) return;
      goBtn.disabled = newBtn.disabled = false;
      status.classList.add('is-error');
      status.textContent = 'Bu yapboz açılamadı. Yeni bir yapboz kurabilirsin.';
    });
    app.append(
      el('section', { class: 'screen center yb-screen' },
        el('div', { class: 'card stack yb-card' },
          banner,
          el('h1', { class: 'title', text: 'Yarım kalan yapboz' }),
          url ? el('img', { class: 'yb-thumb', src: url, alt: 'Yarım kalan yapbozun fotoğrafı' }) : null,
          el('p', { class: 'muted yb-meta', text: `${rec.count} parça · %${pct} · ${formatClock(rec.elapsed)}` }),
          goBtn,
          newBtn,
          status)),
    );
  }

  async function resume(rec) {
    try {
      const blob = rec.photoBlob || (rec.photoUrl ? await storage.loadPhoto(rec.photoUrl) : null);
      if (!blob) return false;
      const { image } = await decodeImage(blob);
      let photoUrl = rec.photoUrl || null;
      if (roomId && !photoUrl) photoUrl = await storage.uploadPhoto(blob, roomId);
      return startGame({ ...rec, photoBlob: blob, photoUrl }, image, rec.state);
    } catch (err) {
      console.error(err);
      return false;
    }
  }

  // ---- ev sahibi: kurulum ----
  function renderSetup({ error = '' } = {}) {
    clearApp();
    screen = 'setup';
    let picked = null;
    let count = PIECE_COUNTS.includes(DEFAULT_COUNT) ? DEFAULT_COUNT : PIECE_COUNTS[0];
    let busy = false;
    let picking = false;
    let pickSeq = 0;
    let previewUrl = null;

    const canDrop = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const input = el('input', { type: 'file', accept: 'image/*', class: 'yb-file' });
    const preview = el('img', { class: 'yb-preview', alt: 'Seçilen fotoğraf', hidden: true });
    const pickTitle = el('strong', { text: 'Fotoğraf seç' });
    const pickHint = el('span', { class: 'muted', text: canDrop ? 'ya da buraya sürükle' : 'Galeriden ya da kameradan' });
    const pick = el('label', { class: 'yb-pick' }, input, preview, el('span', { class: 'yb-pick-text' }, pickTitle, pickHint));
    const segBtns = PIECE_COUNTS.map((n) =>
      el('button', {
        type: 'button',
        'aria-pressed': 'false',
        text: String(n),
        onclick: () => {
          count = n;
          refresh();
        },
      }));
    const gridInfo = el('p', { class: 'muted yb-grid-info', 'aria-live': 'polite' });
    const note = el('textarea', {
      id: 'yb-note',
      class: 'input yb-note',
      maxlength: NOTE_MAX,
      rows: 3,
      placeholder: roomId ? 'Ona küçük bir sürpriz yaz. Bitince ikiniz de göreceksiniz.' : 'Kendine küçük bir not. Bitince yalnız sen göreceksin.',
    });
    const noteCount = el('span', { class: 'muted', text: `0/${NOTE_MAX}` });
    const startBtn = el('button', { type: 'button', class: 'btn primary yb-start', text: 'Başla' });
    const status = el('p', { class: 'yb-status', role: 'status', 'aria-live': 'polite' });
    const canGoBack = Boolean(saved && !saved.done && saved.state);
    const backBtn = canGoBack
      ? el('button', { type: 'button', class: 'btn ghost', text: 'Yarım kalana dön' })
      : null;

    function setStatus(text, isError = false) {
      status.textContent = text;
      status.classList.toggle('is-error', isError);
    }

    function refresh() {
      segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(PIECE_COUNTS[i] === count)));
      if (picked) {
        const g = grid.computeGrid(count, picked.width, picked.height);
        gridInfo.textContent = `${g.cols} × ${g.rows} = ${g.count} parça`;
      } else {
        gridInfo.textContent = 'Fotoğraf seçince tam parça sayısı görünür.';
      }
      startBtn.disabled = busy || picking || !picked;
      input.disabled = busy;
      segBtns.forEach((b) => (b.disabled = busy));
      if (backBtn) backBtn.disabled = busy;
    }

    async function handleFile(file) {
      if (!file || busy) return;
      const seq = ++pickSeq;
      picking = true;
      refresh();
      pick.classList.add('is-busy');
      pickTitle.textContent = 'Fotoğraf hazırlanıyor…';
      setStatus('');
      try {
        const res = await normalizeImage(file);
        if (seq !== pickSeq) return;
        picked = res;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(res.blob);
        screenUrls.push(previewUrl);
        preview.src = previewUrl;
        preview.hidden = false;
        pickHint.hidden = true;
        pick.classList.add('has-photo');
      } catch (err) {
        if (seq !== pickSeq) return;
        console.warn(err);
        setStatus(err instanceof PhotoError ? err.message : 'Bu fotoğraf açılamadı. Başka bir fotoğraf dener misin?', true);
      } finally {
        if (seq === pickSeq) {
          picking = false;
          pick.classList.remove('is-busy');
          pickTitle.textContent = picked ? 'Fotoğrafı değiştir' : 'Fotoğraf seç';
          refresh();
        }
        input.value = '';
      }
    }

    async function start() {
      if (!picked || busy || picking) return;
      busy = true;
      refresh();
      startBtn.textContent = 'Fotoğraf hazırlanıyor…';
      setStatus('');
      try {
        const photoUrl = roomId ? await storage.uploadPhoto(picked.blob, roomId) : null;
        const seed = crypto.getRandomValues(new Uint32Array(1))[0];
        const g = grid.computeGrid(count, picked.width, picked.height);
        startGame({
          roomId: roomId || null,
          photoBlob: picked.blob,
          photoUrl,
          cols: g.cols,
          rows: g.rows,
          seed,
          count: g.count,
          note: note.value.trim().slice(0, NOTE_MAX),
          elapsed: 0,
          state: null,
          done: false,
        }, picked.image, null);
      } catch (err) {
        console.error(err);
        busy = false;
        startBtn.textContent = 'Başla';
        refresh();
        setStatus(roomId ? 'Fotoğraf gönderilemedi. Bağlantını kontrol edip tekrar dene.' : 'Bir şeyler ters gitti. Tekrar dener misin?', true);
      }
    }

    input.addEventListener('change', () => handleFile(input.files?.[0]));
    note.addEventListener('input', () => {
      noteCount.textContent = `${note.value.length}/${NOTE_MAX}`;
    });
    startBtn.addEventListener('click', start);
    backBtn?.addEventListener('click', async () => {
      busy = true;
      refresh();
      setStatus('Yapboz açılıyor…');
      if (await resume(saved)) return;
      busy = false;
      refresh();
      setStatus('Bu yapboz açılamadı.', true);
    });
    setupApi = { handleFile, over: (on) => pick.classList.toggle('is-over', on) };

    app.append(
      el('section', { class: 'screen center yb-screen' },
        el('div', { class: 'card stack yb-card' },
          banner,
          el('h1', { class: 'title', text: 'Yeni yapboz' }),
          el('p', { class: 'subtitle', text: roomId ? 'Bir fotoğrafınızı seçin, birlikte tamamlayın.' : 'Bir fotoğraf seç, parçalara bölelim.' }),
          pick,
          el('div', { class: 'yb-field' },
            el('p', { class: 'yb-label', id: 'yb-count-label', text: 'Parça sayısı' }),
            el('div', { class: 'seg', role: 'group', 'aria-labelledby': 'yb-count-label' }, segBtns),
            gridInfo),
          el('div', { class: 'yb-field' },
            el('label', { class: 'yb-label', for: 'yb-note' }, 'Gizli not ', el('span', { class: 'muted', text: '· isteğe bağlı' })),
            note,
            el('div', { class: 'yb-hint' }, el('span', { class: 'muted', text: 'Yapboz bitince ortaya çıkar.' }), noteCount)),
          startBtn,
          status,
          backBtn)),
    );
    refresh();
    if (error) setStatus(error, true);
  }

  // Kurulumdan ya da kayıttan oyuna geçiş (ev sahibi). Başarısızsa kurulum ekranına döner.
  function startGame(rec, image, state) {
    game = { ...rec };
    delete game.state;
    clock.stop();
    clock.set(rec.elapsed || 0);
    try {
      enterGame(image, state);
    } catch (err) {
      console.error(err);
      game = null;
      renderSetup({ error: 'Yapboz açılamadı. Başka bir fotoğrafla dener misin?' });
      return false;
    }
    saveNow();
    if (peerOnline()) {
      sendHello();
      sendState();
    }
    return true;
  }

  // ---- misafir: bekleme ----
  function renderWait(kind) {
    if (screen === 'wait' && waitKind === kind && kind === 'host') {
      updateWaitText();
      return;
    }
    clearApp();
    screen = 'wait';
    waitKind = kind;
    const icon = kind === 'photo'
      ? el('div', { class: 'yb-spinner', 'aria-hidden': 'true' })
      : kind === 'host'
        ? el('div', { class: 'yb-heart', 'aria-hidden': 'true', html: ICON.heart })
        : null;
    waitText = el('p', { class: 'subtitle', role: 'status', 'aria-live': 'polite' });
    const retry = kind === 'error'
      ? el('button', {
        type: 'button',
        class: 'btn primary',
        text: 'Tekrar dene',
        onclick: () => {
          renderWait('host');
          sendJoin();
        },
      })
      : null;
    app.append(
      el('section', { class: 'screen center yb-screen' },
        el('div', { class: 'card stack yb-card yb-wait' },
          icon,
          waitText,
          retry,
          el('button', { type: 'button', class: 'btn ghost', text: 'Ana sayfaya dön', onclick: goLobby }))),
    );
    updateWaitText();
  }

  function updateWaitText() {
    if (screen !== 'wait' || !waitText) return;
    if (waitKind === 'photo') waitText.textContent = 'Fotoğraf indiriliyor…';
    else if (waitKind === 'error') waitText.textContent = 'Fotoğraf indirilemedi. Tekrar dene; olmazsa sevgilin yeni bir yapboz kurabilir.';
    else waitText.textContent = partnerHere ? 'Sevgilin yapbozu hazırlıyor…' : 'Sevgilin dönünce devam edeceksiniz';
  }

  // ---- oyun görünümü ----
  function buildGameView() {
    const canvas = el('canvas', { class: 'yb-canvas', 'aria-label': 'Yapboz masası' });
    const table = el('div', { class: 'yb-table' }, canvas);
    const fill = el('span', { class: 'yb-progress-fill' });
    const bar = el('div', {
      class: 'yb-progress',
      role: 'progressbar',
      'aria-label': 'İlerleme',
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': 0,
    }, fill);
    const pct = el('span', { class: 'yb-pct', text: '%0' });
    const time = el('span', { class: 'yb-time', role: 'timer', 'aria-label': 'Süre', text: '00:00' });
    const tool = (icon, label, onClick, { short, pressed } = {}) =>
      el('button', {
        type: 'button',
        class: 'yb-tool',
        'aria-label': label,
        title: label,
        'aria-pressed': pressed === undefined ? null : String(pressed),
        html: ICON[icon],
        onclick: onClick,
      }, short ? el('span', { class: 'yb-tool-label', text: short }) : null);

    const edgeBtn = tool('edge', 'Kenarlar', () => {
      toggles.edge = !toggles.edge;
      board?.setEdgeOnly(toggles.edge);
      edgeBtn.setAttribute('aria-pressed', String(toggles.edge));
    }, { short: 'Kenarlar', pressed: toggles.edge });
    const ghostBtn = tool('ghost', 'Önizleme', () => {
      toggles.ghost = !toggles.ghost;
      board?.setGhost(toggles.ghost);
      ghostBtn.setAttribute('aria-pressed', String(toggles.ghost));
    }, { short: 'Önizleme', pressed: toggles.ghost });

    const hud = el('div', { class: 'yb-hud', role: 'group', 'aria-label': 'Yapboz araçları' },
      el('div', { class: 'yb-hud-top' },
        el('div', { class: 'yb-zoom' },
          tool('out', 'Uzaklaş', () => board?.zoomBy(1 / ZOOM_STEP)),
          tool('in', 'Yakınlaş', () => board?.zoomBy(ZOOM_STEP)),
          tool('fit', 'Sığdır', () => board?.fitView())),
        el('div', { class: 'yb-stat' }, bar, pct, time)),
      el('div', { class: 'yb-actions' },
        edgeBtn,
        ghostBtn,
        tool('shuffle', 'Karıştır', () => board?.shuffleLoose(), { short: 'Karıştır' }),
        isHost ? tool('fresh', 'Yeni yapboz', () => newPuzzle(true), { short: 'Yeni' }) : null));

    const veil = isHost
      ? null
      : el('div', { class: 'yb-veil', hidden: true },
        el('div', { class: 'card stack yb-veil-card' },
          el('div', { class: 'yb-heart', 'aria-hidden': 'true', html: ICON.heart }),
          el('p', { class: 'subtitle', role: 'status', text: 'Sevgilin dönünce devam edeceksiniz' }),
          el('p', { class: 'muted', text: 'Parçalar yerinde bekliyor.' }),
          el('button', { type: 'button', class: 'btn ghost', text: 'Ana sayfaya dön', onclick: goLobby })));

    const root = el('div', { class: 'yb-game' }, table, hud, veil);
    return { root, table, canvas, hud, bar, fill, pct, time, veil };
  }

  function enterGame(image, state) {
    clearApp();
    screen = 'game';
    view = buildGameView();
    if (banner) view.table.append(banner);
    app.append(view.root);
    document.documentElement.classList.add('yb-lock');
    scrollTo(0, 0);
    // Board kendi tuvalini izler (ResizeObserver) ve ilk ölçümde sığdırır.
    board = new Board(view.canvas, {
      image,
      cols: game.cols,
      rows: game.rows,
      seed: game.seed,
      state: state || null,
      onAction,
      onProgress,
      onSnap,
      onComplete,
    });
    if (toggles.edge) board.setEdgeOnly(true);
    if (toggles.ghost) board.setGhost(true);
    setProgress(progressFromState(board.getState(), game.cols * game.rows));
    updateClock();
    updateTimer();
    updatePresenceUi();
  }

  function setProgress(p) {
    if (!view) return;
    const v = Math.max(0, Math.min(100, Math.round(Number(p) || 0)));
    view.fill.style.width = `${v}%`;
    view.pct.textContent = `%${v}`;
    view.bar.setAttribute('aria-valuenow', String(v));
  }

  // Ev sahibi: görünürken ve bitmemişken sayar. Misafir: ev sahibi buradayken yerelde ilerletir.
  function updateClock() {
    const run = Boolean(board) && Boolean(game) && !game.done &&
      (isHost ? document.visibilityState === 'visible' : partnerHere);
    if (run) clock.start();
    else clock.stop();
  }

  function updateTimer() {
    if (view) view.time.textContent = formatClock(clock.value());
  }

  // ---- Board geri çağrıları ----
  function onAction(a) {
    if (!a || typeof a !== 'object') return;
    if (a.type !== 'cursor') {
      lastActAt = now();
      dirty = true;
    }
    if (!roomId) return;
    sender.act(a);
  }

  function onProgress(p) {
    setProgress(p?.percent);
    dirty = true;
  }

  function onSnap() {
    sound.sfx('snap');
  }

  function onComplete() {
    if (!game || game.done) return;
    game.done = true;
    updateClock();
    updateTimer();
    setProgress(100);
    dirty = true;
    saveNow();
    const ms = Math.round(clock.value());
    if (isHost && roomId) Promise.resolve(db.logGame(roomId, NS, { count: game.count, ms })).catch(() => {});
    sound.sfx('win');
    const lines = [`${game.count} parça · ${formatDuration(ms)}`];
    if (game.note) lines.push(`Not: ${game.note}`);
    const buttons = [];
    if (isHost) {
      buttons.push({
        label: 'Yeni yapboz',
        primary: true,
        onClick: () => {
          dismissCelebrate();
          newPuzzle(false);
        },
      });
    }
    buttons.push({ label: 'Resme bak', onClick: dismissCelebrate });
    buttons.push({ label: 'Ana sayfaya dön', primary: !isHost, onClick: goLobby });
    dismissCelebrate();
    closeCelebrate = ui.celebrate({ title: 'Tamamlandı!', lines, buttons });
  }

  async function newPuzzle(ask) {
    if (ask && game && !game.done) {
      const ok = await ui.confirmDialog('Yeni yapboza geçilsin mi? Bu yapboz yarıda kalır.', { ok: 'Yeni yapboz', cancel: 'Vazgeç' });
      if (!ok) return;
    }
    if (board) saveNow();
    dismissCelebrate();
    game = null;
    renderSetup();
    if (peerOnline()) room.send({ t: 'setup' });
  }

  // ---- kayıt (ev sahibi / tek kişi) ----
  // Yazma bitince çözülen söz döner (store hata fırlatmaz).
  function saveNow() {
    if (!isHost || !game || !board) return Promise.resolve(false);
    dirty = false;
    saved = {
      roomId: roomId || null,
      photoBlob: game.photoBlob,
      photoUrl: game.photoUrl || null,
      cols: game.cols,
      rows: game.rows,
      seed: game.seed,
      count: game.count,
      note: game.note || '',
      elapsed: Math.round(clock.value()),
      state: board.getState(),
      done: Boolean(game.done),
    };
    return store.saveGame(roomId, saved);
  }

  // ---- mesajlaşma ----
  function sendHello() {
    if (!game) return;
    room.send({
      t: 'hello',
      photo: game.photoUrl,
      cols: game.cols,
      rows: game.rows,
      seed: game.seed,
      count: game.count,
      note: game.note || '',
      elapsed: Math.round(clock.value()),
    });
  }

  function sendState() {
    if (board) room.send({ t: 'state', state: board.getState() });
  }

  function sendJoin() {
    lastJoinAt = now();
    room.send({ t: 'join' });
  }

  function handleAct(a) {
    if (!a || typeof a !== 'object' || typeof a.type !== 'string') return;
    if (!board) {
      // Misafir fotoğrafı indirirken: son durumdan sonraki eylemleri biriktir.
      if (!isHost && loadingSig && pendingState && pendingActs.length < 2000) pendingActs.push(a);
      return;
    }
    lastActAt = now();
    const dragging = board.isDragging() ? board.draggingGroup() : null;
    const plan = gate.incoming(a, dragging);
    // deny ve düzeltme durumu da kısılan sıradan gider (bütçe + sıra).
    if (plan.deny !== null) sender.push({ t: 'deny', g: plan.deny });
    if (plan.cancelLocal) {
      board.cancelLocalDrag();
      sender.forget(dragging);
    }
    if (plan.apply) {
      board.applyRemote(a);
      dirty = true;
    }
    if (plan.resync) sender.push({ t: 'state', state: board.getState() });
  }

  function handleCur(msg, from) {
    if (!board || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
    const name = from?.name || room.partner()?.name || 'Sevgilin';
    board.setPeerCursor({ x: msg.x, y: msg.y, name });
  }

  function onHostMessage(msg, from) {
    switch (msg.t) {
      case 'join':
        sender.clear();
        gate.reset();
        if (board) {
          board.clearPeerHolds();
          board.setPeerCursor(null);
          sendHello();
          sendState();
        } else {
          room.send({ t: 'setup' });
        }
        break;
      case 'need':
        if (board) {
          sendHello();
          sendState();
        } else {
          room.send({ t: 'setup' });
        }
        break;
      case 'act':
        handleAct(msg.a);
        break;
      case 'cur':
        handleCur(msg, from);
        break;
      default:
    }
  }

  async function onHello(raw) {
    const h = readHello(raw);
    if (!h) return;
    if ((board && game?.sig === h.sig) || loadingSig === h.sig) {
      if (game) {
        game.note = h.note;
        game.count = h.count;
      }
      clock.set(h.elapsed);
      return;
    }
    const seq = ++loadSeq;
    loadingSig = h.sig;
    pendingState = null;
    pendingActs = [];
    dismissCelebrate();
    renderWait('photo');
    game = { ...h, done: false };
    clock.set(h.elapsed);
    try {
      const blob = await storage.loadPhoto(h.photo);
      const { image } = await decodeImage(blob);
      if (seq !== loadSeq) return;
      loadingSig = null;
      const state = pendingState;
      const acts = pendingActs;
      pendingState = null;
      pendingActs = [];
      enterGame(image, state);
      for (const a of acts) handleAct(a);
    } catch (err) {
      if (seq !== loadSeq) return;
      console.error(err);
      loadingSig = null;
      game = null;
      renderWait('error');
    }
  }

  function onState(s) {
    if (!isBoardState(s)) return;
    if (board) {
      if (board.isDragging()) board.cancelLocalDrag();
      sender.clear();
      board.setState(s);
      setProgress(progressFromState(s, game.cols * game.rows));
    } else if (loadingSig) {
      pendingState = s;
      pendingActs = [];
    }
  }

  function onSetupMsg() {
    loadSeq++;
    loadingSig = null;
    pendingState = null;
    pendingActs = [];
    dismissCelebrate();
    game = null;
    renderWait('host');
  }

  function onDeny(g) {
    if (board?.isDragging() && board.draggingGroup() === g) board.cancelLocalDrag();
    sender.forget(g);
  }

  function onHash(msg) {
    if (Number.isFinite(msg.elapsed)) clock.set(msg.elapsed);
    if (!board) return;
    const t = now();
    const need = shouldRequestState({
      local: board.hash(),
      remote: msg.h,
      dragging: board.isDragging(),
      lastActAt,
      lastNeedAt,
      now: t,
    });
    if (need) {
      lastNeedAt = t;
      sender.push({ t: 'need' });
    }
  }

  function onGuestMessage(msg, from) {
    switch (msg.t) {
      case 'hello':
        onHello(msg);
        break;
      case 'state':
        onState(msg.state);
        break;
      case 'setup':
        onSetupMsg();
        break;
      case 'act':
        handleAct(msg.a);
        break;
      case 'cur':
        handleCur(msg, from);
        break;
      case 'deny':
        onDeny(msg.g);
        break;
      case 'hash':
        onHash(msg);
        break;
      default:
    }
  }

  // ---- karşı taraf ----
  function updatePresenceUi() {
    if (banner) banner.hidden = !bannerReady || partnerHere || bannerDismissed;
    if (!isHost && view?.veil) {
      const block = !partnerHere;
      view.veil.hidden = !block;
      view.table.inert = block;
      view.hud.inert = block;
    }
    updateWaitText();
  }

  function onPresence(p) {
    const here = Boolean(p) && p.page === NS;
    if (here !== partnerHere) {
      partnerHere = here;
      if (here) {
        bannerDismissed = false;
        if (!isHost) sendJoin();
        else if (!board) room.send({ t: 'setup' });
      } else {
        lastHeardAt = -Infinity;
        sender.clear();
        gate.reset();
        if (board) {
          if (!isHost && board.isDragging()) board.cancelLocalDrag();
          board.clearPeerHolds();
          board.setPeerCursor(null);
        }
      }
      updateClock();
    }
    updatePresenceUi();
  }

  // ---- ilk ekran ----
  if (isHost) {
    saved = await store.loadGame(roomId);
    if (saved && !saved.done && saved.state && (saved.photoBlob || saved.photoUrl)) renderStart(saved);
    else renderSetup();
  } else {
    renderWait('host');
  }

  room.on('message', (msg, from) => {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string' || relaunching) return;
    const fromId = from?.clientId || null;
    const host = roleConflict({ isHost, myId: room.me?.clientId, hostId, t: msg.t, fromId });
    if (host) {
      relaunch(host);
      return;
    }
    if (!acceptSender({ isHost, hostId, partnerId: room.partner()?.clientId, fromId })) return;
    lastHeardAt = now();
    try {
      if (isHost) onHostMessage(msg, from);
      else onGuestMessage(msg, from);
    } catch (err) {
      console.error(err);
    }
  });
  room.on('presence', onPresence);
  let lastStatus = '';
  room.on('status', (status) => {
    if (status === 'online' && lastStatus && lastStatus !== 'online' && !isHost && partnerHere) sendJoin();
    lastStatus = status;
  });

  // ---- zamanlayıcılar ----
  setInterval(updateTimer, 500);
  setInterval(() => {
    if (dirty) saveNow();
  }, SAVE_MS);
  setInterval(() => {
    if (isHost && board && peerOnline()) {
      sender.push({ t: 'hash', h: board.hash(), elapsed: Math.round(clock.value()) });
    }
  }, HASH_MS);
  setInterval(() => {
    if (!isHost && !board && !loadingSig && screen === 'wait' && waitKind === 'host' && partnerHere &&
      now() - lastJoinAt >= JOIN_RETRY_MS) {
      sendJoin();
    }
  }, 1000);

  // ---- sayfa olayları ----
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
    updateClock();
  });
  addEventListener('pagehide', () => saveNow());

  // Masaüstü: dosyayı kurulum ekranına sürükle-bırak. Başka ekranda dosya sayfayı açmasın.
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const ok = screen === 'setup' && setupApi;
    e.dataTransfer.dropEffect = ok ? 'copy' : 'none';
    if (ok) setupApi.over(true);
  });
  addEventListener('dragleave', (e) => {
    if (setupApi && !e.relatedTarget) setupApi.over(false);
  });
  addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (screen !== 'setup' || !setupApi) return;
    setupApi.over(false);
    setupApi.handleFile(e.dataTransfer.files?.[0]);
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') main();
