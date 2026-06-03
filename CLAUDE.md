# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# First-time setup (one-off)
npm install -g netlify-cli
netlify login   # browser OAuth
netlify init    # link directory to a Netlify site

# Local development (serves app + Netlify Functions at http://localhost:8888)
netlify dev

# Deploy to production
netlify deploy --prod
```

No build step — static files are served directly. No test suite exists.

For Slack integration, set `SLACK_WEBHOOK_URL` in Netlify → Site settings → Environment variables, then redeploy. The function stubs gracefully (returns `{ok: true, stubbed: true}`) when the env var is absent.

## Architecture

This is a single-page vanilla JS app with one Netlify serverless function. No frameworks, no bundler.

### State machine (`app.js`)

All UI is driven by two parallel state objects:

**`state.phase`** (timer logic): `idle → running → paused → finished → deploying`

**`endboss.dataset.state`** (CSS-driven visuals): `idle → working → tired → sleeping → defeated → deploying`
- `working`: start of session
- `tired`: at 50% elapsed (`state.halfwayFired`)
- `sleeping`: at 10 min remaining — IDE typing stops here
- `stressed` CSS class: added at ≤ 10 seconds remaining
- `defeated`: at 0
- `deploying`: after the finish banner is dismissed — types a two-line deploy message into the IDE with a blinking caret, and runs coin showers from the cloud elements until the next session starts. A **Teams meeting button** (`#teamsBtn`) also appears in this state and is hidden again when the next session starts (`startTimer`/`resetTimer`). Its link is read from `window.APP_CONFIG.teamsMeetingUrl` (see `config.js`), falling back to a generic "new meeting" URL.

The timer ticks on a **250ms interval** (not 1000ms) and uses `Math.ceil()` for display rounding. Display shows minutes when `> 60s` remaining, switches to seconds otherwise. The `timerDisplay.dataset.phase` drives background colors: `idle | running | seconds | last10 | finished`.

**Token joke** fires 5 minutes into any session: freezes the IDE typing animation and shows an error state for 3 minutes, then auto-recovers.

**RSI break** overlays a progress bar in the IDE at random points (10 scheduled per session, within the non-sleeping window); each break lasts 60 seconds.

**Tea time** fires at exactly 5 minutes before `endAt`: shows a speech bubble (`.speech-bubble--tea`) on the endboss for 60 seconds and plays `pipe.mp3` once. Shared-link viewers who join mid-tea-time see only the remaining slice.

**Hydration nudge** fires at halfway (same trigger as the `tired` state): shows `.speech-bubble--hydrate` for 8 seconds and plays `water.mp3`.

**Rain showers** (2–5 per session): drops blue `<div class="raindrop">` elements into `#rainContainer` at random intervals throughout the session.

**Finish celebration** (`rainCoins`): the finish banner drops ~50 spinning gold coins plus ~70 colourful swaying confetti pieces (`.confetti-piece`, some `--ribbon`) into `#confetti`. `showFinishBanner` also populates an arcade-style score popup (`#finishScore`) — "STAGE CLEAR!" plus an XP/focus-minutes line derived from `state.totalMs` — that pops in with the `.pop` animation.

**Topi cameos**: a CSS chameleon (`.topi`) walks in from the left, climbs on the laptop for 5 s (triggering a `has-bug` / `angry` state on the endboss), then exits right. Happens 5 times per session at evenly-spaced random offsets. Scheduling uses a deterministic PRNG (`mulberry32`) seeded from `Math.floor(endAt / 1000)` — shared-link viewers see topi at the same wall-clock moments.

**Pipe character cameos**: Mario-style pipes (`#pipeLeft`, `#pipeRight`) flanking the scene pop up named characters (Frank/QA/Lars/Jarno/Rene/Marlou/Tom/Peter/Silke/Emil) with a speech bubble. `PIPE_VISIT_COUNT` (8) visits per session, also deterministic via `mulberry32` but seeded with `endAt/1000 + 1` so the schedule doesn't sync to topi. Each character's appearance (hair, glasses, brows, mouth, shirt color) is driven by the `data-char` attribute on `.pipe-character`, and their speech text lives in the `PIPE_CHARACTERS` array in `app.js`. A `state.pipeInFlight` flag guarantees only one cameo at a time — overlapping schedules silently drop.

Settings (`durationMin`, `effects`, `alarm`, `pipeSounds`, `roundStart`, `slackMode`, `devMode`, `fastTopi`, `weatherEnabled`, `weatherSoundsEnabled`, `weatherLocation`, `darkMode`) are persisted to `localStorage` under key `eindbazen.settings`. Duration range: 30–240 min in 30-min steps. `roundStart` (default on) pads the countdown so `endAt` lands on the next 5-minute clock boundary — bypassed when `startTimer` is called with an explicit `endAt` (shared-link or time-picker flow).

`slackMode` controls when the Slack proxy is called: `'off'` never calls it; `'manual'` shows a Send button in the finish banner; `'auto'` calls it automatically at finish without user interaction.

### Clock mode / time picker

The clock button (`#clockBtn`, top-right) toggles `clockMode`, which **defaults to on** — so the Start button opens a time-picker dialog (`#timePickerDialog`) and reads "SET NEW TIME" out of the box. Confirming a time sets `endAt` to that wall-clock moment and calls `startTimer({ endAt })`, bypassing `roundStart`. Toggling clock mode off makes Start ("START SYNC") begin an immediate duration-based countdown.

### Weather + night mode

When `weatherEnabled` is set, `startWeather` fetches live conditions from Open-Meteo (free, no key) for `weatherLocation` (city name or `lat,lon`; empty = Amsterdam) and `applyWeather` drives the sky palette, cloud drift speed, continuous rain, puddles, blowing leaves, lightning/thunder, and the boss's shades/sweat/shiver accessories. `darkMode` forces the night sky independent of weather. At night (`body.is-night`) the boss, topi, pipe characters, and pipe bodies (`.pipe-rim`/`.pipe-shaft`) get a cooler "moonlit" CSS `filter` so they cohere with the dimmed castle and sky; the laptop is a sibling of `.boss-body`, so the IDE screen stays unfiltered and readable.

**Weather sounds** (`weatherSoundsEnabled`, default on, gated behind `effects`): `updateWeatherAmbience` runs a self-rescheduling loop (`scheduleWeatherAmbience`) that plays a randomly-chosen, condition-matched synthesized SFX at random 5–15 s intervals — rain swells, wind gusts, or clear-day birdsong (`sfx.rainSwell`/`windGust`/`birds`, built on the shared `noiseBurst` helper). Thunder is also gated behind this toggle.

### Dev mode

A hidden section in Settings (toggle `devMode`) reveals manual triggers for topi, RSI break, rain, tea time, hydrate, pipe cameo, and finish, plus weather presets (sunny/heatwave/rain/thunderstorm/night/windy/cold/clear) that call `applyWeather` with mock data. `fastTopi` compresses all 5 topi visits into the first 60 seconds of a session for quick visual testing.

### Configuration (`config.js`)

`config.js` (loaded before `app.js`) sets `window.APP_CONFIG` — currently just `teamsMeetingUrl`, the link opened by the post-finish Teams button. Edit it to point at a real standing-meeting / "Meet now" URL without touching app logic. The app reads it defensively and falls back if the file is missing.

### Shareable session links

The share button encodes `{ endAt, durationMin }` into the URL hash as `#e=<timestamp>&d=<minutes>`. Because the timer runs off an absolute `endAt` timestamp, any browser opening the link independently counts down to the same moment with no backend. The share button is hidden while paused (endAt is stale).

### Keyboard shortcuts

- `Space` / `Enter` — Start (idle) or Pause/Resume (running/paused)
- `Esc` — Dismiss finish banner

### Slack proxy (`netlify/functions/slack.js`)

The browser POSTs to `/.netlify/functions/slack` — never directly to Slack — so the webhook URL stays server-side. The function reads `SLACK_WEBHOOK_URL` from the environment and proxies the request. Written in **Netlify Functions v2 ESM** format (`export default async (req) => …`) — not the older v1 `handler` export style.

### Pure CSS pixel art (`index.html` + `styles.css`)

The Endboss, Topi the chameleon, the pipe characters, and the horizon castle are built entirely from styled `<div>` elements — no image assets. The castle (`.castle`) is decorative-only, sits behind the scene with `pointer-events: none`, and scales down at the `<1100px` and `<640px` breakpoints. Most sounds are synthesized at runtime via Web Audio API: square/sawtooth oscillators (`beep`) for chiptune cues, and filtered white-noise bursts (`noiseBurst`) for thunder and the ambient rain/wind weather sounds. Four real MP3 files live in `assets/sounds/`: `level-complete.mp3` (finish alarm, loops until banner dismissed), `sync-start.mp3` (start fanfare), `pipe.mp3` (tea time), and `water.mp3` (hydrate nudge). To swap them, replace the files or update the `new Audio(...)` paths at the top of `app.js`.

### Background tab resilience

Browsers throttle `setInterval` in hidden tabs. A `visibilitychange` listener calls `tick()` immediately on tab focus and resets the interval, preventing the finish event from being delayed when the tab regains visibility.
