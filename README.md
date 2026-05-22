# Ztake Webhook Proxy

Production-ready webhook proxy that receives incoming payloads (from Tasker, mobile notification automations, payment sources, etc.), logs them, and forwards them to the Ztake backend on Vercel.

## Architecture

```
Client / Tasker / Payment Source
        │
        ▼
 ┌──────────────────────────┐
 │  ztake-webhook-proxy     │  ← Railway
 │  POST /webhook           │
 │  • validate payload      │
 │  • log request           │
 │  • retry on failure      │
 └──────────┬───────────────┘
            │  axios POST
            ▼
 ┌──────────────────────────┐
 │  ztake.in backend        │  ← Vercel
 │  /api/webhooks/bank      │
 └──────────────────────────┘
```

## Project Structure

```
ztake-webhook-proxy/
├── src/
│   ├── server.js                 # Entry point
│   ├── config.js                 # Centralised env config
│   ├── middleware/
│   │   ├── requestMiddleware.js  # ID, timer, logger
│   │   ├── errorHandler.js       # Global error handler
│   │   └── authenticate.js       # Auth placeholder
│   ├── routes/
│   │   ├── health.js             # GET / and GET /health
│   │   └── webhook.js            # POST /webhook
│   └── utils/
│       ├── logger.js             # Structured logging
│       └── forwarder.js          # Axios + retry logic
├── .env.example
├── .gitignore
├── package.json
├── railway.json
└── README.md
```

## Quick Start (Local)

```bash
# 1. Clone
git clone https://github.com/ztakefintech/ztake-wbk.git
cd ztake-wbk

# 2. Install
npm install

# 3. Configure
cp .env.example .env          # edit if needed

# 4. Run
npm start                     # production
npm run dev                   # development (auto-restart on save)
```

The server starts at **http://localhost:3000**.

---

## API Endpoints

| Method | Path       | Description                    |
| ------ | ---------- | ------------------------------ |
| GET    | `/`        | Liveness probe (plain text)    |
| GET    | `/health`  | Detailed health JSON           |
| POST   | `/webhook` | Receive & forward webhook      |

---

## Environment Variables

| Variable          | Default                                      | Description                        |
| ----------------- | -------------------------------------------- | ---------------------------------- |
| `PORT`            | `3000`                                       | Server listen port                 |
| `FORWARD_URL`     | `https://www.ztake.in/api/webhooks/bank`     | Upstream forwarding target         |
| `NODE_ENV`        | `development`                                | Environment label                  |
| `REQUEST_TIMEOUT` | `10000`                                      | Axios timeout (ms)                 |
| `MAX_RETRIES`     | `3`                                          | Retry attempts on transient errors |

---

## Testing with curl

### Health Check

```bash
curl http://localhost:3000/
# → Ztake Webhook Proxy Running

curl http://localhost:3000/health
# → { "status": "healthy", "uptime": "0s", ... }
```

### JSON Payload

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "TXN123456",
    "amount": 499.00,
    "currency": "INR",
    "status": "success",
    "sender": "HDFC",
    "message": "Rs.499.00 credited to your account",
    "timestamp": "2026-05-22T21:45:00+05:30"
  }'
```

### Plain-Text Payload (Tasker-style)

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: text/plain" \
  -d 'Rs.499.00 credited to a/c XX1234 by UPI ref 412345678901'
```

### URL-Encoded Form

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'amount=499&sender=HDFC&ref=TXN123456'
```

### Empty Body (should return 400)

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Postman Testing

1. **Import** — Create a new collection called **Ztake Webhook Proxy**.
2. **Environment** — Set variable `base_url` = `http://localhost:3000`.
3. **Requests**:

| Request Name       | Method | URL                        | Body Type         | Body                                                                                                |
| ------------------ | ------ | -------------------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| Health Check       | GET    | `{{base_url}}/health`      | —                 | —                                                                                                   |
| Webhook - JSON     | POST   | `{{base_url}}/webhook`     | raw / JSON        | `{"transaction_id":"TXN123","amount":499,"currency":"INR","status":"success"}`                       |
| Webhook - Text     | POST   | `{{base_url}}/webhook`     | raw / Text        | `Rs.499.00 credited to a/c XX1234`                                                                  |
| Webhook - Form     | POST   | `{{base_url}}/webhook`     | x-www-form-encoded| `amount=499&sender=HDFC`                                                                            |
| Webhook - Empty    | POST   | `{{base_url}}/webhook`     | raw / JSON        | `{}`                                                                                                |

---

## Sample Webhook Payloads

### UPI Payment Notification

```json
{
  "source": "tasker",
  "type": "upi_credit",
  "transaction_id": "TXN789012",
  "amount": 1200.00,
  "currency": "INR",
  "status": "success",
  "sender_name": "John Doe",
  "sender_upi": "john@okicici",
  "receiver_upi": "ztake@ybl",
  "bank": "ICICI",
  "message": "Rs.1200.00 credited to your account ending 1234",
  "timestamp": "2026-05-22T21:30:00+05:30"
}
```

### Bank SMS Notification

```json
{
  "source": "sms_parser",
  "type": "bank_sms",
  "raw_message": "INR 2,500.00 credited to A/c XX5678 on 22-05-26 by NEFT Ref No TXN345678.",
  "parsed": {
    "amount": 2500.00,
    "account_suffix": "5678",
    "method": "NEFT",
    "reference": "TXN345678",
    "date": "2026-05-22"
  }
}
```

### Generic Tasker Payload

```json
{
  "source": "tasker",
  "event": "notification_intercept",
  "app_package": "com.google.android.apps.nbu.paisa.user",
  "title": "Payment received",
  "body": "You received ₹750 from Karthik via UPI",
  "device_id": "pixel-7a",
  "captured_at": "2026-05-22T21:40:00+05:30"
}
```

---

## Railway Deployment

### Prerequisites

- [Railway CLI](https://docs.railway.app/guides/cli) installed (`npm i -g @railway/cli`)
- A Railway account

### Steps

```bash
# 1. Login
railway login

# 2. Initialise (from project root)
railway init
#    → select "Empty Project"

# 3. Link to the service (or create one)
railway link

# 4. Set environment variables
railway variables set PORT=3000
railway variables set FORWARD_URL=https://www.ztake.in/api/webhooks/bank
railway variables set NODE_ENV=production
railway variables set REQUEST_TIMEOUT=10000
railway variables set MAX_RETRIES=3

# 5. Deploy
railway up
```

Railway will auto-detect Node.js via `package.json`, run `npm install`, and execute `npm start`.

### Verify

```bash
# Replace with your Railway URL
curl https://your-project.up.railway.app/health
```

---

## GitHub Upload

```bash
# Initialise repo
git init
git add .
git commit -m "feat: initial ztake-webhook-proxy"

# Push to GitHub
git remote add origin https://github.com/ztakefintech/ztake-wbk.git
git branch -M main
git push -u origin main
```

### Connect Railway to GitHub (auto-deploy on push)

1. Go to your Railway project dashboard.
2. Click **Settings → Source**.
3. Connect your GitHub repo.
4. Set the **root directory** to `/` (default).
5. Every push to `main` will trigger a new deployment.

---

## Custom Domain Setup — `webhook.ztake.in`

### 1. In Railway

1. Open your project → **Settings → Networking → Custom Domain**.
2. Enter `webhook.ztake.in` and click **Add**.
3. Railway will show a **CNAME target** (e.g. `your-project.up.railway.app`).

### 2. DNS Configuration

In your DNS provider (Cloudflare, Route 53, Namecheap, etc.), add:

| Type  | Name      | Value                            | TTL  |
| ----- | --------- | -------------------------------- | ---- |
| CNAME | `webhook` | `your-project.up.railway.app`    | Auto |

> **Cloudflare users**: Set proxy status to **DNS Only** (grey cloud) initially until Railway issues the TLS certificate, then you can enable the orange cloud.

### 3. Verify

```bash
# Wait for DNS propagation (usually 1–5 minutes)
curl https://webhook.ztake.in/health
```

### 4. Update Tasker / Automation Tools

Point your Tasker HTTP Request action to:

```
POST https://webhook.ztake.in/webhook
```

---

## Security — Enabling Later

The proxy ships with auth disabled for quick integration.  To lock it down:

### API Key

1. Set `API_KEY` in Railway variables.
2. Open `src/middleware/authenticate.js` and uncomment the API-key block.
3. Clients must send `X-API-Key: <your-key>` in every request.

### HMAC Signature Verification

1. Set `WEBHOOK_SECRET` in Railway variables.
2. Implement `verifySignature()` in the auth middleware.
3. Clients must send `X-Webhook-Signature: <hmac>` computed over the raw body.

---

## License

MIT
