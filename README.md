# Eindbazen Sync Timer

A Super Mario-themed countdown timer for team **Eindbazen**. Hit the big **START SYNC** button, watch the endboss do his thing, and get a "Check-in time!" chime when the timer hits 0. Optional Slack alert at the end.

## Features

- Big gold "Start sync" button with screen shake + boss roar on click.
- Configurable countdown duration (30–240 min, in 30-min steps; default 90).
- Timer display shows **minutes** until the last minute, then switches to **seconds**.
- Endboss scene (pure CSS pixel art, no external sprites):
  - **Idle** before start
  - **Working at laptop** during first half
  - **Tired** after halfway
  - **Defeated + coin confetti** at finish
- Sound effects & finish alarm — independent on/off toggles in settings.
  - Currently synthesized chiptune via Web Audio (no IP risk).
  - Swap in real SMB clips later — see [Using real Mario sounds](#using-real-mario-sounds).
- Slack alert (manual button or auto-send) via Netlify Function proxy.

## Local development

```bash
npm install -g netlify-cli
netlify login          # browser flow; sign up if you don't have an account yet
netlify init           # link this dir to a new Netlify site
netlify dev            # http://localhost:8888
```

The app is static HTML/CSS/JS — no build step. `netlify dev` also runs the Slack proxy function at `/.netlify/functions/slack`.

## Deployment

```bash
netlify deploy --prod
```

## Slack setup (do this when you're ready)

1. In your Slack workspace, create an **Incoming Webhook** pointed at the private channel you want to alert. Slack will give you a URL like `https://hooks.slack.com/services/T.../B.../...`.
2. In Netlify → Site settings → Environment variables, add:
   - `SLACK_WEBHOOK_URL` = the webhook URL.
3. Redeploy (`netlify deploy --prod`).
4. In the app's settings menu, set **Slack alert** to `Manual button after finish` or `Auto-send on finish`.

Until `SLACK_WEBHOOK_URL` is set, the Netlify Function runs in **stub mode** — it logs the message and returns `{ok:true, stubbed:true}`, so nothing breaks in the UI.

### Why route through Netlify?

Calling the Slack webhook directly from the browser would expose the URL to anyone who inspects the page. They could then spam your private channel. Routing through the Netlify Function keeps the URL server-side.

## Using real Mario sounds

The default sounds are synthesized (Web Audio square/sawtooth oscillators) so the app ships with no audio files and no IP risk. If you want real SMB clips:

1. Drop MP3 files into `assets/sounds/`, e.g. `roar.mp3`, `alarm.mp3`, `click.mp3`.
2. In [app.js](app.js), swap the `sfx` object from synth calls to `new Audio('assets/sounds/alarm.mp3').play()`.

**Note:** real Nintendo audio is copyrighted. This app is intended for internal team use only. Don't redistribute publicly and keep the deployed URL unlisted where practical.

## Keyboard shortcuts

- `Space` / `Enter` — Start (when idle) or pause/resume (when running)
- `Esc` — Dismiss the finish banner

## File layout

```
.
├── index.html
├── styles.css
├── app.js
├── netlify.toml
└── netlify/
    └── functions/
        └── slack.js   # POST /.netlify/functions/slack
```
