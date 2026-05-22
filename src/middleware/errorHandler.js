/**
 * Global error-handling middleware.
 *
 * Express recognises a middleware with four parameters as an error handler.
 * This must be registered *after* all routes.
 */

const logger = require('../utils/logger');

/**
 * Catch-all error handler.
 *
 * Returns a structured JSON response so clients always get a predictable
 * envelope, even on unexpected failures.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;

  logger.error('Unhandled error', {
    requestId: req.id,
    message: err.message,
    stack: err.stack,
    status,
  });

  res.status(status).json({
    success: false,
    error: err.message || 'Internal Server Error',
    requestId: req.id,
  });
}

module.exports = errorHandler;
