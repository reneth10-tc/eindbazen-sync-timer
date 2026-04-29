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
- `deploying`: after the finish banner is dismissed — types a two-line deploy message into the IDE with a blinking caret, and runs coin showers from the cloud elements until the next session starts

The timer ticks on a **250ms interval** (not 1000ms) and uses `Math.ceil()` for display rounding. Display shows minutes when `> 60s` remaining, switches to seconds otherwise. The `timerDisplay.dataset.phase` drives background colors: `idle | running | seconds | last10 | finished`.

**Token joke** fires 5 minutes into any session: freezes the IDE typing animation and shows an error state for 3 minutes, then auto-recovers.

**RSI break** overlays a progress bar in the IDE at random points (10 scheduled per session, within the non-sleeping window); each break lasts 60 seconds.

**Rain showers** (2–5 per session): drops blue `<div class="raindrop">` elements into `#rainContainer` at random intervals throughout the session.

**Topi cameos**: a CSS chameleon (`.topi`) walks in from the left, climbs on the laptop for 5 s (triggering a `has-bug` / `angry` state on the endboss), then exits right. Happens 5 times per session at evenly-spaced random offsets. Scheduling uses a deterministic PRNG (`mulberry32`) seeded from `Math.floor(endAt / 1000)` — shared-link viewers see topi at the same wall-clock moments.

Settings (`durationMin`, `effects`, `alarm`, `roundStart`, `slackMode`, `devMode`, `fastTopi`) are persisted to `localStorage` under key `eindbazen.settings`. Duration range: 30–240 min in 30-min steps. `roundStart` (default on) pads the countdown so `endAt` lands on the next 5-minute clock boundary — bypassed when `startTimer` is called with an explicit `endAt` (shared-link or time-picker flow).

`slackMode` controls when the Slack proxy is called: `'off'` never calls it; `'manual'` shows a Send button in the finish banner; `'auto'` calls it automatically at finish without user interaction.

### Clock mode / time picker

The clock button (`#clockBtn`, top-right) toggles `clockMode`. In clock mode the Start button opens a time-picker dialog (`#timePickerDialog`) instead of starting immediately. Confirming a time sets `endAt` to that wall-clock moment and calls `startTimer({ endAt })`, bypassing `roundStart`.

### Dev mode

A hidden section in Settings (toggle `devMode`) reveals manual triggers for topi, RSI break, rain, and finish. `fastTopi` compresses all 5 topi visits into the first 60 seconds of a session for quick visual testing.

### Shareable session links

The share button encodes `{ endAt, durationMin }` into the URL hash as `#e=<timestamp>&d=<minutes>`. Because the timer runs off an absolute `endAt` timestamp, any browser opening the link independently counts down to the same moment with no backend. The share button is hidden while paused (endAt is stale).

### Keyboard shortcuts

- `Space` / `Enter` — Start (idle) or Pause/Resume (running/paused)
- `Esc` — Dismiss finish banner

### Slack proxy (`netlify/functions/slack.js`)

The browser POSTs to `/.netlify/functions/slack` — never directly to Slack — so the webhook URL stays server-side. The function reads `SLACK_WEBHOOK_URL` from the environment and proxies the request. Written in **Netlify Functions v2 ESM** format (`export default async (req) => …`) — not the older v1 `handler` export style.

### Pure CSS pixel art (`index.html` + `styles.css`)

The Endboss and Topi the chameleon are built entirely from styled `<div>` elements — no image assets. Most sounds are synthesized at runtime via Web Audio API square/sawtooth oscillators. The finish alarm (`assets/sounds/level-complete.mp3`) and start sound (`assets/sounds/sync-start.mp3`) are real MP3 files — to swap them, replace the files or update the `new Audio(...)` paths at the top of `app.js`.

### Background tab resilience

Browsers throttle `setInterval` in hidden tabs. A `visibilitychange` listener calls `tick()` immediately on tab focus and resets the interval, preventing the finish event from being delayed when the tab regains visibility.
