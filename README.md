# Eindbazen Sync Timer

A Super Mario-themed countdown timer for team **Eindbazen**. Hit the big **START SYNC** button, watch the endboss do his thing, and get a "Check-in time!" chime when the timer hits 0. Optional Slack alert at the end.

## Features

- Big gold "Start sync" button with screen shake + boss roar on click.
- Configurable countdown duration (30–240 min, in 30-min steps; default 90).
- Timer display shows **minutes** until the last minute, then switches to **seconds**.
- Endboss scene (pure CSS pixel art, no external sprites):
  - **Idle** before start → **Working at laptop** → **Tired** at halfway → **Sleeping** in the final 10 min → **Defeated + coin confetti** at finish → **Deploying** (with green log overlay + cloud coin showers) after dismissing the finish banner.
  - In-scene gags running underneath: a Claude-Code-style IDE typing animation, a "token joke" error at the 5-minute mark, periodic RSI-break overlays, hydration nudge at halfway, tea-time speech bubble 5 min before the end, occasional rain showers, Topi the chameleon cameos on the laptop, and Mario-pipe character pop-ups (Frank, QA, Lars, Jarno, Rene, Marlou, Tom, Peter, Silke). A Mario castle sits on the horizon.
- Sound effects & finish alarm — independent on/off toggles in settings.
  - Most sounds synthesized via Web Audio (no IP risk); a few real clips ship in `assets/sounds/` — see [Using real Mario sounds](#using-real-mario-sounds).
- **Clock mode** (🕑 button): pick an exact end-of-day time instead of a duration.
- **Shareable session link** (🔗 button): copies a URL with `endAt` in the hash so teammates open it and count down to the same wall-clock moment — no backend.
- **Dev mode** (in Settings): manual triggers for every scene + a fast-topi schedule for visual testing.
- Slack alert (manual button or auto-send) via Netlify Function proxy. Includes a "Share on Slack" button that posts the shareable link to the channel when a session starts.

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

Most sounds (boss roar, click, start-sync fanfare) are synthesized at runtime via Web Audio square/sawtooth oscillators — no audio files, no IP risk.

Four real audio files ship in `assets/sounds/`:

- `level-complete.mp3` — finish alarm, looped via `alarmAudio.loop` until the user dismisses the finish banner.
- `sync-start.mp3` — start fanfare.
- `pipe.mp3` — tea-time chirp.
- `water.mp3` — hydration nudge gulp.

To swap them out, replace the file or change the path in the matching `new Audio(...)` call at the top of [app.js](app.js). To add more real clips:

1. Drop MP3 files into `assets/sounds/`, e.g. `roar.mp3`, `click.mp3`.
2. In [app.js](app.js), follow the `alarmAudio` pattern: create an `Audio` element at module scope, then call `.play()` from the relevant `sfx` method.

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
├── favicon.svg
├── netlify.toml
├── assets/
│   └── sounds/                  # level-complete.mp3, sync-start.mp3, pipe.mp3, water.mp3
└── netlify/
    └── functions/
        └── slack.js             # POST /.netlify/functions/slack
```
# eindbazen-sync-timer
