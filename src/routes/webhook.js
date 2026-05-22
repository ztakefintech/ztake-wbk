/**
 * Webhook route.
 *
 *   POST /webhook
 *
 * Accepts JSON, plain-text, and URL-encoded bodies.
 * Validates the payload, logs it, forwards it to the Ztake backend,
 * and returns a structured success/error response.
 */

const { Router } = require('express');
const { forwardWebhook } = require('../utils/forwarder');
const authenticate = require('../middleware/authenticate');
const logger = require('../utils/logger');

const router = Router();

// ─── POST /webhook ───────────────────────────────────────────────────────────

router.post('/webhook', authenticate, async (req, res, next) => {
  const requestId = req.id;
  const receivedAt = new Date().toISOString();

  try {
    // ── 1. Validate that we have *something* to forward ──────────────────
    const payload = req.body;

    if (payload === undefined || payload === null || isEmptyPayload(payload)) {
      logger.warn('Empty or missing payload', { requestId });
      return res.status(400).json({
        success: false,
        error: 'Empty or missing request body.',
        requestId,
      });
    }

    // ── 2. Forward ───────────────────────────────────────────────────────
    logger.info('Payload accepted – forwarding to upstream', { requestId });

    const forwardResult = await forwardWebhook(payload, req.headers, requestId);

    // ── 3. Respond ───────────────────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Check whether a parsed body is "empty".
 */
function isEmptyPayload(body) {
  if (typeof body === 'string') return body.trim().length === 0;
  if (typeof body === 'object') return Object.keys(body).length === 0;
  return false;
}

module.exports = router;
