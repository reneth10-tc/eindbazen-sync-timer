/* ============================================================
   Eindbazen Sync Timer — app logic
   ============================================================ */

'use strict';

const APP_VERSION = '2.4.';
const SETTINGS_KEY = 'eindbazen.settings';
const DURATION_MIN = 30;
const DURATION_MAX = 240;
const DURATION_STEP = 30;

const defaultSettings = {
  durationMin: 90,
  effects: true,
  alarm: true,
  pipeSounds: true,
  roundStart: true,
  slackMode: 'off', // 'off' | 'manual' | 'auto'
  devMode: false,
  fastTopi: false,
  weatherEnabled: false,
  weatherSoundsEnabled: true, // ambient weather SFX (rain/wind/birds) — gated by effects + weatherEnabled
  weatherLocation: '', // city name or 'lat,lon'; empty = Amsterdam default
  darkMode: false,     // force night sky even in daytime
};

// ---------- Settings ----------
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw);
    const merged = { ...defaultSettings, ...parsed };
    if (typeof merged.durationMin !== 'number'
        || !Number.isFinite(merged.durationMin)
        || merged.durationMin < DURATION_MIN
        || merged.durationMin > DURATION_MAX) {
      merged.durationMin = defaultSettings.durationMin;
      // Repair the persisted entry so this user is healed on next reload.
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged)); } catch {}
    }
    return merged;
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
const pipeSoundsToggle = $('pipeSoundsToggle');
const roundStartToggle = $('roundStartToggle');
const slackModeSel = $('slackMode');
const stepperBtns = document.querySelectorAll('.stepper:not(.time-stepper) .stepper-btn');
const endboss = document.querySelector('.endboss');
const devModeToggle = $('devModeToggle');
const devControls = $('devControls');
const triggerTopiBtn = $('triggerTopiBtn');
const triggerRsiBtn = $('triggerRsiBtn');
const triggerRainBtn = $('triggerRainBtn');
const triggerTeaBtn = $('triggerTeaBtn');
const triggerHydrateBtn = $('triggerHydrateBtn');
const triggerPipeBtn = $('triggerPipeBtn');
const triggerPlaneBtn = $('triggerPlaneBtn');
const triggerFinishBtn = $('triggerFinishBtn');
const fastTopiToggle = $('fastTopiToggle');
const topiEl = document.querySelector('.topi');
const planeEl = $('plane');
const planeBannerText = $('planeBannerText');
const speechBubbleTea = document.querySelector('.speech-bubble--tea');
const speechBubbleHydrate = document.querySelector('.speech-bubble--hydrate');
const pipeLeftEl = $('pipeLeft');
const pipeRightEl = $('pipeRight');
const ideTyping = $('ideTyping');
const ideCaret = $('ideCaret');
const ideError = $('ideError');
const finishBanner = $('finishBanner');
const dismissFinishBtn = $('dismissFinishBtn');
const teamsBtn = $('teamsBtn');
const slackArea = $('slackArea');
const slackBtn = $('slackBtn');
const slackStatus = $('slackStatus');
const slackShareArea = $('slackShareArea');
const slackShareBtn = $('slackShareBtn');
const slackShareStatus = $('slackShareStatus');
const confetti = $('confetti');
const rainContainer = $('rainContainer');
const ideRsi = $('ideRsi');
const ideDeploy = $('ideDeploy');
const ideDeployLine1 = $('ideDeployLine1');
const ideDeployLine2 = $('ideDeployLine2');
const ideDeployBar = $('ideDeployBar');
const ideDeployCaret = $('ideDeployCaret');
const endTimeDisplay = $('endTimeDisplay');
const endTimeValue = $('endTimeValue');
const shareBtn = $('shareBtn');
const clockBtn = $('clockBtn');
const timePickerDialog = $('timePickerDialog');
const tpHourDisplay = $('tpHourDisplay');
const tpMinDisplay = $('tpMinDisplay');
const tpOkBtn = $('tpOkBtn');
const tpCancelBtn = $('tpCancelBtn');
const tpStepperBtns = document.querySelectorAll('.time-stepper .stepper-btn');
const weatherToggle = $('weatherToggle');
const weatherSoundsToggle = $('weatherSoundsToggle');
const weatherLocationInput = $('weatherLocation');
const finishScore = $('finishScore');
const weatherLocStatus = $('weatherLocStatus');
const darkModeToggle = $('darkModeToggle');
const starfield = $('starfield');
const puddleContainer = $('puddleContainer');
const lightning = $('lightning');
const leafContainer = $('leafContainer');

// ---------- Timer state machine ----------
const state = {
  phase: 'idle', // 'idle' | 'running' | 'paused' | 'finished'
  endAt: 0,         // timestamp when running
  remainingMs: 0,   // used while paused
  totalMs: 0,       // for halfway detection
  halfwayFired: false,
  preFinishSlackFired: false,
  fromSharedLink: false,
  hydrateHideHandle: null,
  tickHandle: null,
  tokenJokeHandle: null,
  tokenJokeShown: false,
  tokenJokeClearHandle: null,
  topiHandles: [],  // setTimeout handles for topi visits
  topiInFlight: false, // debounce for manual trigger
  rsiHandles: [],
  rsiActive: false,
  rainHandles: [],
  cloudCoinHandles: [],
  deployTypeHandles: [],
  teaTimeHandle: null,
  teaTimeHideHandle: null,
  pipeHandles: [],
  pipeInFlight: false,
  planeHandles: [],   // setTimeout handles for banner-plane flights
  planeInFlight: false,
  // Weather
  weather: null,          // last fetched/applied weather object
  weatherRain: false,     // true when weather drives continuous rain
  weatherRainHandle: null, // setInterval ID for continuous rain loop
  resolvedCoords: null,    // {lat,lon} resolved from a city name (cached)
  puddlesShown: false,     // whether puddles are currently on the ground
  lightningHandle: null,   // setTimeout ID for the next lightning flash
  leafHandle: null,        // setInterval ID for the blowing-leaves spawner
  leafWind: null,          // current wind bucket ('low'|'mid'|'high') for leaves
  weatherAmbienceHandle: null, // setTimeout ID for the next random weather ambience sound
};

const alarmAudio = new Audio('assets/sounds/level-complete.mp3');
alarmAudio.preload = 'auto';
const startAudio = new Audio('assets/sounds/sync-start.mp3');
startAudio.preload = 'auto';
const pipeAudio = new Audio('assets/sounds/pipe.mp3');
pipeAudio.preload = 'auto';
const waterAudio = new Audio('assets/sounds/water.mp3');
waterAudio.preload = 'auto';

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
  timerDisplay.dataset.phase = (p === 'running' || p === 'paused') ? 'running'
    : (p === 'deploying') ? 'idle'
    : p;
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

function startTimer({ endAt = null, silent = false, fromSharedLink = false } = {}) {
  if (state.phase === 'deploying') exitDeployState();
  if (teamsBtn) teamsBtn.classList.add('hidden');
  state.fromSharedLink = fromSharedLink;
  const totalMs = settings.durationMin * 60 * 1000;
  const FIVE_MIN_MS = 5 * 60 * 1000;
  const startAt = settings.roundStart
    ? Math.ceil(Date.now() / FIVE_MIN_MS) * FIVE_MIN_MS
    : Date.now();
  state.totalMs = totalMs;
  state.halfwayFired = false;
  state.preFinishSlackFired = false;
  state.endAt = endAt ?? startAt + totalMs;
  endTimeValue.textContent = formatEndTime(state.endAt);
  endTimeDisplay.classList.remove('hidden');
  setPhase('running');
  runControls.classList.remove('hidden');
  shareBtn.disabled = false;
  shareBtn.textContent = '🔗';
  pauseBtn.textContent = 'Pause';
  if (settings.slackMode !== 'off' && !state.fromSharedLink) {
    slackShareArea.classList.remove('hidden');
    slackShareBtn.disabled = false;
    slackShareStatus.textContent = '';
    slackShareStatus.classList.remove('err');
  } else {
    slackShareArea.classList.add('hidden');
  }
  startBtn.disabled = true;
  startBtn.classList.add('hidden');

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
  schedulePipeVisits();
  scheduleRsiBreaks();
  scheduleRainShowers();
  scheduleTeaTime();
  schedulePlaneFlights();
  scheduleTick();
  // Re-apply cached weather so it overrides random rain schedule if currently raining.
  if (settings.weatherEnabled && state.weather && !state.fromSharedLink) {
    applyWeather(state.weather);
  }
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
    showHydrate(HYDRATE_DURATION_MS);
  }

  if (!state.preFinishSlackFired && remaining <= 60_000 && remaining > 0) {
    state.preFinishSlackFired = true;
    if (settings.slackMode === 'auto' && !state.fromSharedLink) sendSlack();
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
    // Disable share while paused — endAt is stale and the link would mislead.
    shareBtn.disabled = true;
  } else if (state.phase === 'paused') {
    state.endAt = Date.now() + state.remainingMs;
    endTimeValue.textContent = formatEndTime(state.endAt);
    setPhase('running');
    pauseBtn.textContent = 'Pause';
    shareBtn.disabled = false;
    shareBtn.textContent = '🔗';
    scheduleTick();
  }
}

function resetTimer() {
  clearInterval(state.tickHandle);
  state.tickHandle = null;
  stopAlarmLoop();
  cancelTopi();
  cancelPipes();
  cancelRsi();
  cancelRain();
  cancelTeaTime();
  cancelHydrate();
  cancelPlane();
  stopCloudCoinShowers();
  cancelDeployTyping();
  ideDeploy.classList.add('hidden');
  if (teamsBtn) teamsBtn.classList.add('hidden');
  setPhase('idle');
  state.halfwayFired = false;
  state.preFinishSlackFired = false;
  runControls.classList.add('hidden');
  slackShareArea.classList.add('hidden');
  shareBtn.disabled = true;
  shareBtn.textContent = '🔗';
  endTimeDisplay.classList.add('hidden');
  startBtn.disabled = false;
  startBtn.classList.remove('hidden');
  // Restore the "SET NEW TIME" default (the time picker flips clockMode off).
  clockMode = true;
  if (clockBtn) clockBtn.setAttribute('aria-pressed', 'true');
  updateStartLabel();
  endboss.dataset.state = 'idle';
  endboss.classList.remove('stressed', 'roar');
  stopIdeTyping();
  hideTokenJoke();
  clearSessionHash();
  // Discard any in-memory durationMin override (from time picker or shared link)
  // so the idle display falls back to the user's stored default.
  settings = loadSettings();
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
  cancelPipes();
  cancelRsi();
  cancelRain();
  cancelTeaTime();
  cancelHydrate();
  cancelPlane();
  setPhase('finished');
  renderTime(0);
  runControls.classList.add('hidden');
  slackShareArea.classList.add('hidden');
  shareBtn.disabled = true;
  startBtn.disabled = false;
  startBtn.classList.remove('hidden');
  // A finished sync returns the Start button to its "SET NEW TIME" default,
  // even if the last session was launched via the time picker (which flips
  // clockMode off). The next sync should default to picking a new time.
  clockMode = true;
  if (clockBtn) clockBtn.setAttribute('aria-pressed', 'true');
  updateStartLabel();

  endboss.dataset.state = 'defeated';
  endboss.classList.remove('stressed');
  stopIdeTyping();
  hideTokenJoke();

  startAlarmLoop();

  showFinishBanner();
  rainCoins();
}

function showFinishBanner() {
  finishBanner.classList.remove('hidden');
  if (finishScore) {
    // Reward the completed focus session with an arcade-style score popup.
    const mins = Math.round((state.totalMs || 0) / 60000) || settings.durationMin;
    finishScore.innerHTML =
      '<span class="finish-score-line">STAGE&nbsp;CLEAR!</span>' +
      '<span class="finish-score-xp">+' + (mins * 100) + ' XP &middot; ' + mins + ' focus min</span>';
    finishScore.classList.remove('hidden');
    // Re-trigger the entrance animation each time the banner appears.
    finishScore.classList.remove('pop');
    void finishScore.offsetWidth;
    finishScore.classList.add('pop');
  }
  if (settings.slackMode === 'manual') {
    slackArea.classList.remove('hidden');
    slackStatus.textContent = '';
    slackStatus.classList.remove('err');
  } else {
    slackArea.classList.add('hidden');
  }
}

function hideFinishBanner() {
  enterDeployState();
}

function enterDeployState() {
  stopAlarmLoop();
  finishBanner.classList.add('hidden');
  setPhase('deploying');
  startBtn.disabled = false;
  runControls.classList.add('hidden');
  shareBtn.disabled = true;
  endTimeDisplay.classList.add('hidden');
  stopIdeTyping();
  hideTokenJoke();
  // Use a dedicated 'deploying' state so the laptop is visible (default .laptop has
  // opacity 0; only specific states reveal it) and the bossDefeated animation no longer applies.
  endboss.dataset.state = 'deploying';
  endboss.classList.remove('stressed', 'roar');
  ideDeploy.classList.remove('hidden');
  if (teamsBtn) teamsBtn.classList.remove('hidden');
  typeDeployText();
  startCloudCoinShowers();
}

function exitDeployState() {
  ideDeploy.classList.add('hidden');
  cancelDeployTyping();
  stopCloudCoinShowers();
}

const DEPLOY_LINE_1 = 'deploying component, fingers crossed';
const DEPLOY_LINE_2 = "don't hit the tester in case of a system failure";
const DEPLOY_LINE_3 = 'Akurro Mortgages Deedpassing status OK';

const DEPLOY_BAR_MS = 5000;
const DEPLOY_HOLD_MS = 20_000;
const DEPLOY_ERASE_MS = 30;

function typeDeployText() {
  cancelDeployTyping();
  ideDeployLine1.textContent = '';
  ideDeployLine2.textContent = '';
  ideDeployCaret.style.display = '';
  // Place caret next to line 1 while typing it, then move to line 2.
  ideDeployLine1.appendChild(ideDeployCaret);

  let i = 0;
  function typeLine1() {
    if (state.phase !== 'deploying') return;
    if (i < DEPLOY_LINE_1.length) {
      ideDeployLine1.insertBefore(document.createTextNode(DEPLOY_LINE_1[i]), ideDeployCaret);
      if (settings.effects && DEPLOY_LINE_1[i] !== ' ') sfx.click();
      i++;
      const h = setTimeout(typeLine1, 55 + Math.random() * 55);
      state.deployTypeHandles.push(h);
    } else {
      // Line 1 done — hide caret, show progress bar filling 0→100%.
      ideDeployCaret.style.display = 'none';
      if (ideDeployBar) {
        ideDeployBar.classList.remove('hidden');
        const fill = ideDeployBar.querySelector('.ide-deploy-bar-fill');
        fill.classList.remove('animating');
        void fill.offsetWidth; // force reflow so animation restarts cleanly
        fill.classList.add('animating');
      }
      // After bar completes, type line 2.
      const h = setTimeout(() => {
        if (state.phase !== 'deploying') return;
        ideDeployCaret.style.display = '';
        ideDeployLine2.appendChild(ideDeployCaret);
        let j = 0;
        function typeLine2() {
          if (state.phase !== 'deploying') return;
          if (j < DEPLOY_LINE_2.length) {
            ideDeployLine2.insertBefore(document.createTextNode(DEPLOY_LINE_2[j]), ideDeployCaret);
            if (settings.effects && DEPLOY_LINE_2[j] !== ' ') sfx.click();
            j++;
            const h2 = setTimeout(typeLine2, 55 + Math.random() * 55);
            state.deployTypeHandles.push(h2);
          } else {
            // Hold, erase line 2, then type line 3 on the same element.
            const hold = setTimeout(() => {
              if (state.phase !== 'deploying') return;
              eraseDeployLine2(typeLine3);
            }, DEPLOY_HOLD_MS);
            state.deployTypeHandles.push(hold);
          }
        }
        typeLine2();
      }, DEPLOY_BAR_MS);
      state.deployTypeHandles.push(h);
    }
  }

  function typeLine3() {
    if (state.phase !== 'deploying') return;
    ideDeployLine2.classList.remove('ide-deploy-warning');
    ideDeployLine2.classList.add('ide-deploy-success');
    let k = 0;
    function step() {
      if (state.phase !== 'deploying') return;
      if (k < DEPLOY_LINE_3.length) {
        ideDeployLine2.insertBefore(document.createTextNode(DEPLOY_LINE_3[k]), ideDeployCaret);
        if (settings.effects && DEPLOY_LINE_3[k] !== ' ') sfx.click();
        k++;
        const h = setTimeout(step, 55 + Math.random() * 55);
        state.deployTypeHandles.push(h);
      }
    }
    step();
  }

  typeLine1();
}

function eraseDeployLine2(onDone) {
  if (state.phase !== 'deploying') return;
  const prev = ideDeployCaret.previousSibling;
  if (!prev) { onDone(); return; }
  if (prev.nodeType === Node.TEXT_NODE && prev.textContent.length > 1) {
    prev.textContent = prev.textContent.slice(0, -1);
  } else {
    prev.remove();
  }
  const h = setTimeout(() => eraseDeployLine2(onDone), DEPLOY_ERASE_MS);
  state.deployTypeHandles.push(h);
}

function cancelDeployTyping() {
  state.deployTypeHandles.forEach((h) => clearTimeout(h));
  state.deployTypeHandles = [];
  if (ideDeployLine1) ideDeployLine1.textContent = '';
  if (ideDeployLine2) {
    ideDeployLine2.textContent = '';
    ideDeployLine2.classList.remove('ide-deploy-success');
    ideDeployLine2.classList.add('ide-deploy-warning');
  }
  if (ideDeployBar) {
    ideDeployBar.classList.add('hidden');
    const fill = ideDeployBar.querySelector('.ide-deploy-bar-fill');
    if (fill) fill.classList.remove('animating');
  }
}

function startCloudCoinShowers() {
  runCloudCoinShower();
  const interval = setInterval(() => {
    if (state.phase !== 'deploying') return;
    runCloudCoinShower();
  }, 4000);
  state.cloudCoinHandles.push(interval);
}

function runCloudCoinShower() {
  const clouds = document.querySelectorAll('.cloud');
  clouds.forEach((cloud) => {
    const rect = cloud.getBoundingClientRect();
    const burstSize = 6 + Math.floor(Math.random() * 5); // 6–10 coins per cloud
    for (let i = 0; i < burstSize; i++) {
      const c = document.createElement('div');
      c.className = 'coin';
      c.style.left = (rect.left + Math.random() * rect.width) + 'px';
      c.style.top = rect.bottom + 'px';
      c.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      c.style.animationDelay = (Math.random() * 0.4) + 's';
      c.style.width = c.style.height = (12 + Math.random() * 12) + 'px';
      confetti.appendChild(c);
    }
  });
  const cleanup = setTimeout(() => {
    if (state.phase === 'deploying') confetti.innerHTML = '';
  }, 3500);
  state.cloudCoinHandles.push(cleanup);
}

function stopCloudCoinShowers() {
  state.cloudCoinHandles.forEach((h) => { clearInterval(h); clearTimeout(h); });
  state.cloudCoinHandles = [];
  confetti.innerHTML = '';
}

const CONFETTI_COLORS = ['#ff4d4d', '#4dd2ff', '#5cff6b', '#ff8a3d', '#c47bff', '#fff14d'];

function rainCoins() {
  confetti.innerHTML = '';
  // Spinning gold coins (the classic celebration).
  const coinCount = 50;
  for (let i = 0; i < coinCount; i++) {
    const c = document.createElement('div');
    c.className = 'coin';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.animationDuration = (2 + Math.random() * 3) + 's';
    c.style.animationDelay = (Math.random() * 0.8) + 's';
    c.style.width = c.style.height = (14 + Math.random() * 14) + 'px';
    confetti.appendChild(c);
  }
  // Colourful confetti pieces mixed in — squares and ribbons that sway as they fall.
  const pieceCount = 70;
  for (let i = 0; i < pieceCount; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    if (i % 3 === 0) p.classList.add('confetti-piece--ribbon');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    p.style.animationDuration = (2.4 + Math.random() * 3) + 's';
    p.style.animationDelay = (Math.random() * 1) + 's';
    p.style.setProperty('--sway', (8 + Math.random() * 26) + 'px');
    confetti.appendChild(p);
  }
  // Clear after last animation
  setTimeout(() => { confetti.innerHTML = ''; }, 6800);
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
    try {
      startAudio.currentTime = 0;
      const p = startAudio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* autoplay blocked — ignore */ }
  },
  pipe() {
    try {
      pipeAudio.currentTime = 0;
      const p = pipeAudio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* autoplay blocked — ignore */ }
  },
  gulp() {
    try {
      waterAudio.currentTime = 0;
      const p = waterAudio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* autoplay blocked — ignore */ }
  },
  popOut() {
    // Four-note ascending 8-bit arpeggio — short but distinct, low volume.
    beep(660,  0.08, 'square', 0.05);
    beep(880,  0.08, 'square', 0.05, 0.09);
    beep(1100, 0.09, 'square', 0.05, 0.18);
    beep(1320, 0.12, 'square', 0.04, 0.28);
  },
  thunder() {
    // Synthesized thunderclap: a short bright crack followed by a low,
    // slowly-decaying noise rumble. Built from a filtered noise buffer.
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;
      const dur = 2.2;
      // White-noise buffer
      const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const ch = buffer.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      // Low-pass sweep: starts brighter (the crack), rolls down into a rumble.
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1600, now);
      lp.frequency.exponentialRampToValueAtTime(180, now + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.32, now + 0.04); // sharp attack
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.5);  // settle
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur); // long tail
      src.connect(lp).connect(g).connect(ctx.destination);
      src.start(now);
      src.stop(now + dur + 0.05);
    } catch (_) { /* audio unavailable — ignore */ }
  },
  // --- Ambient weather SFX (synthesized noise; played at random intervals) ---
  // A soft rain swell: filtered noise that fades in and out like a passing gust
  // of heavier rainfall. Low gain so it sits under everything else.
  rainSwell() {
    noiseBurst({
      dur: 1.4 + Math.random() * 1.0,
      filter: 'lowpass',
      freqStart: 900 + Math.random() * 400,
      freqEnd: 1400 + Math.random() * 500,
      gainPeak: 0.05 + Math.random() * 0.03,
      attack: 0.4,
    });
  },
  // A wind gust: band-passed noise that whooshes up then trails off.
  windGust() {
    noiseBurst({
      dur: 1.6 + Math.random() * 1.2,
      filter: 'bandpass',
      freqStart: 300 + Math.random() * 200,
      freqEnd: 700 + Math.random() * 500,
      gainPeak: 0.06 + Math.random() * 0.04,
      attack: 0.5,
      q: 0.8,
    });
  },
  // A short clear-day bird chirp: 2–4 quick high notes at random pitches.
  birds() {
    const notes = 2 + Math.floor(Math.random() * 3);
    let t = 0;
    for (let i = 0; i < notes; i++) {
      const base = 1800 + Math.random() * 1200;
      beep(base, 0.06, 'sine', 0.035, t);
      beep(base * 1.18, 0.05, 'sine', 0.03, t + 0.05);
      t += 0.12 + Math.random() * 0.12;
    }
  },
};

// Filtered white-noise burst with a fade-in/out envelope and a frequency sweep.
// Shared by the ambient rain/wind sounds.
function noiseBurst({ dur = 1.5, filter = 'lowpass', freqStart = 800, freqEnd = 1200, gainPeak = 0.06, attack = 0.4, q = 1 } = {}) {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(freqStart, now);
    f.frequency.linearRampToValueAtTime(freqEnd, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gainPeak, now + dur * attack); // swell in
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);        // fade out
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(now);
    src.stop(now + dur + 0.05);
  } catch (_) { /* audio unavailable — ignore */ }
}

// ---------- IDE typing animation (runs while boss is at laptop) ----------
const IDE_PROMPTS = [
  'build NewCorp ECH thingy',
  'generate status report',
  'create easy daily goals for me',
  'please fix my merge conflicts',
  'rebase onto main, what could go wrong',
  'apologise to the linter',
  'rename variables until it compiles',
  'add TODO: refactor later',
  'build this story on auto-pilot',
  'set reminder to buy bitterballs',
  'rollback last deploy quietly',
  'cancel all my meetings',
  'silence failing test for now',
  'git blame someone else',
  'make it work, then make it my idea',
  'give me holiday recommendations',
  'why is the application not starting?',
  'why I only see Haiku as model option?',
  
];
let ideTypingHandle = null;
let ideThinkingDotHandle = null;
let ideThinkingDoneHandle = null;
let ideTypingActive = false;

const IDE_MAX_HISTORY_LINES = 4;
let ideLineCounter = 5; // initial hardcoded lines go up to 5
const THINKING_VERBS = [
  'Thinking', 'Pondering', 'Analyzing', 'Exploring', 'Considering',
  'Reasoning', 'Reflecting', 'Investigating', 'Crunching', 'Brewing',
];
const THINKING_SYMBOLS = ['✻', '✱', '✳']; // ✻ ✱ ✳

function getActiveIdeLine() {
  return ideTyping ? ideTyping.closest('.ide-line--active') : null;
}

function trimIdeHistory() {
  const active = getActiveIdeLine();
  if (!active) return;
  const body = active.parentNode;
  const history = Array.from(body.querySelectorAll('.ide-line:not(.ide-line--active)'));
  while (history.length > IDE_MAX_HISTORY_LINES) {
    history.shift().remove();
  }
}

function appendIdeHistoryLine({ prompt = false, userText = '', ghostText = '' } = {}) {
  const active = getActiveIdeLine();
  if (!active) return null;
  ideLineCounter += 1;
  const line = document.createElement('div');
  line.className = 'ide-line';
  const lineno = document.createElement('span');
  lineno.className = 'ide-lineno';
  lineno.textContent = String(ideLineCounter);
  line.appendChild(lineno);
  if (prompt) {
    const promptSpan = document.createElement('span');
    promptSpan.className = 'ide-prompt';
    promptSpan.textContent = '>';
    line.appendChild(promptSpan);
    line.appendChild(document.createTextNode(' '));
    const userSpan = document.createElement('span');
    userSpan.className = 'ide-user';
    userSpan.textContent = userText;
    line.appendChild(userSpan);
  } else {
    const ghostSpan = document.createElement('span');
    ghostSpan.className = 'ide-ghost';
    ghostSpan.textContent = ghostText;
    line.appendChild(ghostSpan);
  }
  active.parentNode.insertBefore(line, active);
  const activeNo = active.querySelector('.ide-lineno');
  if (activeNo) activeNo.textContent = String(ideLineCounter + 1);
  trimIdeHistory();
  return line;
}

function startIdeThinking(onDone) {
  const verb = THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)];
  const symbol = THINKING_SYMBOLS[Math.floor(Math.random() * THINKING_SYMBOLS.length)];
  const baseText = `  ${symbol} ${verb}`;
  const line = appendIdeHistoryLine({ ghostText: baseText });
  if (!line) { onDone(); return; }
  const ghostSpan = line.querySelector('.ide-ghost');
  let dots = 0;
  function step() {
    if (!ideTypingActive) return;
    dots = (dots + 1) % 4;
    ghostSpan.textContent = baseText + '.'.repeat(dots);
    ideThinkingDotHandle = setTimeout(step, 350);
  }
  step();
  const duration = 2500 + Math.random() * 4500;
  ideThinkingDoneHandle = setTimeout(() => {
    if (ideThinkingDotHandle) { clearTimeout(ideThinkingDotHandle); ideThinkingDotHandle = null; }
    if (!ideTypingActive) return;
    ghostSpan.textContent = baseText + '...';
    onDone();
  }, duration);
}

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
      // Pause on the finished prompt, then move it to history, run a
      // Claude Code-style thinking animation, then start the next prompt.
      ideTypingHandle = setTimeout(() => {
        if (!ideTypingActive) return;
        appendIdeHistoryLine({ prompt: true, userText: text });
        ideTyping.textContent = '';
        startIdeThinking(() => {
          if (!ideTypingActive) return;
          ideTypingHandle = setTimeout(ideTypeLoop, 350);
        });
      }, 700);
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
  if (ideThinkingDotHandle) { clearTimeout(ideThinkingDotHandle); ideThinkingDotHandle = null; }
  if (ideThinkingDoneHandle) { clearTimeout(ideThinkingDoneHandle); ideThinkingDoneHandle = null; }
  if (ideTyping) ideTyping.textContent = '';
}

function showTokenJoke() {
  if (state.phase !== 'running') return;
  // If RSI is on-screen, defer so the error icon + frozen prompt aren't
  // written underneath the bar and revealed when the break ends.
  if (state.rsiActive) {
    state.tokenJokeHandle = setTimeout(showTokenJoke, 5_000);
    return;
  }
  state.tokenJokeShown = true;
  ideTypingActive = false;
  if (ideTypingHandle) { clearTimeout(ideTypingHandle); ideTypingHandle = null; }
  if (ideThinkingDotHandle) { clearTimeout(ideThinkingDotHandle); ideThinkingDotHandle = null; }
  if (ideThinkingDoneHandle) { clearTimeout(ideThinkingDoneHandle); ideThinkingDoneHandle = null; }
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

// ---------- RSI break joke ----------

function scheduleRsiBreaks() {
  cancelRsi();
  const now = Date.now();
  const windowEnd = state.endAt - 10 * 60 * 1000; // stop before sleeping phase
  const windowMs = windowEnd - now;
  if (windowMs <= 0) return;

  const count = 10;
  for (let i = 0; i < count; i++) {
    const delay = Math.random() * windowMs;
    const h = setTimeout(triggerRsiBreak, delay);
    state.rsiHandles.push(h);
  }
}

function triggerRsiBreak() {
  if (state.phase !== 'running') return;
  if (state.tokenJokeShown) return;
  if (state.rsiActive) return;
  const bossState = endboss.dataset.state;
  if (bossState === 'sleeping' || bossState === 'defeated') return;

  state.rsiActive = true;
  stopIdeTyping();
  endboss.classList.add('rsi-break');
  ideRsi.classList.remove('hidden');
  // Restart bar animation by cycling the class
  const fill = ideRsi.querySelector('.ide-rsi-bar-fill');
  fill.classList.remove('animating');
  void fill.offsetWidth; // force reflow
  fill.classList.add('animating');

  const h = setTimeout(endRsiBreak, 60_000);
  state.rsiHandles.push(h);
}

function endRsiBreak() {
  ideRsi.classList.add('hidden');
  endboss.classList.remove('rsi-break');
  state.rsiActive = false;
  if (
    state.phase === 'running' &&
    !state.tokenJokeShown &&
    endboss.dataset.state !== 'sleeping' &&
    endboss.dataset.state !== 'defeated'
  ) {
    startIdeTyping();
  }
}

function cancelRsi() {
  state.rsiHandles.forEach((h) => clearTimeout(h));
  state.rsiHandles = [];
  state.rsiActive = false;
  endboss.classList.remove('rsi-break');
  if (ideRsi) ideRsi.classList.add('hidden');
}

// ---------- Rain shower joke ----------

function scheduleRainShowers() {
  // When weather is driving continuous rain, skip the random shower schedule.
  if (state.weatherRain) return;
  cancelRain();
  const now = Date.now();
  const windowMs = state.endAt - now;
  if (windowMs <= 0) return;

  const count = Math.floor(Math.random() * 4) + 2; // 2–5 showers per session
  for (let i = 0; i < count; i++) {
    const delay = Math.random() * windowMs;
    const h = setTimeout(runRainShower, delay);
    state.rainHandles.push(h);
  }
}

function runRainShower() {
  // Weather rain runs regardless of timer phase; random showers need a running session.
  if (state.phase !== 'running' && !state.weatherRain) return;
  const clouds = document.querySelectorAll('.cloud');
  if (!clouds.length) return;
  clouds.forEach((cloud) => {
    const rect = cloud.getBoundingClientRect();
    // Drops per cloud scale with its width so wider clouds rain more.
    const dropCount = 14 + Math.floor((rect.width / 130) * 12 + Math.random() * 8);
    for (let i = 0; i < dropCount; i++) {
      const d = document.createElement('div');
      d.className = 'raindrop';
      // Emerge from across the cloud's underside, at its current drifted position.
      d.style.left = (rect.left + Math.random() * rect.width) + 'px';
      d.style.top = (rect.bottom - 4) + 'px';
      d.style.animationDuration = (0.8 + Math.random() * 1.2) + 's';
      d.style.animationDelay = (Math.random() * 1.5) + 's';
      rainContainer.appendChild(d);
    }
  });
  const h = setTimeout(() => {
    // Remove only the drops from this shower to avoid clearing concurrent showers' leftovers
    while (rainContainer.firstChild) rainContainer.removeChild(rainContainer.firstChild);
  }, 4000);
  state.rainHandles.push(h);
}

function cancelRain() {
  state.rainHandles.forEach((h) => clearTimeout(h));
  state.rainHandles = [];
  // Stop weather-driven continuous rain too (used by reset/finish).
  if (typeof stopWeatherRain === 'function') stopWeatherRain();
  if (rainContainer) rainContainer.innerHTML = '';
}

// ---------- Tea time scene ----------
// 5 minutes before the end, the boss declares "tea time!" — speech bubble for 1 min,
// pipe chirp plays once. Other scenes (RSI, topi, rain) keep running underneath.
const TEA_TIME_BEFORE_END_MS = 5 * 60 * 1000;
const TEA_TIME_DURATION_MS = 60 * 1000;

function scheduleTeaTime() {
  cancelTeaTime();
  const teaStart = state.endAt - TEA_TIME_BEFORE_END_MS;
  const delay = teaStart - Date.now();
  if (delay > 0) {
    state.teaTimeHandle = setTimeout(() => showTeaTime(TEA_TIME_DURATION_MS), delay);
  } else if (delay > -TEA_TIME_DURATION_MS) {
    // Shared-link viewer joined mid-tea-time — show for the remaining slice.
    showTeaTime(TEA_TIME_DURATION_MS + delay);
  }
}

function showTeaTime(durationMs) {
  if (state.phase !== 'running') return;
  if (!speechBubbleTea) return;
  speechBubbleTea.classList.add('show');
  if (settings.effects) sfx.pipe();
  state.teaTimeHideHandle = setTimeout(() => {
    speechBubbleTea.classList.remove('show');
  }, durationMs);
}

function cancelTeaTime() {
  if (state.teaTimeHandle) { clearTimeout(state.teaTimeHandle); state.teaTimeHandle = null; }
  if (state.teaTimeHideHandle) { clearTimeout(state.teaTimeHideHandle); state.teaTimeHideHandle = null; }
  if (speechBubbleTea) speechBubbleTea.classList.remove('show');
}

// ---------- Hydration nudge ----------
// At halfway, the boss reminds the team to drink water.
const HYDRATE_DURATION_MS = 8 * 1000;

function showHydrate(durationMs) {
  if (state.phase !== 'running') return;
  if (!speechBubbleHydrate) return;
  if (state.hydrateHideHandle) { clearTimeout(state.hydrateHideHandle); state.hydrateHideHandle = null; }
  speechBubbleHydrate.classList.add('show');
  if (settings.effects) sfx.gulp();
  state.hydrateHideHandle = setTimeout(() => {
    speechBubbleHydrate.classList.remove('show');
  }, durationMs);
}

function cancelHydrate() {
  if (state.hydrateHideHandle) { clearTimeout(state.hydrateHideHandle); state.hydrateHideHandle = null; }
  if (speechBubbleHydrate) speechBubbleHydrate.classList.remove('show');
}

// ---------- Mario pipe character cameos ----------
const PIPE_CHARACTERS = [
  { id: 'Frank',  shirt: '#e63946', texts: ['Is it ready yet?'] },
  { id: 'QA',     shirt: '#3a86ff', texts: ["We've to check with legal here"] },
  { id: 'Lars',   shirt: '#fb8500', texts: ['Nooo, not another review', 'Rustaaaggghh', "I'll work from home until..."] },
  { id: 'Jarno',  shirt: '#2a9d8f', texts: ['Theee!'] },
  { id: 'Rene',   shirt: '#7c3aed', texts: ['d.n.d. I am Vibe Testing', 'check the new features in the sync timer', 'maybe risk storming is a good idea?'] },
  { id: 'Marlou', shirt: '#ec4899', texts: ["I'll be back before you know it."] },
  { id: 'Tom',    shirt: '#0d9488', texts: ["CoPilot is doing weird things again"] },
  { id: 'Peter',  shirt: '#fbbf24', texts: ["Let's have some fun. I turned Yolo mode on"] },
  { id: 'Silke',  shirt: '#4b5563', texts: ["Why am I the only one here in the office?", "I am on 99% of my token budget"] },
  { id: 'Emil',   shirt: '#06b6d4', texts: ["I've a new idea: code manually"] },
];
const PIPE_VISIT_COUNT = 8;
const PIPE_VISIT_TAIL_MS = 30 * 1000;
const PIPE_VISIT_DURATION_MS = 60000;

function getPipeEl(side) {
  return side === 'left' ? pipeLeftEl : pipeRightEl;
}

function runPipeVisit({ pipe, character, text }) {
  const el = getPipeEl(pipe);
  if (!el) return;
  if (state.pipeInFlight) return; // skip if one is already mid-cameo
  state.pipeInFlight = true;
  const charEl = el.querySelector('.pipe-character');
  const bodyEl = el.querySelector('.pipe-char-body');
  const nameEl = el.querySelector('.pipe-char-name');
  const bubbleEl = el.querySelector('.pipe-bubble');
  const bubbleTextEl = el.querySelector('.pipe-bubble-text');
  if (charEl) charEl.setAttribute('data-char', character.id);
  if (bodyEl) bodyEl.style.background = character.shirt;
  if (nameEl) nameEl.textContent = character.id;
  if (bubbleTextEl) bubbleTextEl.textContent = text;

  if (settings.effects && settings.pipeSounds) sfx.popOut();
  charEl.classList.remove('retreating');
  charEl.classList.add('show');

  const h1 = setTimeout(() => {
    bubbleEl.classList.add('show');
  }, 400);
  state.pipeHandles.push(h1);

  const h2 = setTimeout(() => {
    bubbleEl.classList.remove('show');
  }, 400 + PIPE_VISIT_DURATION_MS);
  state.pipeHandles.push(h2);

  const h3 = setTimeout(() => {
    charEl.classList.add('retreating');
    charEl.classList.remove('show');
  }, 600 + PIPE_VISIT_DURATION_MS);
  state.pipeHandles.push(h3);

  const h4 = setTimeout(() => {
    charEl.classList.remove('retreating');
    state.pipeInFlight = false;
  }, 1100 + PIPE_VISIT_DURATION_MS);
  state.pipeHandles.push(h4);
}

function schedulePipeVisits() {
  cancelPipes();
  const now = Date.now();
  const sessionStart = state.endAt - state.totalMs;
  const windowEnd = state.endAt - PIPE_VISIT_TAIL_MS;
  const windowMs = windowEnd - sessionStart;
  if (windowMs <= 0) return;

  // Same PRNG family as topi, but seeded with +1 offset so the schedules
  // don't sync to each other predictably while staying deterministic
  // across shared-link viewers.
  const rand = mulberry32(Math.floor(state.endAt / 1000) + 1);

  for (let i = 0; i < PIPE_VISIT_COUNT; i++) {
    const bucketStart = sessionStart + (windowMs / PIPE_VISIT_COUNT) * i;
    const bucketEnd   = sessionStart + (windowMs / PIPE_VISIT_COUNT) * (i + 1);
    const when = bucketStart + rand() * (bucketEnd - bucketStart);
    const delay = when - now;
    const charIdx = Math.floor(rand() * PIPE_CHARACTERS.length);
    const character = PIPE_CHARACTERS[charIdx];
    const text = character.texts[Math.floor(rand() * character.texts.length)];
    const pipe = rand() < 0.5 ? 'left' : 'right';
    if (delay < 0) continue;
    const h = setTimeout(() => runPipeVisit({ pipe, character, text }), delay);
    state.pipeHandles.push(h);
  }
}

function cancelPipes() {
  state.pipeHandles.forEach((h) => clearTimeout(h));
  state.pipeHandles = [];
  state.pipeInFlight = false;
  [pipeLeftEl, pipeRightEl].forEach((el) => {
    if (!el) return;
    const charEl = el.querySelector('.pipe-character');
    const bubbleEl = el.querySelector('.pipe-bubble');
    if (charEl) { charEl.classList.remove('show', 'retreating'); }
    if (bubbleEl) { bubbleEl.classList.remove('show'); }
  });
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

// ---------- Banner plane ----------
// A pixel-art plane tows a banner across the sky a couple of times per session
// (kept rare so it stays a treat). To add more messages later, just append
// strings to PLANE_BANNERS — each flight picks one deterministically.
const PLANE_BANNERS = ['Topicus', 'Your advertisement here? call Eindbazen', "Don't forget! It's Silke's last week!"];
const PLANE_VISIT_COUNT = 4;        // flights per session — deliberately rare
const PLANE_TAIL_MS = 30 * 1000;    // leave the final 30 s clear
const PLANE_FLY_MS = 26 * 1000;     // time to cross the screen (matches CSS)

function schedulePlaneFlights() {
  cancelPlane();
  const now = Date.now();
  const sessionStart = state.endAt - state.totalMs;
  const windowEnd = state.endAt - PLANE_TAIL_MS;
  const windowMs = windowEnd - sessionStart;
  if (windowMs <= 0) return;

  // Deterministic, evenly-spaced schedule like topi/pipes. Seed offset +2 so the
  // schedule doesn't sync with topi (seed +0) or the pipe cameos (seed +1), and
  // shared-link viewers see the same flights at the same wall-clock moments.
  const rand = mulberry32(Math.floor(state.endAt / 1000) + 2);

  for (let i = 0; i < PLANE_VISIT_COUNT; i++) {
    const bucketStart = sessionStart + (windowMs / PLANE_VISIT_COUNT) * i;
    const bucketEnd   = sessionStart + (windowMs / PLANE_VISIT_COUNT) * (i + 1);
    const when = bucketStart + rand() * (bucketEnd - bucketStart);
    // Consume a rand() for the message regardless of skip, so the sequence
    // stays aligned across viewers who join the session at different times.
    const msgIndex = Math.floor(rand() * PLANE_BANNERS.length);
    const delay = when - now;
    if (delay < 0) continue; // already past — skip
    const h = setTimeout(() => runPlaneFlight(msgIndex), delay);
    state.planeHandles.push(h);
  }
}

function runPlaneFlight(msgIndex = 0) {
  if (!planeEl) return;
  if (state.planeInFlight) return; // only one plane at a time
  state.planeInFlight = true;

  if (planeBannerText) {
    planeBannerText.textContent = PLANE_BANNERS[msgIndex] || PLANE_BANNERS[0] || '';
  }

  // Restart the fly animation (remove → reflow → add).
  planeEl.classList.remove('flying');
  void planeEl.offsetWidth;
  planeEl.classList.add('flying');

  const done = (e) => {
    // Ignore the infinite child animations (bannerWave / planeProp) bubbling up.
    if (e && e.animationName && e.animationName !== 'planeFly') return;
    planeEl.classList.remove('flying');
    state.planeInFlight = false;
    planeEl.removeEventListener('animationend', done);
  };
  planeEl.addEventListener('animationend', done);
  // Safety net in case animationend is missed (e.g. tab was backgrounded).
  const h = setTimeout(() => done(), PLANE_FLY_MS + 1500);
  state.planeHandles.push(h);
}

function cancelPlane() {
  state.planeHandles.forEach((h) => clearTimeout(h));
  state.planeHandles = [];
  state.planeInFlight = false;
  if (planeEl) planeEl.classList.remove('flying');
}

// ---------- Weather module ----------
// Uses Open-Meteo (free, no API key, CORS-enabled — browser calls it directly).
// Fetches on enable / session start, refreshes every 20 min.
// Shared links freeze the host's weather snapshot into the URL hash.

const WEATHER_REFRESH_MS = 20 * 60 * 1000;
const DEFAULT_COORDS = { lat: 52.37, lon: 4.90 }; // Amsterdam

// WMO weather code → simplified condition
function wmoToCondition(code) {
  if (code === 0) return 'clear';
  if (code <= 3 || code === 45 || code === 48) return 'cloudy';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 95) return 'thunder'; // 95–99 = thunderstorm (lightning + thunder)
  return 'cloudy'; // 71–86 = snow → treat as cloudy (snow not in scope)
}

// Parse a raw "lat,lon" string. Returns {lat,lon} or null if not coord-shaped.
function parseCoords(str) {
  if (!str || !str.trim()) return null;
  const parts = str.split(',').map((s) => parseFloat(s.trim()));
  if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])
      && Math.abs(parts[0]) <= 90 && Math.abs(parts[1]) <= 180) {
    return { lat: parts[0], lon: parts[1] };
  }
  return null;
}

// Resolve a city name to coordinates via Open-Meteo's free geocoding API.
// Returns { lat, lon, label } or null if the place is unknown.
async function geocodeCity(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding ${res.status}`);
  const data = await res.json();
  if (!data.results || !data.results.length) return null;
  const r = data.results[0];
  const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
  return { lat: r.latitude, lon: r.longitude, label };
}

// Resolve the configured location (coords or city name) to {lat,lon}.
// Caches the result of a city lookup in state.resolvedCoords.
async function resolveLocation() {
  const raw = settings.weatherLocation;
  if (!raw || !raw.trim()) return DEFAULT_COORDS;
  const coords = parseCoords(raw);
  if (coords) return coords;
  // It's a city name — use cache if it matches, else geocode.
  if (state.resolvedCoords && state.resolvedCoords.query === raw) {
    return { lat: state.resolvedCoords.lat, lon: state.resolvedCoords.lon };
  }
  const geo = await geocodeCity(raw);
  if (!geo) throw new Error('Unknown location');
  state.resolvedCoords = { query: raw, lat: geo.lat, lon: geo.lon, label: geo.label };
  return { lat: geo.lat, lon: geo.lon };
}

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,precipitation,weather_code,wind_speed_10m,is_day&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API ${res.status}`);
  const data = await res.json();
  const c = data.current;
  return {
    tempC:         Math.round(c.temperature_2m),
    precipitation: c.precipitation,
    code:          c.weather_code,
    windKmh:       Math.round(c.wind_speed_10m),
    isDay:         c.is_day === 1,
    condition:     wmoToCondition(c.weather_code),
  };
}

const SKY_DAY_CLEAR   = { top: '#5c94fc', bottom: '#8fbfff' };
const SKY_DAY_CLOUDY  = { top: '#7a8fa8', bottom: '#a0b4c8' };
const SKY_NIGHT_CLEAR = { top: '#0a0a2e', bottom: '#1a2a5e' };
const SKY_NIGHT_CLOUD = { top: '#141422', bottom: '#242436' };

function applyWeather(w) {
  if (!w) return;
  state.weather = w;

  // Night when the weather says so OR dark mode is forced on.
  const night = !w.isDay || settings.darkMode;

  // Sky colours
  let palette;
  if (!night) {
    palette = w.condition === 'clear' ? SKY_DAY_CLEAR : SKY_DAY_CLOUDY;
  } else {
    palette = w.condition === 'clear' ? SKY_NIGHT_CLEAR : SKY_NIGHT_CLOUD;
  }
  const root = document.documentElement;
  root.style.setProperty('--sky-top',    palette.top);
  root.style.setProperty('--sky-bottom', palette.bottom);

  // Night class (stars, moon, lit castle windows, dimmed scene)
  setNightMode(night);

  // Overcast class (grey clouds) — rain, thunder, or cloudy at night
  const skyEl = document.querySelector('.sky');
  if (skyEl) {
    skyEl.classList.toggle('is-overcast',
      w.condition === 'rain' || w.condition === 'thunder' ||
      (w.condition === 'cloudy' && night));
    // Thunderstorm gets an extra-dark, ominous tint.
    skyEl.classList.toggle('is-thunder', w.condition === 'thunder');
    // Clear sky → hide the clouds entirely (blue/starry sky, nothing drifting).
    skyEl.classList.toggle('is-clear', w.condition === 'clear');
  }

  // Sun — visible during daytime clear or partly-cloudy weather (never at
  // night, and not during rain/thunder when the sky reads as overcast).
  document.body.classList.toggle('is-sunny',
    !night && (w.condition === 'clear' || w.condition === 'cloudy'));

  // Cloud drift speed (wind)
  let speedScale = 1;
  if (w.windKmh > 70)      speedScale = 3.5;
  else if (w.windKmh > 40) speedScale = 2.2;
  else if (w.windKmh > 20) speedScale = 1.5;
  root.style.setProperty('--cloud-speed-scale', String(speedScale));

  // Continuous rain — rain + thunderstorms bring rain.
  const raining = w.condition === 'rain' || w.condition === 'thunder';
  if (raining) {
    startWeatherRain();
    showPuddles();
  } else {
    stopWeatherRain();
    hidePuddles();
  }

  // Wind: blowing leaves whenever it's genuinely windy (>25 km/h), independent
  // of precipitation — a "storm"/windy day. Stronger wind = more leaves.
  if (w.windKmh > 25) {
    startLeaves(w.windKmh);
  } else {
    stopLeaves();
  }

  // Lightning + thunder only during actual thunderstorms.
  if (w.condition === 'thunder') {
    startLightning();
  } else {
    stopLightning();
  }

  // Endboss accessories — no shades at night / in dark mode.
  const sunny  = !night && w.condition === 'clear' && w.tempC > 25;
  endboss.classList.toggle('is-cool-shades', sunny);
  endboss.classList.toggle('is-sweating',    w.tempC > 30);
  endboss.classList.toggle('is-shivering',   w.tempC <= 2);

  // Random ambient weather SFX matched to this condition.
  updateWeatherAmbience();
}

function clearWeather() {
  stopWeatherRain();
  stopWeatherAmbience();
  state.weather = null;

  const root = document.documentElement;
  root.style.removeProperty('--sky-top');
  root.style.removeProperty('--sky-bottom');
  root.style.setProperty('--cloud-speed-scale', '1');

  // Respect a standalone dark-mode toggle even when weather is cleared.
  setNightMode(settings.darkMode);
  const skyEl = document.querySelector('.sky');
  if (skyEl) skyEl.classList.remove('is-overcast', 'is-thunder', 'is-clear');
  document.body.classList.remove('is-sunny');
  hidePuddles();
  stopLightning();
  stopLeaves();

  endboss.classList.remove('is-cool-shades', 'is-sweating', 'is-shivering');
}

// ---------- Night mode + starfield ----------
function buildStarfield() {
  if (!starfield || starfield.childElementCount) return; // build once
  const STAR_COUNT = 70;
  for (let i = 0; i < STAR_COUNT; i++) {
    const s = document.createElement('div');
    s.className = 'star';
    const size = 1 + Math.random() * 2;
    s.style.width = s.style.height = size + 'px';
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 62 + '%'; // keep stars in the upper sky
    s.style.animationDuration = (2 + Math.random() * 3) + 's';
    s.style.animationDelay = (Math.random() * 3) + 's';
    starfield.appendChild(s);
  }
}

function setNightMode(on) {
  if (on) buildStarfield();
  document.body.classList.toggle('is-night', !!on);
}

// ---------- Rain puddles ----------
function showPuddles() {
  if (!puddleContainer || state.puddlesShown) return;
  state.puddlesShown = true;
  const count = 5 + Math.floor(Math.random() * 4); // 5–8 puddles
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'puddle';
    const width = 50 + Math.random() * 120;
    p.style.width = width + 'px';
    p.style.left = Math.random() * 92 + 'vw';
    p.style.animationDelay = (Math.random() * 1.5) + 's';
    p.style.opacity = '';
    puddleContainer.appendChild(p);
  }
}

function hidePuddles() {
  if (!puddleContainer) return;
  state.puddlesShown = false;
  puddleContainer.innerHTML = '';
}

// ---------- Continuous weather rain ----------
// Distinct from the random "rain shower" joke: this is a smooth, full-width
// downpour. Drops spawn in a steady trickle across the whole sky and each one
// removes itself when its fall animation ends — so there's no periodic
// clear-everything flush (which caused the visible stutter when rain started).
function spawnRaindropBurst(count) {
  if (!rainContainer) return;
  const vw = window.innerWidth;
  for (let i = 0; i < count; i++) {
    const d = document.createElement('div');
    d.className = 'raindrop';
    d.style.left = (Math.random() * vw) + 'px';
    d.style.top = '-20px';
    const dur = 0.7 + Math.random() * 0.7;
    d.style.animationDuration = dur + 's';
    // Clean up exactly when this drop finishes falling — no mass flush.
    d.addEventListener('animationend', () => d.remove());
    rainContainer.appendChild(d);
  }
}

function startWeatherRain() {
  if (state.weatherRain) return; // already raining
  state.weatherRain = true;
  // Cancel any random joke-shower timers and clear leftover drops for a clean start.
  state.rainHandles.forEach((h) => clearTimeout(h));
  state.rainHandles = [];
  if (rainContainer) rainContainer.innerHTML = '';
  // Pre-seed staggered drops so the screen fills naturally instead of popping in.
  spawnRaindropBurst(40);
  // Steady trickle thereafter.
  state.weatherRainHandle = setInterval(() => spawnRaindropBurst(12), 180);
}

function stopWeatherRain() {
  if (state.weatherRainHandle) {
    clearInterval(state.weatherRainHandle);
    state.weatherRainHandle = null;
  }
  state.weatherRain = false;
  // Let in-flight drops finish their fall naturally (they self-remove);
  // nothing to flush here, avoiding an abrupt disappearance.
}

// ---------- Wind: blowing leaves ----------
function startLeaves(windKmh) {
  if (!leafContainer) return;
  // Scale spawn rate + drift speed with wind strength.
  const intervalMs = windKmh > 60 ? 550 : windKmh > 40 ? 850 : 1300;
  if (state.leafHandle && state.leafWind === bucketWind(windKmh)) return; // unchanged
  stopLeaves();
  state.leafWind = bucketWind(windKmh);
  const spawn = () => {
    if (!leafContainer) return;
    const leaf = document.createElement('div');
    leaf.className = 'leaf leaf--' + (1 + Math.floor(Math.random() * 3));
    // Start off the left edge at a random height in the upper-middle band.
    leaf.style.top = (5 + Math.random() * 55) + 'vh';
    const dur = windKmh > 60 ? (2.5 + Math.random() * 1.5)
              : windKmh > 40 ? (3.5 + Math.random() * 2)
              : (5 + Math.random() * 2.5);
    leaf.style.animationDuration = dur + 's, ' + (0.6 + Math.random() * 0.8) + 's';
    leaf.addEventListener('animationend', (e) => {
      // The drift (first) animation finishing means the leaf has crossed the screen.
      if (e.animationName === 'leafBlow') leaf.remove();
    });
    leafContainer.appendChild(leaf);
  };
  spawn();
  state.leafHandle = setInterval(spawn, intervalMs);
}

function bucketWind(w) {
  return w > 60 ? 'high' : w > 40 ? 'mid' : 'low';
}

function stopLeaves() {
  if (state.leafHandle) { clearInterval(state.leafHandle); state.leafHandle = null; }
  state.leafWind = null;
  if (leafContainer) leafContainer.innerHTML = '';
}

// ---------- Lightning + thunder (thunderstorm scenes) ----------
function flashLightning() {
  if (!lightning) return;
  // A flash is usually a quick double-blink. Cycle the class to restart the anim.
  lightning.classList.remove('flashing');
  void lightning.offsetWidth; // force reflow
  lightning.classList.add('flashing');
  // Thunder follows the flash by a short, slightly random delay (sound lag).
  const thunderDelay = 250 + Math.random() * 600;
  setTimeout(() => {
    if (weatherSoundsOn()) sfx.thunder();
  }, thunderDelay);
}

function scheduleNextLightning() {
  // Random gap between strikes: 4–12 s.
  const delay = 4000 + Math.random() * 8000;
  state.lightningHandle = setTimeout(() => {
    flashLightning();
    scheduleNextLightning();
  }, delay);
}

function startLightning() {
  if (state.lightningHandle) return; // already running
  // First strike comes quickly so the storm reads immediately.
  state.lightningHandle = setTimeout(() => {
    flashLightning();
    scheduleNextLightning();
  }, 600);
}

function stopLightning() {
  if (state.lightningHandle) { clearTimeout(state.lightningHandle); state.lightningHandle = null; }
  if (lightning) lightning.classList.remove('flashing');
}

// ---------- Ambient weather sounds (random, optional) ----------
// Plays short synthesized weather SFX (rain swells, wind gusts, birdsong) at
// random intervals matched to the current condition. Gated behind both the
// master "Sound effects" toggle and the dedicated "Weather sounds" toggle.
function weatherSoundsOn() {
  return settings.effects && settings.weatherSoundsEnabled;
}

// Which ambient sounds suit the current weather. Returns a weighted pool.
function weatherSoundPool() {
  const w = state.weather;
  if (!w) return [];
  const pool = [];
  if (w.condition === 'rain' || w.condition === 'thunder') pool.push('rain', 'rain');
  if (w.windKmh > 25) pool.push('wind');
  // Birds only on a calm, clear day (not at night / dark mode).
  if (w.condition === 'clear' && w.isDay && !settings.darkMode && w.windKmh <= 25) pool.push('birds');
  return pool;
}

function playRandomWeatherSound() {
  if (!weatherSoundsOn()) return;
  const pool = weatherSoundPool();
  if (!pool.length) return;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick === 'rain') sfx.rainSwell();
  else if (pick === 'wind') sfx.windGust();
  else if (pick === 'birds') sfx.birds();
}

function scheduleWeatherAmbience() {
  clearTimeout(state.weatherAmbienceHandle);
  // Random gap between ambient cues: 5–15 s, so it never feels metronomic.
  const delay = 5000 + Math.random() * 10000;
  state.weatherAmbienceHandle = setTimeout(() => {
    playRandomWeatherSound();
    scheduleWeatherAmbience();
  }, delay);
}

// Start/stop the ambience loop based on whether the current weather has any
// matching sounds and the toggles allow it. Safe to call repeatedly.
function updateWeatherAmbience() {
  if (weatherSoundsOn() && weatherSoundPool().length) {
    if (!state.weatherAmbienceHandle) scheduleWeatherAmbience();
  } else {
    stopWeatherAmbience();
  }
}

function stopWeatherAmbience() {
  if (state.weatherAmbienceHandle) {
    clearTimeout(state.weatherAmbienceHandle);
    state.weatherAmbienceHandle = null;
  }
}

let weatherRefreshHandle = null;

function stopWeather() {
  if (weatherRefreshHandle) { clearInterval(weatherRefreshHandle); weatherRefreshHandle = null; }
  clearWeather();
}

async function startWeather() {
  if (!settings.weatherEnabled) return;
  // Shared-link viewers see a snapshot from the URL, never live-fetch.
  if (state.fromSharedLink) return;

  try {
    const { lat, lon } = await resolveLocation();
    const w = await fetchWeather(lat, lon);
    applyWeather(w);
    console.log('[weather] fetched:', w);
  } catch (err) {
    console.warn('[weather] fetch failed:', err);
  }

  if (weatherRefreshHandle) clearInterval(weatherRefreshHandle);
  weatherRefreshHandle = setInterval(async () => {
    if (!settings.weatherEnabled) return;
    try {
      const { lat, lon } = await resolveLocation();
      applyWeather(await fetchWeather(lat, lon));
    } catch (err) {
      console.warn('[weather] refresh failed:', err);
    }
  }, WEATHER_REFRESH_MS);
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
  // Allow any positive integer up to 24h — time-picker sessions aren't bound to 30-min steps.
  if (!Number.isInteger(d) || d < 1 || d > 1440) return null;
  const result = { endAt: e, durationMin: d };
  // Optional weather snapshot: &w=tempC,code,windKmh,isDay(0|1)
  const wParam = params.get('w');
  if (wParam) {
    const parts = wParam.split(',').map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [tempC, code, windKmh, isDayInt] = parts;
      result.weatherSnapshot = { tempC, code, windKmh,
        isDay: isDayInt === 1, condition: wmoToCondition(code), precipitation: 0 };
    }
  }
  return result;
}

function clearSessionHash() {
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

async function copyShareLink() {
  const url = new URL(window.location.href);
  url.hash = `e=${state.endAt}&d=${settings.durationMin}`;
  // Freeze current weather into the link so shared viewers see the same scene.
  if (settings.weatherEnabled && state.weather) {
    const w = state.weather;
    url.hash += `&w=${w.tempC},${w.code},${w.windKmh},${w.isDay ? 1 : 0}`;
  }
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
        message: `:alarm_clock: *Hey Eindbazen! Sync time in 1 minute!* (${settings.durationMin} min)`,
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

async function sendSlackStart() {
  slackShareBtn.disabled = true;
  slackShareStatus.textContent = 'Sending…';
  slackShareStatus.classList.remove('err');
  const url = new URL(window.location.href);
  url.hash = `e=${state.endAt}&d=${settings.durationMin}`;
  const endTime = formatEndTime(state.endAt);
  try {
    const res = await fetch('/.netlify/functions/slack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `:hourglass_flowing_sand: Een nieuw focus-block is gestart. ${settings.durationMin} min — ends at ${endTime}\n${url.toString()}`,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    slackShareStatus.textContent = data.stubbed ? 'Sent (stub mode)' : 'Sent!';
    setTimeout(() => { slackShareStatus.textContent = ''; }, 10_000);
  } catch (err) {
    console.error('Slack start send failed', err);
    slackShareStatus.textContent = 'Failed: ' + err.message;
    slackShareStatus.classList.add('err');
    slackShareBtn.disabled = false;
  }
}

// ---------- Settings UI ----------
function openSettings() {
  durationDisplay.textContent = String(settings.durationMin);
  effectsToggle.checked = settings.effects;
  alarmToggle.checked = settings.alarm;
  pipeSoundsToggle.checked = settings.pipeSounds;
  roundStartToggle.checked = settings.roundStart;
  slackModeSel.value = settings.slackMode;
  if (devModeToggle) devModeToggle.checked = settings.devMode;
  if (fastTopiToggle) fastTopiToggle.checked = settings.fastTopi;
  if (weatherToggle) weatherToggle.checked = settings.weatherEnabled;
  if (weatherSoundsToggle) weatherSoundsToggle.checked = settings.weatherSoundsEnabled;
  if (weatherLocationInput) weatherLocationInput.value = settings.weatherLocation;
  if (darkModeToggle) darkModeToggle.checked = settings.darkMode;
  validateLocation(settings.weatherLocation);
  applyDevMode();
  updateStepperDisabled();
  document.getElementById('appVersion').textContent = APP_VERSION;
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
pipeSoundsToggle.addEventListener('change', () => {
  settings.pipeSounds = pipeSoundsToggle.checked;
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

if (weatherToggle) {
  weatherToggle.addEventListener('change', () => {
    settings.weatherEnabled = weatherToggle.checked;
    saveSettings(settings);
    if (settings.weatherEnabled) {
      startWeather();
    } else {
      stopWeather();
    }
  });
}

if (weatherSoundsToggle) {
  weatherSoundsToggle.addEventListener('change', () => {
    settings.weatherSoundsEnabled = weatherSoundsToggle.checked;
    saveSettings(settings);
    // Start/stop the ambience loop immediately to match the new preference.
    updateWeatherAmbience();
  });
}

// Validate the location field and reflect status (green check / error / checking).
// Token guards against out-of-order async results when typing quickly.
let locValidateToken = 0;
async function validateLocation(raw) {
  if (!weatherLocStatus) return;
  const value = (raw || '').trim();
  weatherLocStatus.classList.remove('ok', 'err', 'checking');

  if (!value) {
    weatherLocStatus.textContent = '✓ Amsterdam (default)';
    weatherLocStatus.classList.add('ok');
    return;
  }
  const coords = parseCoords(value);
  if (coords) {
    weatherLocStatus.textContent = `✓ ${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)}`;
    weatherLocStatus.classList.add('ok');
    return;
  }
  // City name — geocode to verify it exists.
  const token = ++locValidateToken;
  weatherLocStatus.textContent = '… checking location';
  weatherLocStatus.classList.add('checking');
  try {
    const geo = await geocodeCity(value);
    if (token !== locValidateToken) return; // a newer check superseded us
    weatherLocStatus.classList.remove('checking');
    if (geo) {
      state.resolvedCoords = { query: value, lat: geo.lat, lon: geo.lon, label: geo.label };
      weatherLocStatus.textContent = `✓ ${geo.label}`;
      weatherLocStatus.classList.add('ok');
    } else {
      weatherLocStatus.textContent = '✗ Unknown location';
      weatherLocStatus.classList.add('err');
    }
  } catch (err) {
    if (token !== locValidateToken) return;
    weatherLocStatus.classList.remove('checking');
    weatherLocStatus.textContent = '✗ Could not check location';
    weatherLocStatus.classList.add('err');
  }
}

if (weatherLocationInput) {
  // Live validation as the user types (debounced).
  let locTypeHandle = null;
  weatherLocationInput.addEventListener('input', () => {
    if (locTypeHandle) clearTimeout(locTypeHandle);
    locTypeHandle = setTimeout(() => validateLocation(weatherLocationInput.value), 450);
  });
  weatherLocationInput.addEventListener('change', () => {
    settings.weatherLocation = weatherLocationInput.value.trim();
    state.resolvedCoords = null; // force re-resolve for the new value
    saveSettings(settings);
    validateLocation(settings.weatherLocation);
    if (settings.weatherEnabled) {
      stopWeather();
      startWeather();
    }
  });
}

if (darkModeToggle) {
  darkModeToggle.addEventListener('change', () => {
    settings.darkMode = darkModeToggle.checked;
    saveSettings(settings);
    // Re-apply current weather so palette/stars/moon update immediately.
    if (state.weather) {
      applyWeather(state.weather);
    } else {
      setNightMode(settings.darkMode);
    }
  });
}

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

if (triggerRsiBtn) {
  triggerRsiBtn.addEventListener('click', () => {
    closeSettings();
    const h = setTimeout(() => { state.rsiActive = false; triggerRsiBreak(); }, 80);
    state.rsiHandles.push(h);
  });
}

if (triggerRainBtn) {
  triggerRainBtn.addEventListener('click', () => {
    closeSettings();
    setTimeout(runRainShower, 80);
  });
}

if (triggerTeaBtn) {
  triggerTeaBtn.addEventListener('click', () => {
    closeSettings();
    setTimeout(() => {
      // Bypass the running-phase guard so the scene is previewable while idle.
      cancelTeaTime();
      if (!speechBubbleTea) return;
      speechBubbleTea.classList.add('show');
      if (settings.effects) sfx.pipe();
      state.teaTimeHideHandle = setTimeout(() => {
        speechBubbleTea.classList.remove('show');
      }, TEA_TIME_DURATION_MS);
    }, 80);
  });
}

if (triggerHydrateBtn) {
  triggerHydrateBtn.addEventListener('click', () => {
    closeSettings();
    setTimeout(() => {
      cancelHydrate();
      if (!speechBubbleHydrate) return;
      speechBubbleHydrate.classList.add('show');
      if (settings.effects) sfx.gulp();
      state.hydrateHideHandle = setTimeout(() => {
        speechBubbleHydrate.classList.remove('show');
      }, HYDRATE_DURATION_MS);
    }, 80);
  });
}

if (triggerPipeBtn) {
  triggerPipeBtn.addEventListener('click', () => {
    closeSettings();
    setTimeout(() => {
      cancelPipes();
      const character = PIPE_CHARACTERS[Math.floor(Math.random() * PIPE_CHARACTERS.length)];
      const text = character.texts[Math.floor(Math.random() * character.texts.length)];
      const pipe = Math.random() < 0.5 ? 'left' : 'right';
      runPipeVisit({ pipe, character, text });
    }, 80);
  });
}

if (triggerPlaneBtn) {
  triggerPlaneBtn.addEventListener('click', () => {
    closeSettings();
    setTimeout(() => {
      cancelPlane();
      // Cycle through the available banner messages on repeated manual triggers.
      runPlaneFlight(state._planeDevIndex = ((state._planeDevIndex || 0) + 1) % PLANE_BANNERS.length);
    }, 80);
  });
}

if (triggerFinishBtn) {
  triggerFinishBtn.addEventListener('click', () => {
    closeSettings();
    setTimeout(() => {
      // Re-firing finish() while the alarm is already looping would jump
      // currentTime back to 0 mid-jingle (stutter). Bail out.
      if (state.phase === 'finished') return;
      // If idle, populate session state silently so finish() has something to wind down.
      if (state.phase === 'idle' || state.phase === 'deploying') {
        if (state.phase === 'deploying') exitDeployState();
        startTimer({ silent: true });
      }
      finish();
    }, 80);
  });
}

if (fastTopiToggle) {
  fastTopiToggle.addEventListener('change', () => {
    settings.fastTopi = fastTopiToggle.checked;
    saveSettings(settings);
  });
}

// Dev weather triggers — force fake weather objects for visual testing
function devWeather(fakeWeather) {
  closeSettings();
  setTimeout(() => applyWeather(fakeWeather), 80);
}

const weatherSunnyHotBtn  = $('weatherSunnyHotBtn');
const weatherHeatwaveBtn  = $('weatherHeatwaveBtn');
const weatherRainBtn2     = $('weatherRainBtn');
const weatherStormBtn     = $('weatherStormBtn');
const weatherNightBtn     = $('weatherNightBtn');
const weatherWindyBtn     = $('weatherWindyBtn');
const weatherColdBtn      = $('weatherColdBtn');
const weatherClearBtn     = $('weatherClearBtn');

if (weatherSunnyHotBtn) weatherSunnyHotBtn.addEventListener('click', () =>
  devWeather({ tempC: 28, code: 0, windKmh: 10, isDay: true,  condition: 'clear',  precipitation: 0 }));
if (weatherHeatwaveBtn) weatherHeatwaveBtn.addEventListener('click', () =>
  devWeather({ tempC: 35, code: 0, windKmh: 6,  isDay: true,  condition: 'clear',  precipitation: 0 }));
if (weatherRainBtn2)    weatherRainBtn2.addEventListener('click',    () =>
  devWeather({ tempC: 14, code: 61, windKmh: 25, isDay: true,  condition: 'rain',   precipitation: 2.5 }));
if (weatherStormBtn)    weatherStormBtn.addEventListener('click',    () =>
  devWeather({ tempC: 17, code: 95, windKmh: 45, isDay: true,  condition: 'thunder', precipitation: 5 }));
if (weatherNightBtn)    weatherNightBtn.addEventListener('click',    () =>
  devWeather({ tempC: 18, code: 0, windKmh: 8,  isDay: false, condition: 'clear',  precipitation: 0 }));
if (weatherWindyBtn)    weatherWindyBtn.addEventListener('click',    () =>
  devWeather({ tempC: 16, code: 2, windKmh: 55, isDay: true,  condition: 'cloudy', precipitation: 0 }));
if (weatherColdBtn)     weatherColdBtn.addEventListener('click',     () =>
  devWeather({ tempC: 1,  code: 2, windKmh: 12, isDay: true,  condition: 'cloudy', precipitation: 0 }));
if (weatherClearBtn)    weatherClearBtn.addEventListener('click',    () => {
  closeSettings();
  setTimeout(() => clearWeather(), 80);
});

settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsDialog.addEventListener('close', () => {
  if (state.phase === 'idle') renderIdle();
});

// ---------- Clock mode + time picker ----------
// Default to clock mode: the Start button opens the time picker rather than
// starting an immediate countdown.
let clockMode = true;
let tpHour = 14;
let tpMin = 0;

function updateStartLabel() {
  const inner = startBtn.querySelector('.start-btn-inner') || startBtn;
  inner.textContent = clockMode ? 'SET NEW TIME' : 'START SYNC';
}

if (clockBtn) clockBtn.setAttribute('aria-pressed', clockMode ? 'true' : 'false');
updateStartLabel();

if (clockBtn) {
  clockBtn.addEventListener('click', () => {
    clockMode = !clockMode;
    clockBtn.setAttribute('aria-pressed', clockMode ? 'true' : 'false');
    updateStartLabel();
    if (settings.effects) sfx.click();
  });
}

function openTimePicker() {
  const now = new Date();
  const m = Math.ceil((now.getMinutes() + 5) / 5) * 5;
  tpHour = (now.getHours() + Math.floor(m / 60)) % 24;
  tpMin  = m % 60;
  renderTimePicker();
  if (typeof timePickerDialog.showModal === 'function') {
    timePickerDialog.showModal();
  } else {
    timePickerDialog.setAttribute('open', '');
  }
}

function renderTimePicker() {
  tpHourDisplay.textContent = String(tpHour).padStart(2, '0');
  tpMinDisplay.textContent  = String(tpMin).padStart(2, '0');
}

tpStepperBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const [field, stepStr] = btn.dataset.tpStep.split(':');
    const step = Number(stepStr);
    if (field === 'hour') tpHour = (tpHour + step + 24) % 24;
    else                  tpMin  = (tpMin  + step + 60) % 60;
    renderTimePicker();
    if (settings.effects) sfx.click();
  });
});

if (tpOkBtn) {
  tpOkBtn.addEventListener('click', () => {
    const target = new Date();
    target.setHours(tpHour, tpMin, 0, 0);
    if (target.getTime() <= Date.now() + 1000) {
      target.setDate(target.getDate() + 1);
    }
    const endAt = target.getTime();
    const remainingMin = Math.max(1, Math.ceil((endAt - Date.now()) / 60000));
    settings.durationMin = remainingMin;
    clockMode = false;
    clockBtn.setAttribute('aria-pressed', 'false');
    updateStartLabel();
    if (typeof timePickerDialog.close === 'function') timePickerDialog.close();
    timePickerDialog.removeAttribute('open');
    if (settings.effects) sfx.startSync();
    startTimer({ endAt });
  });
}

if (tpCancelBtn) {
  tpCancelBtn.addEventListener('click', () => {
    if (typeof timePickerDialog.close === 'function') timePickerDialog.close();
    timePickerDialog.removeAttribute('open');
  });
}

// ---------- Main button wiring ----------
startBtn.addEventListener('click', () => {
  // Unlock audio on first interaction
  getAudioCtx();
  if (clockMode) {
    openTimePicker();
    return;
  }
  if (settings.effects) sfx.startSync();
  startTimer();
});
pauseBtn.addEventListener('click', pauseToggle);
resetBtn.addEventListener('click', resetTimer);
shareBtn.addEventListener('click', copyShareLink);
dismissFinishBtn.addEventListener('click', hideFinishBanner);
if (teamsBtn) {
  teamsBtn.addEventListener('click', () => {
    if (settings.effects) sfx.click();
    const url = (window.APP_CONFIG && window.APP_CONFIG.teamsMeetingUrl)
      || 'https://teams.microsoft.com/l/meeting/new';
    window.open(url, '_blank', 'noopener');
  });
}
slackBtn.addEventListener('click', sendSlack);
slackShareBtn.addEventListener('click', sendSlackStart);

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
  startTimer({ endAt: shared.endAt, silent: true, fromSharedLink: true });
  // Apply frozen weather snapshot if the host encoded one in the link.
  if (shared.weatherSnapshot) {
    applyWeather(shared.weatherSnapshot);
  }
} else {
  renderIdle();
  // Start live weather if the user had it enabled.
  if (settings.weatherEnabled) {
    startWeather();
  } else if (settings.darkMode) {
    // Dark mode is independent of weather — apply the night sky on its own.
    setNightMode(true);
  }
}
