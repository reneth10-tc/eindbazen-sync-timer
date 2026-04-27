/* ============================================================
   Eindbazen Sync Timer — app logic
   ============================================================ */

'use strict';

const SETTINGS_KEY = 'eindbazen.settings';
const DURATION_MIN = 30;
const DURATION_MAX = 240;
const DURATION_STEP = 30;

const defaultSettings = {
  durationMin: 90,
  effects: true,
  alarm: true,
  roundStart: true,
  slackMode: 'off', // 'off' | 'manual' | 'auto'
  devMode: false,
  fastTopi: false,
};

// ---------- Settings ----------
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw);
    return { ...defaultSettings, ...parsed };
  } catch {
    return { ...defaultSettings };
  }
}
function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

let settings = loadSettings();

// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);
const timerDisplay = $('timerDisplay');
const timerValue = $('timerValue');
const timerUnit = $('timerUnit');
const startBtn = $('startBtn');
const runControls = $('runControls');
const pauseBtn = $('pauseBtn');
const resetBtn = $('resetBtn');
const settingsBtn = $('settingsBtn');
const settingsDialog = $('settingsDialog');
const settingsCloseBtn = $('settingsCloseBtn');
const durationDisplay = $('durationDisplay');
const effectsToggle = $('effectsToggle');
const alarmToggle = $('alarmToggle');
const roundStartToggle = $('roundStartToggle');
const slackModeSel = $('slackMode');
const stepperBtns = document.querySelectorAll('.stepper-btn');
const endboss = document.querySelector('.endboss');
const devModeToggle = $('devModeToggle');
const devControls = $('devControls');
const triggerTopiBtn = $('triggerTopiBtn');
const fastTopiToggle = $('fastTopiToggle');
const topiEl = document.querySelector('.topi');
const ideTyping = $('ideTyping');
const ideCaret = $('ideCaret');
const ideError = $('ideError');
const finishBanner = $('finishBanner');
const dismissFinishBtn = $('dismissFinishBtn');
const slackArea = $('slackArea');
const slackBtn = $('slackBtn');
const slackStatus = $('slackStatus');
const confetti = $('confetti');
const endTimeDisplay = $('endTimeDisplay');
const endTimeValue = $('endTimeValue');
const shareBtn = $('shareBtn');

// ---------- Timer state machine ----------
const state = {
  phase: 'idle', // 'idle' | 'running' | 'paused' | 'finished'
  endAt: 0,         // timestamp when running
  remainingMs: 0,   // used while paused
  totalMs: 0,       // for halfway detection
  halfwayFired: false,
  tickHandle: null,
  tokenJokeHandle: null,
  tokenJokeShown: false,
  tokenJokeClearHandle: null,
  topiHandles: [],  // setTimeout handles for topi visits
  topiInFlight: false, // debounce for manual trigger
};

const alarmAudio = new Audio('assets/sounds/level-complete.mp3');
alarmAudio.preload = 'auto';

function startAlarmLoop() {
  if (!settings.alarm) return;
  alarmAudio.loop = true;
  sfx.alarm();
}
function stopAlarmLoop() {
  alarmAudio.loop = false;
  alarmAudio.pause();
  alarmAudio.currentTime = 0;
}

function formatEndTime(endAt) {
  const d = new Date(endAt);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function setPhase(p) {
  state.phase = p;
  timerDisplay.dataset.phase = p === 'running' || p === 'paused' ? 'running' : p;
}

function msToDisplay(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec > 60) {
    // show minutes (rounded up so "89" flips to "88" as the next minute begins)
    const minutes = Math.ceil(totalSec / 60);
    return { value: String(minutes), unit: 'MIN' };
  }
  return { value: String(totalSec), unit: 'SEC' };
}

function renderTime(ms) {
  const { value, unit } = msToDisplay(ms);
  timerValue.textContent = value;
  timerUnit.textContent = unit;

  if (ms <= 60_000 && ms > 0) {
    timerDisplay.dataset.phase = 'seconds';
  }
  if (ms <= 10_000 && ms > 0) {
    timerDisplay.dataset.phase = 'last10';
    endboss.classList.add('stressed');
  } else {
    endboss.classList.remove('stressed');
  }
}

function startTimer({ endAt = null, silent = false } = {}) {
  const totalMs = settings.durationMin * 60 * 1000;
  const FIVE_MIN_MS = 5 * 60 * 1000;
  const startAt = settings.roundStart
    ? Math.ceil(Date.now() / FIVE_MIN_MS) * FIVE_MIN_MS
    : Date.now();
  state.totalMs = totalMs;
  state.halfwayFired = false;
  state.endAt = endAt ?? startAt + totalMs;
  endTimeValue.textContent = formatEndTime(state.endAt);
  endTimeDisplay.classList.remove('hidden');
  setPhase('running');
  runControls.classList.remove('hidden');
  shareBtn.classList.remove('hidden');
  shareBtn.textContent = '🔗';
  pauseBtn.textContent = 'Pause';
  startBtn.disabled = true;

  if (!silent) {
    startBtn.classList.add('flash');
    document.body.classList.add('screen-shake');
    setTimeout(() => document.body.classList.remove('screen-shake'), 500);
    setTimeout(() => startBtn.classList.remove('flash'), 500);
    endboss.classList.add('roar');
    setTimeout(() => endboss.classList.remove('roar'), 1000);
    if (settings.effects) sfx.roar();
  }

  endboss.dataset.state = 'working';
  startIdeTyping();

  // Token joke: schedule relative to session start so shared viewers see it
  // at the correct elapsed time (or skip it if they're already past the mark).
  state.tokenJokeShown = false;
  const sessionStart = state.endAt - totalMs;
  const timeUntilJoke = sessionStart + 5 * 60 * 1000 - Date.now();
  if (totalMs > 5 * 60 * 1000) {
    if (timeUntilJoke > 0) {
      state.tokenJokeHandle = setTimeout(showTokenJoke, timeUntilJoke);
    } else {
      showTokenJoke();
    }
  }

  scheduleTopiVisits();
  scheduleTick();
}

function scheduleTick() {
  if (state.tickHandle) clearInterval(state.tickHandle);
  state.tickHandle = setInterval(tick, 250);
  tick();
}

function tick() {
  if (state.phase !== 'running') return;
  const remaining = state.endAt - Date.now();
  renderTime(remaining);

  if (!state.halfwayFired && remaining <= state.totalMs / 2) {
    state.halfwayFired = true;
    endboss.dataset.state = 'tired';
  }

  if (remaining <= 10 * 60 * 1000 && remaining > 10 * 1000 && endboss.dataset.state !== 'sleeping') {
    endboss.dataset.state = 'sleeping';
    stopIdeTyping();
  }

  if (remaining <= 0) {
    finish();
  }
}

function pauseToggle() {
  if (state.phase === 'running') {
    state.remainingMs = state.endAt - Date.now();
    setPhase('paused');
    clearInterval(state.tickHandle);
    state.tickHandle = null;
    pauseBtn.textContent = 'Resume';
    // Hide share while paused — endAt is stale and the link would mislead.
    shareBtn.classList.add('hidden');
  } else if (state.phase === 'paused') {
    state.endAt = Date.now() + state.remainingMs;
    endTimeValue.textContent = formatEndTime(state.endAt);
    setPhase('running');
    pauseBtn.textContent = 'Pause';
    shareBtn.classList.remove('hidden');
    shareBtn.textContent = '🔗';
    scheduleTick();
  }
}

function resetTimer() {
  clearInterval(state.tickHandle);
  state.tickHandle = null;
  stopAlarmLoop();
  cancelTopi();
  setPhase('idle');
  state.halfwayFired = false;
  runControls.classList.add('hidden');
  shareBtn.classList.add('hidden');
  endTimeDisplay.classList.add('hidden');
  startBtn.disabled = false;
  endboss.dataset.state = 'idle';
  endboss.classList.remove('stressed', 'roar');
  stopIdeTyping();
  hideTokenJoke();
  clearSessionHash();
  renderIdle();
}

function renderIdle() {
  timerValue.textContent = String(settings.durationMin);
  timerUnit.textContent = 'MIN';
  timerDisplay.dataset.phase = 'idle';
}

function finish() {
  clearInterval(state.tickHandle);
  state.tickHandle = null;
  cancelTopi();
  setPhase('finished');
  renderTime(0);
  runControls.classList.add('hidden');
  shareBtn.classList.add('hidden');
  startBtn.disabled = false;

  endboss.dataset.state = 'defeated';
  endboss.classList.remove('stressed');
  stopIdeTyping();
  hideTokenJoke();

  startAlarmLoop();

  showFinishBanner();
  rainCoins();

  if (settings.slackMode === 'auto') {
    sendSlack();
  }
}

function showFinishBanner() {
  finishBanner.classList.remove('hidden');
  if (settings.slackMode === 'manual') {
    slackArea.classList.remove('hidden');
    slackStatus.textContent = '';
    slackStatus.classList.remove('err');
  } else {
    slackArea.classList.add('hidden');
  }
}

function hideFinishBanner() {
  stopAlarmLoop();
  finishBanner.classList.add('hidden');
  resetTimer();
}

function rainCoins() {
  confetti.innerHTML = '';
  const count = 60;
  for (let i = 0; i < count; i++) {
    const c = document.createElement('div');
    c.className = 'coin';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.animationDuration = (2 + Math.random() * 3) + 's';
    c.style.animationDelay = (Math.random() * 0.8) + 's';
    c.style.width = c.style.height = (14 + Math.random() * 14) + 'px';
    confetti.appendChild(c);
  }
  // Clear after last animation
  setTimeout(() => { confetti.innerHTML = ''; }, 6500);
}

// ---------- Sound effects (Web Audio synth chiptune) ----------
// Synthesized so the app is self-contained. Swap to <audio> elements later
// if/when real SMB clips are dropped into assets/sounds/.
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function beep(freq, dur, type = 'square', gain = 0.08, when = 0) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g).connect(ctx.destination);
  const start = ctx.currentTime + when;
  osc.start(start);
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.stop(start + dur + 0.02);
}

const sfx = {
  roar() {
    // descending growl
    beep(120, 0.15, 'sawtooth', 0.12);
    beep(90,  0.18, 'sawtooth', 0.12, 0.12);
    beep(70,  0.22, 'sawtooth', 0.1,  0.26);
  },
  click() {
    beep(880, 0.05, 'square', 0.04);
  },
  alarm() {
    // Real SMB level-complete jingle (assets/sounds/level-complete.mp3).
    // Internal-use only — see README.md "Using real Mario sounds".
    try {
      alarmAudio.currentTime = 0;
      const p = alarmAudio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* autoplay blocked / hidden tab — ignore */ }
  },
  startSync() {
    // Original 8-bit-style "go" fanfare: short ascending arpeggio + sustained tonic.
    // Uses square waves to match the existing chiptune palette (sfx.alarm uses the same).
    // Note choice is original — picked to feel like an arcade level-start, not to copy any specific game.
    const arp = [392, 523, 659, 784]; // G4 C5 E5 G5 — open major triad climb
    arp.forEach((f, i) => beep(f, 0.1, 'square', 0.09, i * 0.08));
    beep(988, 0.18, 'square',   0.10, arp.length * 0.08);         // B5 accent
    beep(784, 0.32, 'triangle', 0.08, arp.length * 0.08 + 0.12);  // G5 sustain pad
  },
};

// ---------- IDE typing animation (runs while boss is at laptop) ----------
const IDE_PROMPTS = [
  'build NewCorp ECH thingy',
  'refactor sprint backlog',
  'generate status report',
  'explain why retro ran long',
  'estimate remaining tickets',
  'summarize blockers for Slack',
  'auto-assign review rotations',
];
let ideTypingHandle = null;
let ideTypingActive = false;

function ideTypeLoop() {
  if (!ideTypingActive || !ideTyping) return;
  const text = IDE_PROMPTS[Math.floor(Math.random() * IDE_PROMPTS.length)];
  let i = 0;
  ideTyping.textContent = '';
  function typeChar() {
    if (!ideTypingActive) return;
    if (i <= text.length) {
      ideTyping.textContent = text.slice(0, i);
      i++;
      ideTypingHandle = setTimeout(typeChar, 60 + Math.random() * 60);
    } else {
      // pause, then erase, then next prompt
      ideTypingHandle = setTimeout(() => eraseLoop(text.length), 900);
    }
  }
  function eraseLoop(remaining) {
    if (!ideTypingActive) return;
    if (remaining > 0) {
      ideTyping.textContent = ideTyping.textContent.slice(0, remaining - 1);
      ideTypingHandle = setTimeout(() => eraseLoop(remaining - 1), 30);
    } else {
      ideTypingHandle = setTimeout(ideTypeLoop, 400);
    }
  }
  typeChar();
}

function startIdeTyping() {
  if (ideTypingActive) return;
  ideTypingActive = true;
  ideTypeLoop();
}
function stopIdeTyping() {
  ideTypingActive = false;
  if (ideTypingHandle) { clearTimeout(ideTypingHandle); ideTypingHandle = null; }
  if (ideTyping) ideTyping.textContent = '';
}

function showTokenJoke() {
  if (state.phase !== 'running') return;
  state.tokenJokeShown = true;
  ideTypingActive = false;
  if (ideTypingHandle) { clearTimeout(ideTypingHandle); ideTypingHandle = null; }
  if (ideTyping) ideTyping.textContent = 'build NewCorp ECH thi';
  if (ideCaret) ideCaret.style.display = 'none';
  if (ideError) ideError.classList.remove('hidden');
  // Auto-recover after 3 minutes so the IDE doesn't stay "broken"
  state.tokenJokeClearHandle = setTimeout(() => {
    if (state.phase !== 'running') return;
    if (ideError) ideError.classList.add('hidden');
    if (ideCaret) ideCaret.style.display = '';
    state.tokenJokeShown = false;
    startIdeTyping();
  }, 3 * 60 * 1000);
}

function hideTokenJoke() {
  if (state.tokenJokeHandle) { clearTimeout(state.tokenJokeHandle); state.tokenJokeHandle = null; }
  if (state.tokenJokeClearHandle) { clearTimeout(state.tokenJokeClearHandle); state.tokenJokeClearHandle = null; }
  state.tokenJokeShown = false;
  if (ideError) ideError.classList.add('hidden');
  if (ideCaret) ideCaret.style.display = '';
}

// ---------- Topi cameos ----------
// Deterministic PRNG (mulberry32) seeded from endAt so shared-link viewers
// see topi at identical wall-clock moments.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function scheduleTopiVisits() {
  // Cancel any leftover handles from a previous session
  cancelTopi();

  const VISITS = 5;
  const TAIL_MS = 20 * 1000; // leave 20s clear at the end
  const now = Date.now();
  const sessionStart = state.endAt - state.totalMs;

  // Compressed window when fastTopi dev mode is on
  const usesFast = settings.devMode && settings.fastTopi;
  const windowEnd = usesFast ? sessionStart + 60 * 1000 : state.endAt - TAIL_MS;
  const windowMs = windowEnd - sessionStart;
  if (windowMs <= 0) return;

  const rand = mulberry32(Math.floor(state.endAt / 1000)); // seed from endAt seconds

  for (let i = 0; i < VISITS; i++) {
    // Pick a random offset within this bucket
    const bucketStart = sessionStart + (windowMs / VISITS) * i;
    const bucketEnd   = sessionStart + (windowMs / VISITS) * (i + 1);
    const when = bucketStart + rand() * (bucketEnd - bucketStart);
    const delay = when - now;
    if (delay < 0) continue; // already past — skip
    const h = setTimeout(runTopiVisit, delay);
    state.topiHandles.push(h);
  }
}

function runTopiVisit() {
  if (state.topiInFlight) return; // debounce
  if (!topiEl) return;
  state.topiInFlight = true;

  // Phase 1: walk in from left (~5 s)
  topiEl.className = 'topi topi--walking';
  topiEl.style.visibility = 'visible';
  topiEl.style.opacity = '1';
  topiEl.style.transform = 'translateX(-15vw)';
  // Force reflow so the starting position is applied before transition begins
  void topiEl.offsetWidth;
  topiEl.style.transition = 'transform 5s linear';
  topiEl.style.transform = 'translateX(calc(50vw - 240px))'; // approx laptop x

  const h1 = setTimeout(() => {
    // Phase 2: on laptop (~5 s)
    topiEl.className = 'topi topi--onLaptop';
    topiEl.style.transition = 'transform 0.5s ease-out';
    topiEl.style.transform = 'translateX(calc(50vw - 240px)) translateY(-40px)';
    endboss.classList.add('angry', 'has-bug');

    const h2 = setTimeout(() => {
      // Phase 3: walk out to right (~5 s)
      topiEl.className = 'topi topi--walking';
      topiEl.style.transition = 'transform 5s linear';
      topiEl.style.transform = 'translateX(115vw)';
      endboss.classList.remove('angry', 'has-bug');

      const h3 = setTimeout(() => {
        // Cleanup
        topiEl.style.visibility = 'hidden';
        topiEl.style.opacity = '0';
        topiEl.style.transition = '';
        topiEl.style.transform = '';
        topiEl.className = 'topi';
        state.topiInFlight = false;
      }, 5200);
      state.topiHandles.push(h3);
    }, 5000);
    state.topiHandles.push(h2);
  }, 5200);
  state.topiHandles.push(h1);
}

function cancelTopi() {
  state.topiHandles.forEach((h) => clearTimeout(h));
  state.topiHandles = [];
  state.topiInFlight = false;
  endboss.classList.remove('angry', 'has-bug');
  if (topiEl) {
    topiEl.style.visibility = 'hidden';
    topiEl.style.opacity = '0';
    topiEl.style.transition = '';
    topiEl.style.transform = '';
    topiEl.className = 'topi';
  }
}

// ---------- Shareable session link ----------
// Encodes { endAt, durationMin } in the URL hash. Because the timer runs off
// an absolute endAt timestamp, any client opening the link independently
// counts down to the same moment — no backend required.
function parseSharedSession() {
  if (!window.location.hash) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const e = Number(params.get('e'));
  const d = Number(params.get('d'));
  if (!e || !d) return null;
  if (d < DURATION_MIN || d > DURATION_MAX || d % DURATION_STEP !== 0) return null;
  return { endAt: e, durationMin: d };
}

function clearSessionHash() {
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

async function copyShareLink() {
  const url = new URL(window.location.href);
  url.hash = `e=${state.endAt}&d=${settings.durationMin}`;
  const link = url.toString();
  try {
    await navigator.clipboard.writeText(link);
    shareBtn.textContent = '✓';
    setTimeout(() => {
      if (state.phase === 'running') shareBtn.textContent = '🔗';
    }, 1500);
  } catch {
    window.prompt('Copy this session link:', link);
  }
}

// ---------- Slack ----------
async function sendSlack() {
  if (settings.slackMode === 'off') return;
  if (settings.slackMode === 'manual') {
    slackBtn.disabled = true;
    slackStatus.textContent = 'Sending…';
    slackStatus.classList.remove('err');
  }
  try {
    const res = await fetch('/.netlify/functions/slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `:alarm_clock: *Eindbazen sync check-in time!* (${settings.durationMin} min)`,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (settings.slackMode === 'manual') {
      slackStatus.textContent = data.stubbed ? 'Sent (stub mode)' : 'Sent!';
    }
  } catch (err) {
    console.error('Slack send failed', err);
    if (settings.slackMode === 'manual') {
      slackStatus.textContent = 'Failed: ' + err.message;
      slackStatus.classList.add('err');
      slackBtn.disabled = false;
    }
  }
}

// ---------- Settings UI ----------
function openSettings() {
  durationDisplay.textContent = String(settings.durationMin);
  effectsToggle.checked = settings.effects;
  alarmToggle.checked = settings.alarm;
  roundStartToggle.checked = settings.roundStart;
  slackModeSel.value = settings.slackMode;
  if (devModeToggle) devModeToggle.checked = settings.devMode;
  if (fastTopiToggle) fastTopiToggle.checked = settings.fastTopi;
  applyDevMode();
  updateStepperDisabled();
  if (typeof settingsDialog.showModal === 'function') {
    settingsDialog.showModal();
  } else {
    settingsDialog.setAttribute('open', '');
  }
}

function closeSettings() {
  if (typeof settingsDialog.close === 'function') {
    settingsDialog.close();
  } else {
    settingsDialog.removeAttribute('open');
  }
  // Only update idle display if we're idle (don't clobber a running timer)
  if (state.phase === 'idle') renderIdle();
}

function updateStepperDisabled() {
  stepperBtns.forEach((btn) => {
    const step = Number(btn.dataset.step);
    const next = settings.durationMin + step;
    btn.disabled = next < DURATION_MIN || next > DURATION_MAX;
  });
}

stepperBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const step = Number(btn.dataset.step);
    const next = Math.min(DURATION_MAX, Math.max(DURATION_MIN, settings.durationMin + step));
    settings.durationMin = next;
    durationDisplay.textContent = String(next);
    updateStepperDisabled();
    saveSettings(settings);
    if (settings.effects) sfx.click();
  });
});

effectsToggle.addEventListener('change', () => {
  settings.effects = effectsToggle.checked;
  saveSettings(settings);
});
alarmToggle.addEventListener('change', () => {
  settings.alarm = alarmToggle.checked;
  saveSettings(settings);
});
roundStartToggle.addEventListener('change', () => {
  settings.roundStart = roundStartToggle.checked;
  saveSettings(settings);
});
slackModeSel.addEventListener('change', () => {
  settings.slackMode = slackModeSel.value;
  saveSettings(settings);
});

// ---------- Dev controls ----------
function applyDevMode() {
  if (devControls) {
    devControls.classList.toggle('hidden', !settings.devMode);
  }
}

if (devModeToggle) {
  devModeToggle.addEventListener('change', () => {
    settings.devMode = devModeToggle.checked;
    saveSettings(settings);
    applyDevMode();
  });
}

if (triggerTopiBtn) {
  triggerTopiBtn.addEventListener('click', () => {
    // Close settings so the animation is visible
    closeSettings();
    // Small delay to let dialog close animation settle; track so cancelTopi can clear it
    const h = setTimeout(runTopiVisit, 80);
    state.topiHandles.push(h);
  });
}

if (fastTopiToggle) {
  fastTopiToggle.addEventListener('change', () => {
    settings.fastTopi = fastTopiToggle.checked;
    saveSettings(settings);
  });
}

settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsDialog.addEventListener('close', () => {
  if (state.phase === 'idle') renderIdle();
});

// ---------- Main button wiring ----------
startBtn.addEventListener('click', () => {
  // Unlock audio on first interaction
  getAudioCtx();
  if (settings.effects) sfx.startSync();
  startTimer();
});
pauseBtn.addEventListener('click', pauseToggle);
resetBtn.addEventListener('click', resetTimer);
shareBtn.addEventListener('click', copyShareLink);
dismissFinishBtn.addEventListener('click', hideFinishBanner);
slackBtn.addEventListener('click', sendSlack);

// ---------- Keyboard shortcuts ----------
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === ' ' || e.key === 'Enter') {
    if (state.phase === 'idle') { e.preventDefault(); startBtn.click(); }
    else if (state.phase === 'running' || state.phase === 'paused') { e.preventDefault(); pauseToggle(); }
  }
  if (e.key === 'Escape' && state.phase === 'finished') hideFinishBanner();
});

// ---------- Background tab resilience ----------
// Browsers throttle setInterval in inactive tabs. When the tab becomes visible
// again, run tick() immediately so finish() fires without waiting for the next
// (potentially late) interval, then reset the interval cadence.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.phase === 'running') {
    tick();
    scheduleTick();
  }
});

// ---------- Init ----------
const shared = parseSharedSession();
if (shared) {
  // Override duration for this view only — don't persist to localStorage.
  settings.durationMin = shared.durationMin;
  // silent: skip roar/flash since the session is already mid-flight for us.
  startTimer({ endAt: shared.endAt, silent: true });
} else {
  renderIdle();
}
