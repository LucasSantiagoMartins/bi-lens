/*
 * Responsibility: provide reusable text utilities.
 * Contents: normalization, OCR correction, distance, closed lists, and dates.
 * Key points: must not contain BI field or document rules.
 */
export const foldAccents = (s: string) =>
  s.split('').map((c) => c.normalize('NFD')[0]).join(''); // Preserves length so indices stay aligned.
export const matchText = (s: string) => foldAccents(s).toUpperCase();
export const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

const DIGIT_FIX: Record<string, string> = {
  O: '0', Q: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', '(': '1', '[': '1', '|': '1', '!': '1', F: '1',
};
const LETTER_FIX: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z' };

function apply(s: string, map: Record<string, string>) {
  let changed = false;
  const out = s.split('').map((c) => (map[c] ? ((changed = true), map[c]) : c)).join('');
  return { out, changed };
}
export const fixDigits = (s: string) => apply(s, DIGIT_FIX);
export const fixLetters = (s: string) => apply(s, LETTER_FIX);

export function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const MONTHS: Record<string, number> = {
  JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6,
  JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
};
const pad = (n: number) => String(n).padStart(2, '0');
const D = '[0-9OILSBZQF(\\[|!]';
const DATE_RE = new RegExp(`(${D}{1,2})\\s*[\\/\\-.NV]\\s*(${D}{1,2})\\s*[\\/\\-.NV]\\s*(${D}{4})`);

export function parseDate(raw: string): { iso: string; corrected: boolean } | null {
  const m = matchText(raw);
  let d: string, mo: string, y: string;
  let corrected = false;
  let x = m.match(DATE_RE);
  if (x) {
    const f = [x[1], x[2], x[3]].map(fixDigits);
    corrected = f.some((v) => v.changed);
    [d, mo, y] = f.map((v) => v.out);
  } else {
    x = m.match(/(\d{1,2})\s+DE\s+([A-Z]+)\s+DE\s+(\d{4})/);
    if (!x || !MONTHS[x[2]]) return null;
    d = x[1]; mo = String(MONTHS[x[2]]); y = x[3];
  }
  if (!/^\d+$/.test(d + mo + y)) return null;
  const Dn = +d, Mn = +mo, Yn = +y;
  if (Yn < 1900 || Yn > 2100) return null;
  const dt = new Date(Date.UTC(Yn, Mn - 1, Dn));
  if (dt.getUTCFullYear() !== Yn || dt.getUTCMonth() !== Mn - 1 || dt.getUTCDate() !== Dn) return null;
  return { iso: `${Yn}-${pad(Mn)}-${pad(Dn)}`, corrected };
}

export function matchClosed<T extends string>(raw: string, table: Record<string, T>): { value: T; exact: boolean } | null {
  const q = matchText(raw).replace(/\(A\)/g, '').replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return null;
  if (table[q]) return { value: table[q], exact: true };
  let best: string | null = null;
  let bestD = 99;
  for (const k of Object.keys(table)) {
    const dist = levenshtein(q, k);
    if (dist < bestD) { bestD = dist; best = k; }
  }
  if (best && bestD <= 2 && bestD <= Math.floor(best.length / 3)) return { value: table[best], exact: false };
  return null;
}
