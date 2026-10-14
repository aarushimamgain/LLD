/**
 * Splits an identifier like "NearestSpotAllocationStrategy" or "spot_allocator"
 * into normalized tokens: ["nearest", "spot", "allocation", "strategy"].
 * A trailing plural "s" is dropped so "Spots" and "Spot" compare equal.
 * @param {string} name
 * @returns {string[]}
 */
export function tokenize(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((token) => singularize(token.toLowerCase()));
}

function singularize(token) {
  return token.length > 3 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token;
}

/** True when `needle` appears as a contiguous run inside `haystack`. */
export function containsSequence(haystack, needle) {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start++) {
    if (needle.every((token, i) => haystack[start + i] === token)) return true;
  }
  return false;
}
