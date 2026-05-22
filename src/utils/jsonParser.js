/**
 * Safe JSON parser and sanitizer.
 *
 * Tasker and mobile automation systems often send JSON payloads containing:
 * 1. Unescaped control characters (such as literal newlines, tabs, and carriage returns)
 * 2. Unescaped double quotes inside string values (e.g. {"message": "Transaction "1234" success"})
 *
 * This utility sanitizes those malformations inside string literals before parsing,
 * making the payload valid JSON and avoiding parser crashes.
 */

const logger = require('./logger');

/**
 * Normalizes content inside a string value by:
 * - Escaping unescaped internal double quotes.
 * - Escaping unescaped control characters (ASCII < 32).
 *
 * @param {string} content - Raw content inside string value.
 * @returns {string} - Sanitized content.
 */
function sanitizeValueContent(content) {
  let result = '';
  let isEscaped = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (char === '\\') {
      isEscaped = !isEscaped;
      result += char;
      continue;
    }

    if (char === '"') {
      if (isEscaped) {
        result += char;
      } else {
        result += '\\"'; // Escape the unescaped internal quote
      }
      isEscaped = false;
      continue;
    }

    const code = char.charCodeAt(0);
    if (code < 32) {
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
  }
  return result;
}

/**
 * Escapes unescaped control characters and internal double quotes inside JSON string literals.
 * Leaves structure, keys, values, and whitespaces outside string literals untouched.
 *
 * @param {string} str - The raw potentially malformed JSON string.
 * @returns {string} - The sanitized JSON string.
 */
function sanitizeJsonString(str) {
  let result = '';
  let i = 0;
  const len = str.length;

  while (i < len) {
    // Look for the start of a string value, which comes after ':'
    if (str[i] === ':') {
      result += ':';
      i++;
      // Skip whitespace
      while (i < len && /\s/.test(str[i])) {
        result += str[i];
        i++;
      }
      // If the value starts with a double quote, it is a string value
      if (i < len && str[i] === '"') {
        result += '"';
        i++;
        // Now we are inside the string value. Scan until we find the true ending quote.
        let valBuffer = '';
        while (i < len) {
          const char = str[i];
          
          if (char === '"') {
            // Check if this is the true end of the string value.
            // It is the end of the string value if the remaining string starts with:
            // 1. optional whitespace, then ',' followed by optional whitespace, then a double quote (start of next key)
            // 2. optional whitespace, then '}'
            // 3. optional whitespace, then ']'
            // 4. optional whitespace, and then end of string
            const remaining = str.slice(i + 1);
            const isEnd = /^\s*,\s*"[^"]+"\s*:/.test(remaining) || 
                          /^\s*}/.test(remaining) || 
                          /^\s*]/.test(remaining) || 
                          /^\s*$/.test(remaining);
            
            if (isEnd) {
              // This is the true end quote. Sanitize and append the accumulated buffer.
              result += sanitizeValueContent(valBuffer) + '"';
              i++;
              break;
            } else {
              // This is an internal quote. Keep it in the buffer as-is.
              valBuffer += '"';
              i++;
            }
          } else {
            valBuffer += char;
            i++;
          }
        }
      }
    } else {
      result += str[i];
      i++;
    }
  }
  return result;
}

/**
 * Attempts to parse a string as JSON. If it fails, attempts to sanitize
 * control characters / unescaped quotes and parse again.
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
    logger.warn('Standard JSON.parse failed. Attempting control character and quote sanitisation...', {
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
