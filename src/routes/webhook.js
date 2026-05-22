/**
 * Webhook routes.
 *
 *   POST /webhook        → Receive, validate, sanitize, and forward to Ztake backend.
 *   POST /webhook/debug  → Echo back exactly what was received (for Tasker debugging).
 *   GET  /webhook/test   → Quick reachability check from Tasker or browser.
 *
 * Accepts JSON, plain-text, URL-encoded, and raw binary bodies.
 */

const { Router } = require('express');
const { forwardWebhook } = require('../utils/forwarder');
const authenticate = require('../middleware/authenticate');
const logger = require('../utils/logger');
const { safeParseJson } = require('../utils/jsonParser');

const router = Router();

// ─── POST /webhook ───────────────────────────────────────────────────────────

router.post('/webhook', authenticate, async (req, res, next) => {
  const requestId = req.id;
  const receivedAt = new Date().toISOString();

  try {
    // ── 1. Normalize payload ─────────────────────────────────────────────
    let payload = normalizePayload(req);

    if (payload === null || isEmptyPayload(payload)) {
      logger.warn('Empty or missing payload', { requestId });
      return res.status(400).json({
        success: false,
        error: 'Empty or missing request body.',
        requestId,
      });
    }


    // ── 2. Normalize payload to valid JSON for the Ztake backend ──────────
    //    The upstream backend expects JSON. Tasker may send:
    //    a) Valid JSON → forward as-is
    //    b) Malformed JSON (control chars) → sanitize then forward
    //    c) Raw text / form-data → wrap in a JSON envelope
    const contentType = req.headers['content-type'] || '';
    const payloadStr = typeof payload === 'string' ? payload : null;
    const isJsonLike =
      payloadStr !== null &&
      (contentType.includes('application/json') ||
        payloadStr.trim().startsWith('{') ||
        payloadStr.trim().startsWith('['));

    if (isJsonLike) {
      // Attempt to parse (with control-character sanitisation fallback)
      const parsed = safeParseJson(payloadStr, requestId);
      if (parsed !== null) {
        payload = parsed;
      } else {
        // Could not parse even after sanitisation — wrap raw text in JSON envelope
        logger.warn('JSON parsing failed. Wrapping raw text in JSON envelope.', { requestId });
        payload = {
          raw_message: payloadStr,
          source: 'tasker',
          parse_error: true,
          received_at: receivedAt,
        };
      }
    } else if (typeof payload === 'string') {
      // Plain text payload — wrap in JSON envelope
      logger.info('Plain text payload received. Wrapping in JSON envelope.', { requestId });
      payload = {
        raw_message: payload,
        source: 'tasker',
        content_type: contentType || 'text/plain',
        received_at: receivedAt,
      };
    } else if (typeof payload === 'object' && !Array.isArray(payload)) {
      // URL-encoded form data or other parsed objects — already an object, keep as-is
      // Add source metadata if not present
      if (!payload.source) {
        payload = { ...payload, source: 'tasker' };
      }
    }

    // Ensure we always forward as JSON
    const forwardHeaders = { ...req.headers };
    forwardHeaders['content-type'] = 'application/json';
    // Remove headers that should not be proxied
    delete forwardHeaders['host'];
    delete forwardHeaders['content-length'];
    delete forwardHeaders['transfer-encoding'];

    // ── 3. Forward ───────────────────────────────────────────────────────
    logger.info('Payload accepted – forwarding to upstream', {
      requestId,
      payloadType: typeof payload,
      payloadKeys: typeof payload === 'object' ? Object.keys(payload) : 'string',
    });

    const forwardResult = await forwardWebhook(payload, forwardHeaders, requestId);

    // ── 4. Respond ───────────────────────────────────────────────────────
    const isUpstreamSuccess =
      forwardResult.status >= 200 && forwardResult.status < 300;

    logger.info('Upstream response received', {
      requestId,
      upstreamStatus: forwardResult.status,
      upstreamSuccess: isUpstreamSuccess,
      attempt: forwardResult.attempt,
    });

    return res.status(isUpstreamSuccess ? 200 : 502).json({
      success: isUpstreamSuccess,
      forwarded: true,
      requestId,
      receivedAt,
      upstream: {
        status: forwardResult.status,
        statusText: forwardResult.statusText,
        data: forwardResult.data,
        attempt: forwardResult.attempt,
      },
    });
  } catch (error) {
    // Forwarding failed after all retries.
    logger.error('Forwarding failed after all retries', {
      requestId,
      message: error.message,
    });

    return res.status(502).json({
      success: false,
      forwarded: false,
      error: 'Failed to forward webhook after retries.',
      detail: error.message,
      requestId,
      receivedAt,
    });
  }
});

// ─── POST /webhook/debug ─────────────────────────────────────────────────────
// Echo endpoint – returns exactly what the server received.
// Use this from Tasker to verify payloads are arriving correctly.

router.post('/webhook/debug', (req, res) => {
  const payload = normalizePayload(req);
  const requestId = req.id;

  logger.info('Debug echo request', {
    requestId,
    contentType: req.headers['content-type'] || 'none',
    bodyType: typeof payload,
    bodyLength: typeof payload === 'string' ? payload.length : JSON.stringify(payload || '').length,
  });

  return res.status(200).json({
    success: true,
    echo: true,
    requestId,
    timestamp: new Date().toISOString(),
    received: {
      method: req.method,
      contentType: req.headers['content-type'] || 'none',
      userAgent: req.headers['user-agent'] || 'none',
      ip: req.ip || req.socket.remoteAddress,
      bodyType: typeof payload,
      bodyIsBuffer: Buffer.isBuffer(req.body),
      bodyIsEmpty: isEmptyPayload(payload),
      body: payload,
    },
    headers: req.headers,
  });
});

// ─── GET /webhook/debug ──────────────────────────────────────────────────────
// Also accept GET for easy browser / Tasker GET-mode testing.

router.get('/webhook/debug', (req, res) => {
  return res.status(200).json({
    success: true,
    echo: true,
    message: 'Debug endpoint is reachable. Send a POST to /webhook/debug to echo your payload.',
    timestamp: new Date().toISOString(),
    ip: req.ip || req.socket.remoteAddress,
    query: req.query,
    headers: req.headers,
  });
});

// ─── GET /webhook/test ───────────────────────────────────────────────────────
// Quick reachability check that Tasker can hit with a simple GET.

router.get('/webhook/test', (_req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Webhook endpoint is reachable.',
    timestamp: new Date().toISOString(),
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize the request body into a usable format.
 * - Buffers (from express.raw) → converted to UTF-8 string.
 * - Strings → returned as-is.
 * - Objects (from express.urlencoded) → returned as-is.
 * - Undefined / null → returned as null.
 */
function normalizePayload(req) {
  const body = req.body;

  if (body === undefined || body === null) return null;

  // express.raw() produces a Buffer — convert to string
  if (Buffer.isBuffer(body)) {
    const str = body.toString('utf-8').trim();
    return str.length > 0 ? str : null;
  }

  return body;
}

/**
 * Check whether a parsed body is "empty".
 */
function isEmptyPayload(body) {
  if (body === null || body === undefined) return true;
  if (typeof body === 'string') return body.trim().length === 0;
  if (Buffer.isBuffer(body)) return body.length === 0;
  if (typeof body === 'object') return Object.keys(body).length === 0;
  return false;
}

module.exports = router;
