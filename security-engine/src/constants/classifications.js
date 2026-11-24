/**
 * CampusVault – Document Classification Levels
 * Ordered from least to most sensitive.
 */

const CLASSIFICATION = Object.freeze({
  PUBLIC: 'public',
  INTERNAL: 'internal',
  CONFIDENTIAL: 'confidential',
  RESTRICTED: 'restricted',
});

/**
 * Sensitivity level (higher = more sensitive).
 */
const CLASSIFICATION_LEVEL = Object.freeze({
  [CLASSIFICATION.PUBLIC]: 10,
  [CLASSIFICATION.INTERNAL]: 20,
  [CLASSIFICATION.CONFIDENTIAL]: 30,
  [CLASSIFICATION.RESTRICTED]: 40,
});

module.exports = { CLASSIFICATION, CLASSIFICATION_LEVEL };

