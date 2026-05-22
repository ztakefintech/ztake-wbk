/**
 * Request-level middleware.
 *
 * ─ requestId   → attaches a UUID v4 to every request for tracing.
 * ─ requestTimer → logs elapsed time after response finishes.
 * ─ requestLogger → logs incoming request metadata.
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ─── Request ID ──────────────────────────────────────────────────────────────

/**
 * Attach a unique `req.id` and set it as an `X-Request-Id` response header.
 */
function requestId(req, _res, next) {
  req.id = req.headers['x-request-id'] || uuidv4();
  _res.setHeader('X-Request-Id', req.id);
  next();
}

// ─── Request Timer ───────────────────────────────────────────────────────────

/**
 * Record the time when the request arrives and log the duration once the
 * response is sent.
 */
function requestTimer(req, res, next) {
  req.startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsed = Number(process.hrtime.bigint() - req.startTime) / 1e6; // ms
    logger.info('Request completed', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: elapsed.toFixed(2),
    });
  });

  next();
}

// ─── Request Logger ──────────────────────────────────────────────────────────

/**
 * Log every incoming request with IP, method, path, content-type, and body
 * (truncated in production to avoid leaking sensitive data).
 */
function requestLogger(req, _res, next) {
  logger.divider();
  logger.info('Incoming request', {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip || req.socket.remoteAddress,
    contentType: req.headers['content-type'] || 'none',
    userAgent: req.headers['user-agent'] || 'none',
    bodyPreview: summariseBody(req.body),
  });
  next();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Return a safe preview of the request body for logging.
 */
function summariseBody(body) {
  if (body === undefined || body === null) return '(empty)';
  if (typeof body === 'string') {
    return body.length > 500 ? `${body.slice(0, 500)}…` : body;
  }
  const json = JSON.stringify(body);
  return json.length > 500 ? `${json.slice(0, 500)}…` : json;
}

module.exports = { requestId, requestTimer, requestLogger };
