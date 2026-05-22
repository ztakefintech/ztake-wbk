/**
 * ztake-webhook-proxy — Entry point.
 *
 * Boots Express, wires middleware and routes, and starts listening.
 * Handles graceful shutdown on SIGTERM / SIGINT so Railway can drain
 * in-flight requests during deploys.
 */

const express = require('express');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');

// ── Middleware ────────────────────────────────────────────────────────────────
const {
  requestId,
  requestTimer,
  requestLogger,
} = require('./middleware/requestMiddleware');
const errorHandler = require('./middleware/errorHandler');

// ── Routes ───────────────────────────────────────────────────────────────────
const healthRoutes = require('./routes/health');
const webhookRoutes = require('./routes/webhook');

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────

const app = express();

// ── Trust Railway's reverse proxy so req.ip is the real client IP ─────────
app.set('trust proxy', true);

// ── Global middleware (order matters) ─────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.raw({ type: '*/*', limit: '5mb' }));

// ── Request-level middleware ──────────────────────────────────────────────
app.use(requestId);
app.use(requestTimer);
app.use(requestLogger);

// ── Routes ───────────────────────────────────────────────────────────────
app.use(healthRoutes);
app.use(webhookRoutes);

// ── 404 catch-all ────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found.',
  });
});

// ── Error handler (must be last) ─────────────────────────────────────────
app.use(errorHandler);

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

const server = app.listen(config.port, () => {
  logger.divider();
  logger.info('🚀 Ztake Webhook Proxy started', {
    port: config.port,
    environment: config.nodeEnv,
    forwardUrl: config.forwardUrl,
    requestTimeout: `${config.requestTimeout}ms`,
    maxRetries: config.maxRetries,
  });
  logger.divider();
});

// ─────────────────────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Railway sends SIGTERM before stopping a service.  We close the HTTP
 * server so in-flight requests can finish, then exit cleanly.
 */
function gracefulShutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully…`);
  server.close(() => {
    logger.info('All connections drained. Goodbye.');
    process.exit(0);
  });

  // Force exit after 10 s if connections won't close.
  setTimeout(() => {
    logger.warn('Forcing shutdown after timeout.');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Prevent the process from crashing on unhandled rejections.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { message: err.message, stack: err.stack });
  // After logging, exit – the runtime state may be corrupted.
  process.exit(1);
});

module.exports = app; // Exported for testing.
