/**
 * Safe JSON parser and sanitizer.
 *
 * Tasker and mobile automation systems often send JSON payloads containing
 * unescaped control characters (such as literal newlines, tabs, and carriage returns)
 * inside string values. This violates the JSON spec and crashes standard parsers.
 *
 * This utility sanitizes those bad control characters inside string literals
 * before parsing, making the payload valid JSON.
 */

const logger = require('./logger');

/**
 * Escapes unescaped control characters (ASCII 0-31) inside JSON string literals.
 * Leaves control characters and whitespaces outside string literals untouched.
 *
 * @param {string} str - The raw potentially malformed JSON string.
 * @returns {string} - The sanitized JSON string.
 */
function sanitizeJsonString(str) {
  let result = '';
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    // Toggle string literal state on unescaped double quotes
    if (char === '"' && !isEscaped) {
      inString = !inString;
      result += char;
      isEscaped = false;
      continue;
    }

    if (inString) {
      // Track backslash escapes
      if (char === '\\' && !isEscaped) {
        isEscaped = true;
        result += char;
        continue;
      }

      const code = char.charCodeAt(0);
      if (code < 32) {
        // Character is an unescaped control character (ASCII < 32)
        if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          result += '\\r';
        } else if (char === '\t') {
          result += '\\t';
        } else {
          // Fallback to unicode escape for other control chars (e.g. \u0007)
          result += '\\u' + code.toString(16).padStart(4, '0');
        }
      } else {
        result += char;
      }
      isEscaped = false;
    } else {
      result += char;
      isEscaped = false;
    }
  }

  return result;
}

/**
 * Attempts to parse a string as JSON. If it fails, attempts to sanitize
 * control characters and parse again.
 *
 * @param {string} str - The string to parse.
 * @param {string} requestId - Request ID for correlation logging.
 * @returns {object|null} - Parsed JSON object, or null if it cannot be parsed.
 */
function safeParseJson(str, requestId = 'unknown') {
  if (typeof str !== 'string') {
    return str; // Already parsed or not a string
  }

  const trimmed = str.trim();
  if (!trimmed) {
    return null;
  }

  // 1. Attempt standard parse
  try {
    return JSON.parse(trimmed);
  } catch (initialError) {
    logger.warn('Standard JSON.parse failed. Attempting control character sanitisation...', {
      requestId,
      error: initialError.message,
    });

    // 2. Attempt parsing after sanitisation
    try {
      const sanitized = sanitizeJsonString(trimmed);
      const parsed = JSON.parse(sanitized);
      logger.info('JSON parsed successfully after sanitisation.', { requestId });
      return parsed;
    } catch (sanitizedError) {
      logger.error('JSON.parse failed even after sanitisation.', {
        requestId,
        error: sanitizedError.message,
      });
      return null;
    }
  }
}

module.exports = {
  sanitizeJsonString,
  safeParseJson,
};
