# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Local development (serves app + Netlify Functions at http://localhost:8888)
netlify dev

# Deploy to production
netlify deploy --prod
```

No build step — static files are served directly. No test suite exists.

For Slack integration, set `SLACK_WEBHOOK_URL` in Netlify site settings and redeploy. The function stubs gracefully (returns `{ok: true, stubbed: true}`) when the env var is absent.

## Architecture

This is a single-page vanilla JS app with one Netlify serverless function. No frameworks, no bundler.

### State machine (`app.js`)

All UI is driven by two parallel state objects:

**`state.phase`** (timer logic): `idle → running → paused → finished`

**`endboss.dataset.state`** (CSS-driven visuals): `idle → working → tired → sleeping → defeated`
- `working`: start of session
- `tired`: at 50% elapsed (`state.halfwayFired`)
- `sleeping`: at 10 min remaining — IDE typing stops here
- `stressed` CSS class: added at ≤ 10 seconds remaining
- `defeated`: at 0

The timer ticks on a **250ms interval** (not 1000ms) and uses `Math.ceil()` for display rounding. Display shows minutes when `> 60s` remaining, switches to seconds otherwise. The `timerDisplay.dataset.phase` drives background colors: `idle | running | seconds | last10 | finished`.

**Token joke** fires 5 minutes into any session: freezes the IDE typing animation and shows an error state for 3 minutes, then auto-recovers.

Settings (`durationMin`, `effects`, `alarm`, `roundStart`, `slackMode`) are persisted to `localStorage` under key `eindbazen.settings`. Duration range: 30–240 min in 30-min steps. `roundStart` (default on) pads the countdown so `endAt` lands on the next 5-minute clock boundary — bypassed when `startTimer` is called with an explicit `endAt` (shared-link flow).

### Shareable session links

The share button encodes `{ endAt, durationMin }` into the URL hash as `#e=<timestamp>&d=<minutes>`. Because the timer runs off an absolute `endAt` timestamp, any browser opening the link independently counts down to the same moment with no backend. The share button is hidden while paused (endAt is stale).

### Keyboard shortcuts

- `Space` / `Enter` — Start (idle) or Pause/Resume (running/paused)
- `Esc` — Dismiss finish banner

### Slack proxy (`netlify/functions/slack.js`)

The browser POSTs to `/.netlify/functions/slack` — never directly to Slack — so the webhook URL stays server-side. The function reads `SLACK_WEBHOOK_URL` from the environment and proxies the request.

### Pure CSS pixel art (`index.html` + `styles.css`)

The Endboss character is built entirely from styled `<div>` elements — no image assets anywhere. All sounds are synthesized at runtime via Web Audio API oscillators; there are no audio files. To swap in real audio, add MP3s to `assets/sounds/` and replace the `sfx` object calls in `app.js`.

### Background tab resilience

Browsers throttle `setInterval` in hidden tabs. A `visibilitychange` listener calls `tick()` immediately on tab focus and resets the interval, preventing the finish event from being delayed when the tab regains visibility.
