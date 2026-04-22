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
  slackMode: 'off', // 'off' | 'manual' | 'auto'
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
const slackModeSel = $('slackMode');
const stepperBtns = document.querySelectorAll('.stepper-btn');
const endboss = document.querySelector('.endboss');
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
};

function formatEndTime(ms) {
  const d = new Date(Date.now() + ms);
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

function startTimer() {
  const totalMs = settings.durationMin * 60 * 1000;
  state.totalMs = totalMs;
  state.halfwayFired = false;
  state.endAt = Date.now() + totalMs;
  endTimeValue.textContent = formatEndTime(totalMs);
  endTimeDisplay.classList.remove('hidden');
  setPhase('running');
  runControls.classList.remove('hidden');
  pauseBtn.textContent = 'Pause';
  startBtn.disabled = true;
  startBtn.classList.add('flash');
  document.body.classList.add('screen-shake');
  setTimeout(() => document.body.classList.remove('screen-shake'), 500);
  setTimeout(() => startBtn.classList.remove('flash'), 500);

  // Endboss: roar then → working
  endboss.classList.add('roar');
  endboss.dataset.state = 'working';
  setTimeout(() => endboss.classList.remove('roar'), 1000);
  startIdeTyping();

  // Schedule the 5-min "out of tokens" joke (only if timer runs long enough)
  state.tokenJokeShown = false;
  if (totalMs > 5 * 60 * 1000) {
    state.tokenJokeHandle = setTimeout(showTokenJoke, 5 * 60 * 1000);
  }

  if (settings.effects) sfx.roar();

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
  } else if (state.phase === 'paused') {
    state.endAt = Date.now() + state.remainingMs;
    setPhase('running');
    pauseBtn.textContent = 'Pause';
    scheduleTick();
  }
}

function resetTimer() {
  clearInterval(state.tickHandle);
  state.tickHandle = null;
  setPhase('idle');
  state.halfwayFired = false;
  runControls.classList.add('hidden');
  endTimeDisplay.classList.add('hidden');
  startBtn.disabled = false;
  endboss.dataset.state = 'idle';
  endboss.classList.remove('stressed', 'roar');
  stopIdeTyping();
  hideTokenJoke();
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
  setPhase('finished');
  renderTime(0);
  runControls.classList.add('hidden');
  startBtn.disabled = false;

  endboss.dataset.state = 'defeated';
  endboss.classList.remove('stressed');
  stopIdeTyping();
  hideTokenJoke();

  if (settings.alarm) sfx.alarm();

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
  finishBanner.classList.add('hidden');
  // After dismiss, return to idle so a new sync can start
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
    // simple SMB-ish level-clear fanfare: arpeggio up, then sustain
    const notes = [523, 659, 784, 1047, 1319]; // C5 E5 G5 C6 E6
    notes.forEach((f, i) => beep(f, 0.16, 'square', 0.1, i * 0.12));
    beep(1319, 0.5, 'square', 0.12, notes.length * 0.12);
    beep(1568, 0.7, 'triangle', 0.09, notes.length * 0.12 + 0.1);
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
  // Freeze the typing mid-line and show the error underneath
  ideTypingActive = false;
  if (ideTypingHandle) { clearTimeout(ideTypingHandle); ideTypingHandle = null; }
  if (ideTyping) ideTyping.textContent = 'build NewCorp ECH thi';
  if (ideCaret) ideCaret.style.display = 'none';
  if (ideError) ideError.classList.remove('hidden');
}

function hideTokenJoke() {
  if (state.tokenJokeHandle) { clearTimeout(state.tokenJokeHandle); state.tokenJokeHandle = null; }
  state.tokenJokeShown = false;
  if (ideError) ideError.classList.add('hidden');
  if (ideCaret) ideCaret.style.display = '';
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
  slackModeSel.value = settings.slackMode;
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
slackModeSel.addEventListener('change', () => {
  settings.slackMode = slackModeSel.value;
  saveSettings(settings);
});

settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsDialog.addEventListener('close', () => {
  if (state.phase === 'idle') renderIdle();
});

// ---------- Main button wiring ----------
startBtn.addEventListener('click', () => {
  // Unlock audio on first interaction
  getAudioCtx();
  startTimer();
});
pauseBtn.addEventListener('click', pauseToggle);
resetBtn.addEventListener('click', resetTimer);
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
renderIdle();
