/**
 * CampusVault – Time Utilities
 * Server-side time helpers. Never trust client-supplied timestamps.
 */

/**
 * Get current server time.
 * @returns {Date}
 */
function serverNow() {
  return new Date();
}

/**
 * Check if a date is in the past relative to a reference time.
 * @param {Date|string} date
 * @param {Date}        [reference=new Date()]
 * @returns {boolean}
 */
function isExpired(date, reference = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return reference >= d;
}

/**
 * Create an expiry date from now + duration.
 * @param {number} hours
 * @param {Date}   [from=new Date()]
 * @returns {Date}
 */
function expiresInHours(hours, from = new Date()) {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

module.exports = { serverNow, isExpired, expiresInHours };

