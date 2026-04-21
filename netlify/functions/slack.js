// POST proxy to a Slack Incoming Webhook.
// Reads SLACK_WEBHOOK_URL from Netlify env vars. If missing, returns
// { ok: true, stubbed: true } so the front-end works before the real
// webhook is configured.

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const message = typeof payload?.message === 'string' ? payload.message.slice(0, 1000) : '';
  if (!message) {
    return new Response(JSON.stringify({ error: 'Missing message' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    console.log('[slack] SLACK_WEBHOOK_URL not set — stub mode. Would have sent:', message);
    return new Response(JSON.stringify({ ok: true, stubbed: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const slackRes = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
    if (!slackRes.ok) {
      const text = await slackRes.text();
      console.error('[slack] webhook error', slackRes.status, text);
      return new Response(JSON.stringify({ error: `Slack ${slackRes.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[slack] fetch failed', err);
    return new Response(JSON.stringify({ error: 'Upstream failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
