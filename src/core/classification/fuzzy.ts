/*
 * Responsibility: approximately compare normalized text fragments.
 * Contents: fuzzy utility based on edit distance.
 * Key points: BI-specific markers are defined in another module.
 */
import { levenshtein } from "../text/normalize";

export function fuzzyContains(
  haystack: string,
  needle: string,
  maxRatio = 0.2,
): boolean {
  if (haystack.includes(needle)) return true;
  const max = Math.floor(needle.length * maxRatio);
  if (max === 0) return false;
  const n = needle.length;
  for (let i = 0; i + n - max <= haystack.length; i++) {
    // Cheap shortcut: the first and last characters are close.
    const w = haystack.slice(i, i + n);
    if (levenshtein(w, needle) <= max) return true;
  }
  return false;
}
