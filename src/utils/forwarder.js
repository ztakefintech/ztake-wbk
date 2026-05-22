/**
 * Axios-based HTTP forwarder with exponential-backoff retry.
 *
 * Retries only on transient failures (network errors, 5xx, 408, 429).
 * All attempts are logged for observability.
 */

const axios = require('axios');
const config = require('../config');
const logger = require('./logger');

// ─── Status codes that warrant an automatic retry ────────────────────────────
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Sleep helper for retry back-off.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Forward `payload` to the upstream URL.
 *
 * @param {object|string} payload  – The request body (kept as-is).
 * @param {object}        headers  – Selected original request headers.
 * @param {string}        requestId – Correlation ID for logging.
 * @returns {Promise<object>} – The upstream response summary.
 */
async function forwardWebhook(payload, headers = {}, requestId = 'unknown') {
  const forwardHeaders = {
    'content-type': headers['content-type'] || 'application/json',
    'user-agent': 'ZtakeWebhookProxy/1.0',
    'x-forwarded-for': headers['x-forwarded-for'] || '',
    'x-request-id': requestId,
  };

  let lastError = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      logger.info(`Forwarding attempt ${attempt}/${config.maxRetries}`, {
        requestId,
        url: config.forwardUrl,
      });

      const response = await axios({
        method: 'POST',
        url: config.forwardUrl,
        data: payload,
        headers: forwardHeaders,
        timeout: config.requestTimeout,
        // Prevent Axios from parsing the response – we just relay the status.
        validateStatus: () => true,
      });

      const result = {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        attempt,
      };

      // Treat 5xx / 408 / 429 as retryable even though Axios didn't throw.
      if (RETRYABLE_STATUS_CODES.has(response.status)) {
        logger.warn(
          `Upstream returned retryable status ${response.status}`,
          { requestId, attempt },
        );
        lastError = new Error(
          `Upstream responded with ${response.status} ${response.statusText}`,
        );
        lastError.response = result;

        if (attempt < config.maxRetries) {
          const delay = config.retryBaseDelay * attempt;
          logger.info(`Retrying in ${delay}ms…`, { requestId });
          await sleep(delay);
          continue;
        }
        // Final attempt – return whatever we got.
        return result;
      }

      // Non-retryable status (including 2xx, 3xx, 4xx client errors).
      logger.info('Forwarding succeeded', {
        requestId,
        status: response.status,
        attempt,
      });
      return result;
    } catch (error) {
      lastError = error;

      const isNetworkError = !error.response;
      const isTimeout = error.code === 'ECONNABORTED';

      logger.error(`Forwarding attempt ${attempt} failed`, {
        requestId,
        message: error.message,
        code: error.code,
        isTimeout,
        isNetworkError,
      });

      if (attempt < config.maxRetries) {
        const delay = config.retryBaseDelay * attempt;
        logger.info(`Retrying in ${delay}ms…`, { requestId });
        await sleep(delay);
      }
    }
  }

  // All retries exhausted.
  throw lastError;
}

module.exports = { forwardWebhook };
