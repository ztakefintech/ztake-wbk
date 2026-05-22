/**
 * Structured logger utility.
 *
 * Outputs JSON in production for machine parsing (Railway / Datadog / etc.)
 * and human-readable coloured output in development.
 *
 * Every log entry includes an ISO-8601 timestamp automatically.
 */

const config = require('../config');

// ─── Colour helpers (ANSI 256) ───────────────────────────────────────────────
const Colour = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Return an ISO-8601 timestamp string.
 */
function timestamp() {
  return new Date().toISOString();
}

/**
 * Serialise an object for console output.  In production we emit
 * single-line JSON; in development we pretty-print for readability.
 */
function serialise(obj) {
  if (config.isProduction) {
    return JSON.stringify(obj);
  }
  return JSON.stringify(obj, null, 2);
}

// ─── Public API ──────────────────────────────────────────────────────────────

const logger = {
  /**
   * General informational message.
   */
  info(message, data = {}) {
    const entry = { level: 'info', timestamp: timestamp(), message, ...data };
    if (config.isProduction) {
      console.log(serialise(entry));
    } else {
      console.log(
        `${Colour.cyan}[INFO]${Colour.reset}  ${Colour.dim}${entry.timestamp}${Colour.reset}  ${message}`,
        Object.keys(data).length ? `\n${serialise(data)}` : '',
      );
    }
  },

  /**
   * Warning – something unexpected but non-fatal.
   */
  warn(message, data = {}) {
    const entry = { level: 'warn', timestamp: timestamp(), message, ...data };
    if (config.isProduction) {
      console.warn(serialise(entry));
    } else {
      console.warn(
        `${Colour.yellow}[WARN]${Colour.reset}  ${Colour.dim}${entry.timestamp}${Colour.reset}  ${message}`,
        Object.keys(data).length ? `\n${serialise(data)}` : '',
      );
    }
  },

  /**
   * Error – something went wrong.
   */
  error(message, data = {}) {
    const entry = { level: 'error', timestamp: timestamp(), message, ...data };
    if (config.isProduction) {
      console.error(serialise(entry));
    } else {
      console.error(
        `${Colour.red}[ERROR]${Colour.reset} ${Colour.dim}${entry.timestamp}${Colour.reset}  ${message}`,
        Object.keys(data).length ? `\n${serialise(data)}` : '',
      );
    }
  },

  /**
   * Debug – only emitted in development.
   */
  debug(message, data = {}) {
    if (config.isProduction) return;
    console.log(
      `${Colour.magenta}[DEBUG]${Colour.reset} ${Colour.dim}${timestamp()}${Colour.reset}  ${message}`,
      Object.keys(data).length ? `\n${serialise(data)}` : '',
    );
  },

  /**
   * Pretty divider for visual scanning in dev logs.
   */
  divider() {
    if (config.isProduction) return;
    console.log(
      `${Colour.dim}${'─'.repeat(72)}${Colour.reset}`,
    );
  },
};

module.exports = logger;
