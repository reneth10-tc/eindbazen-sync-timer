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

All UI is driven by a single `state` object. Phases: `idle → running → paused → finished`. The timer ticks on a **250ms interval** (not 1000ms) and uses `Math.ceil()` for display rounding. At 50% elapsed the boss transitions to a "tired" state; at 0 it enters "defeated".

Settings (`durationMin`, `effects`, `alarm`, `slackMode`) are persisted to and loaded from `localStorage`.

### Slack proxy (`netlify/functions/slack.js`)

The browser POSTs to `/.netlify/functions/slack` — never directly to Slack — so the webhook URL stays server-side. The function reads `SLACK_WEBHOOK_URL` from the environment and proxies the request.

### Pure CSS pixel art (`index.html` + `styles.css`)

The Endboss character is built entirely from styled `<div>` elements — no image assets anywhere. All sounds are synthesized at runtime via Web Audio API oscillators; there are no audio files.
