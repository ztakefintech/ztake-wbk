/**
 * Centralised configuration.
 *
 * Every tuneable value lives here so the rest of the codebase never
 * reads `process.env` directly.  Defaults are safe for local development;
 * Railway (or any PaaS) only needs to set `PORT` and `FORWARD_URL`.
 */

require('dotenv').config();

const config = Object.freeze({
  /** Port the Express server binds to.  Railway injects this at runtime. */
  port: parseInt(process.env.PORT, 10) || 3000,

  /** Target URL that receives the forwarded webhook payload. */
  forwardUrl:
    process.env.FORWARD_URL || 'https://www.ztake.in/api/webhooks/bank',

  /** Current environment label. */
  nodeEnv: process.env.NODE_ENV || 'development',

  /** Axios request timeout in milliseconds. */
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 10_000,

  /** Maximum retry attempts for transient forwarding errors. */
  maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3,

  /** Base delay (ms) between retries – multiplied by attempt number. */
  retryBaseDelay: 1000,

  /** Whether we are running in production. */
  isProduction: process.env.NODE_ENV === 'production',
});

module.exports = config;
