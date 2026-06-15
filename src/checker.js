/**
 * @file checker.js
 * @description Compares two parsed .env Maps and categorizes each key.
 * @module checker
 */

/**
 * @typedef {Object} CheckResults
 * @property {Array<{key: string, exampleLine: number}>} missing - In example but not in env
 * @property {Array<{key: string, envLine: number}>}     extra   - In env but not in example
 * @property {Array<{key: string, envLine: number}>}     empty   - In both but no value in env
 * @property {Array<{key: string}>}                      ok      - In both with a value
 */

/**
 * Compares a .env Map against a .env.example Map and returns categorized results.
 *
 * @param  {Map} envEntries     - Parsed entries from the .env file
 * @param  {Map} exampleEntries - Parsed entries from the .env.example file
 * @returns {CheckResults}
 */
export function check(envEntries, exampleEntries) {
  const results = { missing: [], extra: [], empty: [], ok: [] };

  for (const [key, meta] of exampleEntries) {
    if (!envEntries.has(key)) {
      results.missing.push({ key, exampleLine: meta.line });
    } else {
      const envMeta = envEntries.get(key);
      envMeta.hasValue
        ? results.ok.push({ key })
        : results.empty.push({ key, envLine: envMeta.line });
    }
  }

  for (const [key, meta] of envEntries) {
    if (!exampleEntries.has(key)) {
      results.extra.push({ key, envLine: meta.line });
    }
  }

  return results;
}
