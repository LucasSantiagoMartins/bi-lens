/*
 * Responsabilidade: comparar aproximadamente trechos de texto normalizado.
 * Conteúdo: utilitário fuzzy baseado em distância de edição.
 * Pontos importantes: marcadores específicos do BI são definidos noutro módulo.
 */
import { levenshtein } from '../text/normalize';

export function fuzzyContains(haystack: string, needle: string, maxRatio = 0.2): boolean {
  if (haystack.includes(needle)) return true;
  const max = Math.floor(needle.length * maxRatio);
  if (max === 0) return false;
  const n = needle.length;
  for (let i = 0; i + n - max <= haystack.length; i++) {
    // atalho barato: primeiro e último caractere próximos
    const w = haystack.slice(i, i + n);
    if (levenshtein(w, needle) <= max) return true;
  }
  return false;
}
