/**
 * Placeholder authentication middleware.
 *
 * Currently a pass-through (no-op).  When you're ready to lock down the
 * proxy, uncomment the API-key check below and set `API_KEY` in your
 * environment.
 *
 * Keeping the middleware wired into the route stack means enabling auth
 * later is a one-line change — no rewiring needed.
 */

// const config = require('../config');
// const logger = require('../utils/logger');

function authenticate(req, _res, next) {
  // ── Future: API-key gate ───────────────────────────────────────────────
  //
  // const apiKey = req.headers['x-api-key'];
  // if (!apiKey || apiKey !== config.apiKey) {
  //   logger.warn('Unauthorized request blocked', { requestId: req.id });
  //   return res.status(401).json({
  //     success: false,
  //     error: 'Unauthorized – missing or invalid API key.',
  //   });
  // }
  //
  // ── Future: HMAC signature verification ────────────────────────────────
  //
  // const signature = req.headers['x-webhook-signature'];
  // if (!verifySignature(req.body, signature, config.webhookSecret)) {
  //   logger.warn('Invalid signature', { requestId: req.id });
  //   return res.status(403).json({
  //     success: false,
  //     error: 'Forbidden – signature mismatch.',
  //   });
  // }

  next();
}

module.exports = authenticate;
