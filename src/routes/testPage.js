/**
 * Browser-based test page.
 *
 *   GET /test → serves an interactive HTML page that lets you:
 *     - Verify the proxy is reachable from any device (phone, laptop, etc.)
 *     - Send test webhook payloads directly from the browser
 *     - See the response in real time
 *
 * This is invaluable for debugging Tasker connectivity issues.
 */

const { Router } = require('express');

const router = Router();

router.get('/test', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(TEST_PAGE_HTML);
});

// ─── HTML ────────────────────────────────────────────────────────────────────

const TEST_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ztake Webhook Proxy — Test Console</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a; color: #e2e8f0;
      min-height: 100vh; padding: 20px;
    }
    h1 { font-size: 1.4rem; color: #38bdf8; margin-bottom: 4px; }
    .subtitle { color: #64748b; font-size: 0.85rem; margin-bottom: 20px; }
    .card {
      background: #1e293b; border: 1px solid #334155;
      border-radius: 12px; padding: 16px; margin-bottom: 16px;
    }
    .card h2 { font-size: 1rem; color: #94a3b8; margin-bottom: 12px; }
    .status-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 0; border-bottom: 1px solid #334155;
    }
    .status-row:last-child { border-bottom: none; }
    .status-label { color: #94a3b8; font-size: 0.85rem; }
    .status-value { font-weight: 600; font-size: 0.85rem; }
    .status-ok { color: #4ade80; }
    .status-err { color: #f87171; }
    .status-wait { color: #fbbf24; }
    label { display: block; color: #94a3b8; font-size: 0.8rem; margin-bottom: 4px; margin-top: 12px; }
    textarea, select {
      width: 100%; background: #0f172a; color: #e2e8f0;
      border: 1px solid #475569; border-radius: 8px; padding: 10px;
      font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.8rem;
      resize: vertical;
    }
    textarea { min-height: 100px; }
    select { height: 40px; }
    button {
      width: 100%; padding: 12px; margin-top: 16px;
      background: #2563eb; color: white; border: none;
      border-radius: 8px; font-size: 0.95rem; font-weight: 600;
      cursor: pointer; transition: background 0.2s;
    }
    button:hover { background: #1d4ed8; }
    button:disabled { background: #475569; cursor: not-allowed; }
    .response-box {
      background: #0f172a; border: 1px solid #334155; border-radius: 8px;
      padding: 12px; margin-top: 12px; font-family: monospace;
      font-size: 0.78rem; white-space: pre-wrap; word-break: break-all;
      max-height: 300px; overflow-y: auto;
    }
    .badge {
      display: inline-block; padding: 2px 8px; border-radius: 4px;
      font-size: 0.7rem; font-weight: 600;
    }
    .badge-green { background: #166534; color: #4ade80; }
    .badge-red { background: #7f1d1d; color: #f87171; }
    .badge-yellow { background: #713f12; color: #fbbf24; }
  </style>
</head>
<body>
  <h1>🔗 Ztake Webhook Proxy</h1>
  <p class="subtitle">Test Console — verify connectivity &amp; send test payloads</p>

  <!-- Connectivity Status -->
  <div class="card" id="status-card">
    <h2>Connectivity Status</h2>
    <div class="status-row">
      <span class="status-label">Health Check</span>
      <span class="status-value status-wait" id="health-status">Checking…</span>
    </div>
    <div class="status-row">
      <span class="status-label">Server Uptime</span>
      <span class="status-value" id="uptime">—</span>
    </div>
    <div class="status-row">
      <span class="status-label">Version</span>
      <span class="status-value" id="version">—</span>
    </div>
    <div class="status-row">
      <span class="status-label">Your IP</span>
      <span class="status-value" id="client-ip">—</span>
    </div>
    <div class="status-row">
      <span class="status-label">Webhook Endpoint</span>
      <span class="status-value status-wait" id="webhook-status">Checking…</span>
    </div>
  </div>

  <!-- Send Test Webhook -->
  <div class="card">
    <h2>Send Test Webhook</h2>

    <label for="endpoint">Endpoint</label>
    <select id="endpoint">
      <option value="/webhook">/webhook (forward to Ztake backend)</option>
      <option value="/webhook/debug" selected>/webhook/debug (echo only — no forwarding)</option>
    </select>

    <label for="content-type">Content-Type</label>
    <select id="content-type">
      <option value="application/json">application/json</option>
      <option value="text/plain">text/plain</option>
      <option value="application/x-www-form-urlencoded">application/x-www-form-urlencoded</option>
    </select>

    <label for="payload">Payload</label>
    <textarea id="payload">{
  "source": "test_page",
  "transaction_id": "TXN_TEST_001",
  "amount": 499,
  "currency": "INR",
  "status": "success",
  "message": "Rs.499.00 credited to your account"
}</textarea>

    <button id="send-btn" onclick="sendWebhook()">Send Webhook</button>

    <label style="margin-top:16px">Response</label>
    <div class="response-box" id="response">Waiting for test…</div>
  </div>

  <script>
    // ── Auto-run connectivity checks on page load ─────────────────────────
    window.addEventListener('DOMContentLoaded', async () => {
      // Health check
      try {
        const r = await fetch('/health');
        const d = await r.json();
        document.getElementById('health-status').textContent = d.status === 'healthy' ? '✅ Healthy' : '⚠️ ' + d.status;
        document.getElementById('health-status').className = 'status-value ' + (d.status === 'healthy' ? 'status-ok' : 'status-err');
        document.getElementById('uptime').textContent = d.uptime;
        document.getElementById('version').textContent = 'v' + d.version;
      } catch (e) {
        document.getElementById('health-status').textContent = '❌ Unreachable';
        document.getElementById('health-status').className = 'status-value status-err';
      }

      // Webhook reachability
      try {
        const r = await fetch('/webhook/test');
        const d = await r.json();
        document.getElementById('webhook-status').textContent = d.success ? '✅ Reachable' : '❌ Error';
        document.getElementById('webhook-status').className = 'status-value ' + (d.success ? 'status-ok' : 'status-err');
      } catch (e) {
        document.getElementById('webhook-status').textContent = '❌ Unreachable';
        document.getElementById('webhook-status').className = 'status-value status-err';
      }

      // Client IP
      try {
        const r = await fetch('/webhook/debug');
        const d = await r.json();
        document.getElementById('client-ip').textContent = d.ip || 'unknown';
      } catch (e) {
        document.getElementById('client-ip').textContent = 'unknown';
      }
    });

    // ── Send webhook ──────────────────────────────────────────────────────
    async function sendWebhook() {
      const btn = document.getElementById('send-btn');
      const resp = document.getElementById('response');
      const endpoint = document.getElementById('endpoint').value;
      const contentType = document.getElementById('content-type').value;
      const payload = document.getElementById('payload').value;

      btn.disabled = true;
      btn.textContent = 'Sending…';
      resp.textContent = 'Sending request to ' + endpoint + '…';

      const start = Date.now();
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: payload,
        });
        const elapsed = Date.now() - start;
        const text = await r.text();

        let pretty;
        try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { pretty = text; }

        resp.textContent = 'HTTP ' + r.status + ' (' + elapsed + 'ms)\\n\\n' + pretty;
      } catch (e) {
        resp.textContent = '❌ Request failed:\\n' + e.message + '\\n\\nThis likely means the server is unreachable from this device.';
      }

      btn.disabled = false;
      btn.textContent = 'Send Webhook';
    }
  </script>
</body>
</html>`;

module.exports = router;
