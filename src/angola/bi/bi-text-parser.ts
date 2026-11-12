import { collapse, fixDigits, fixLetters, matchClosed, matchText, parseDate } from '../../core/text/normalize';
import { buildOcrLines, type OcrWord } from '../../core/ocr/types';
import { BI_NUMBER_RE, ESTADOS_CIVIS, LABELS, PROVINCIAS, SEXOS, type SegKey } from './bi-layout';
import type { BIData, Field, Filiacao, Sexo, Spans } from './types';

const CAP_CORRECTED = 0.75;

function mk<T>(p: Partial<Field<T>> & { raw: string | null }): Field<T> {
  const base = p.baseConfidence ?? 0;
  const corrected = p.corrected ?? false;
  return {
    value: null, valid: false, corrected, baseConfidence: base,
    confidence: corrected ? Math.min(base, CAP_CORRECTED) : base,
    ocrConfidence: null, votes: 1, ...p,
  } as Field<T>;
}
export const emptyField = <T>(): Field<T> => mk<T>({ raw: null, votes: 0 });
const found = <T>(value: T, raw: string, base: number, corrected = false, note?: string) =>
  mk<T>({ value, raw, valid: true, baseConfidence: base, corrected, note });
const invalid = <T>(raw: string, base = 0.3) => mk<T>({ raw, valid: false, baseConfidence: base });

/* ---------- Segmentação por rótulos (com posições) ---------- */
export type Segments = Partial<Record<SegKey, { text: string; start: number; end: number }>>;

export function segment(text: string): Segments {
  const m = matchText(text);
  const hits: { key: SegKey | 'stop'; start: number; end: number }[] = [];
  for (const [key, re] of LABELS) {
    const g = new RegExp(re.source, 'g');
    let x: RegExpExecArray | null;
    while ((x = g.exec(m))) {
      if (x[0].length === 0) { g.lastIndex++; continue; }
      hits.push({ key, start: x.index, end: x.index + x[0].length });
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const clean: typeof hits = [];
  for (const h of hits) if (!clean.length || h.start >= clean[clean.length - 1].end) clean.push(h);

  const out: Segments = {};
  clean.forEach((h, i) => {
    if (h.key === 'stop' || out[h.key]) return;
    const next = clean[i + 1]?.start ?? text.length;
    const slice = text.slice(h.end, next);
    const lead = slice.match(/^[\s:;.\-]+/)?.[0].length ?? 0;
    out[h.key] = { text: collapse(slice.slice(lead)), start: h.end + lead, end: next };
  });
  return out;
}

/* ---------- Número do BI ---------- */
const NUM_RE = /([0-9OILSBZQ]{9})\s?([A-Z0-9]{2})\s?([0-9OILSBZQ]{3})/g;

export function extractNumero(text: string): { field: Field<string>; start: number; end: number } | null {
  const m = matchText(text);
  const re = new RegExp(NUM_RE.source, 'g');
  let x: RegExpExecArray | null;
  while ((x = re.exec(m))) {
    if ((x[1].match(/\d/g) ?? []).length < 6) continue;
    const a = fixDigits(x[1]), b = fixLetters(x[2]), c = fixDigits(x[3]);
    const value = a.out + b.out + c.out;
    if (!BI_NUMBER_RE.test(value)) continue;
    return {
      field: found(value, text.slice(x.index, x.index + x[0].length), 0.97, a.changed || b.changed || c.changed),
      start: x.index, end: x.index + x[0].length,
    };
  }
  return null;
}

/* ---------- Campos ---------- */
const LETTERS = /[^A-Za-zÀ-ÿ\s'\-]/g;

/** O BI imprime nomes em MAIÚSCULAS: uma palavra em minúsculas no meio é quase sempre ruído do OCR. */
function mixedCasePenalty(tokens: string[]): number {
  const t = tokens.filter((w) => w.length >= 2 && !/^e$/.test(w));
  const upper = t.filter((w) => w === w.toUpperCase()).length;
  return upper > 0 && upper < t.length ? 0.25 : 0;
}

export function extractNome(raw?: string): Field<string> {
  if (!raw) return emptyField();
  const stripped = collapse(raw.replace(LETTERS, ' '));
  const words = stripped.split(' ').filter((w) => w.length >= 2 || w.toUpperCase() === 'E');
  const cleaned = words.join(' ');
  if (words.filter((w) => w.length >= 2).length < 2) return invalid(raw);
  const pen = mixedCasePenalty(words);
  return found(cleaned, raw, 0.9 - pen, cleaned !== collapse(raw), pen ? 'maiúsculas/minúsculas misturadas' : undefined);
}

export function extractFiliacao(raw?: string): Field<Filiacao> {
  if (!raw) return emptyField();
  const clean = (s?: string) => {
    const w = collapse((s ?? '').replace(LETTERS, ' ')).split(' ').filter((t) => t.length >= 2);
    return w.length ? w.join(' ') : null;
  };
  // pai "e" mãe  |  pai "E DE" mãe
  const m = / E (?:DE )?/i.exec(' ' + raw + ' ');
  let pai: string | null, mae: string | null;
  if (m) {
    const s = ' ' + raw + ' ';
    pai = clean(s.slice(0, m.index));
    mae = clean(s.slice(m.index + m[0].length));
  } else {
    pai = clean(raw);
    mae = null;
  }
  if (!pai && !mae) return invalid(raw);
  const pen = mixedCasePenalty(((pai ?? '') + ' ' + (mae ?? '')).split(' ').filter(Boolean));
  return found({ pai, mae }, raw, (pai && mae ? 0.85 : 0.6) - pen);
}

export function extractTextoLivre(raw?: string, min = 3): Field<string> {
  if (!raw) return emptyField();
  const v = collapse(raw.replace(/[^\p{L}\p{N}\s.,ºª°\-\/]/gu, ' '));
  return v.length >= min ? found(v, raw, 0.85) : invalid(raw);
}

const closed = <T extends string>(raw: string | undefined, table: Record<string, T>, hardBase = 0.3) => {
  if (!raw) return emptyField<T>();
  const r = matchClosed(raw, table);
  if (!r) return invalid<T>(raw, hardBase);
  return found<T>(r.value, raw, r.exact ? 0.95 : 0.8, !r.exact);
};
export const extractProvincia = (raw?: string) => closed<string>(raw, PROVINCIAS, 0.4);
export const extractEstadoCivil = (raw?: string) => closed<string>(raw, ESTADOS_CIVIS);
export const extractSexo = (raw?: string): Field<Sexo> => closed<Sexo>(raw, SEXOS);

export function extractData(raw?: string): Field<string> {
  if (!raw) return emptyField();
  const d = parseDate(raw);
  return d ? found(d.iso, raw, 0.95, d.corrected) : invalid(raw);
}

export function extractAltura(raw?: string): Field<number> {
  if (!raw) return emptyField();
  const m = matchText(raw);
  const a = m.match(/([0-9OIL])\s*[.,]\s*([0-9OIL]{2})/);
  let value: number | null = null;
  let corrected = false;
  let base = 0.9;
  let note: string | undefined;
  if (a) {
    const i = fixDigits(a[1]), f = fixDigits(a[2]);
    corrected = i.changed || f.changed;
    value = Number(`${i.out}.${f.out}`);
  } else {
    const b = m.match(/\b([12]\d{2})\s*(?:CM)?\b/);
    if (b) { value = Number(b[1]) / 100; base = 0.8; note = 'separador decimal inferido'; }
  }
  if (value === null || Number.isNaN(value) || value < 0.5 || value > 2.5) return invalid(raw);
  return found(value, raw, base, corrected, note);
}

/* ---------- Tudo junto ---------- */
export function extractFields(text: string): { data: BIData; spans: Spans } {
  const spans: Spans = {};
  const num = extractNumero(text);
  const stripped = num ? text.slice(0, num.start) + ' '.repeat(num.end - num.start) + text.slice(num.end) : text;
  if (num) spans.numero = { start: num.start, end: num.end };
  const seg = segment(stripped);
  for (const [k, v] of Object.entries(seg)) spans[k as SegKey] = { start: v.start, end: v.end };
  const t = (k: SegKey) => seg[k]?.text;

  const data: BIData = {
    numero: num?.field ?? emptyField(),
    nome: extractNome(t('nome')),
    filiacao: extractFiliacao(t('filiacao')),
    dataNascimento: extractData(t('dataNascimento')),
    sexo: extractSexo(t('sexo')),
    estadoCivil: extractEstadoCivil(t('estadoCivil')),
    naturalDe: extractTextoLivre(t('naturalDe')),
    provincia: extractProvincia(t('provincia')),
    residencia: extractTextoLivre(t('residencia')),
    altura: extractAltura(t('altura')),
    emitidoEm: extractData(t('emitidoEm')),
    validoAte: extractData(t('validoAte')),
  };
  return { data, spans };
}

/**
 * Extracts values from geometrically ordered OCR lines. Values stop at the next
 * label on the same line; wrapped values are limited to the label's x column.
 */
export function extractFieldsFromWords(text: string, words: OcrWord[]): { data: BIData; spans: Spans; confidenceWords: OcrWord[] } | null {
  const lines = buildOcrLines(words);
  if (!lines.length) return null;
  type Hit = { key: SegKey; start: number; end: number; wordStart: number; wordEnd: number };
  const lineHits: Hit[][] = [];
  const lineChars: Array<Array<{ start: number; end: number }>> = [];
  const lineTexts: string[] = [];
  for (const line of lines) {
    const chars: Array<{ start: number; end: number }> = [];
    let lineText = '';
    for (const word of line.words) {
      if (lineText) lineText += ' ';
      const start = lineText.length;
      lineText += word.text;
      chars.push({ start, end: lineText.length });
    }
    lineTexts.push(lineText);
    lineChars.push(chars);
    const hits: Hit[] = [];
    for (const [key, source] of LABELS) {
      if (key === 'stop') continue;
      const pattern = new RegExp(source.source, 'g');
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(matchText(lineText)))) {
        const wordStart = chars.findIndex((range) => range.end > match!.index);
        let wordEnd = chars.findIndex((range) => range.end >= match!.index + match![0].length);
        if (wordEnd < 0) wordEnd = chars.length - 1;
        if (wordStart >= 0) hits.push({ key, start: match.index, end: match.index + match[0].length, wordStart, wordEnd });
      }
    }
    hits.sort((a, b) => a.start - b.start || b.end - a.end);
    lineHits.push(hits);
  }
  if (!lineHits.some((hits) => hits.length)) return null;

  const labelText: Record<SegKey, string> = {
    nome: 'NOME COMPLETO', filiacao: 'FILIACAO', naturalDe: 'NATURAL DE', provincia: 'PROVINCIA DE',
    dataNascimento: 'DATA DE NASCIMENTO', estadoCivil: 'ESTADO CIVIL', sexo: 'SEXO', altura: 'ALTURA(M)',
    residencia: 'RESIDENCIA', emitidoEm: 'EMITIDO EM', validoAte: 'VALIDO ATE',
  };
  const segments: Array<{ key: SegKey; words: OcrWord[] }> = [];
  const seen = new Set<SegKey>();
  for (let li = 0; li < lines.length; li++) {
    const hits = lineHits[li];
    for (let hi = 0; hi < hits.length; hi++) {
      const hit = hits[hi];
      if (seen.has(hit.key)) continue;
      const labelStartWord = hit.wordStart;
      const labelEndWord = hit.wordEnd;
      const nextFieldWord = hits[hi + 1]?.wordStart ?? lines[li].words.length;
      const stopChars = LABELS.filter(([key]) => key === 'stop').flatMap(([, source]) => {
        const match = new RegExp(source.source).exec(matchText(lineTexts[li]));
        return match ? [match.index] : [];
      });
      const stopChar = stopChars.filter((index) => index > hit.end).sort((a, b) => a - b)[0];
      const stopWordIndex = stopChar === undefined ? lines[li].words.length :
        Math.max(0, lineChars[li].findIndex((range) => range.end > stopChar));
      const stopWord = Math.min(nextFieldWord, stopWordIndex);
      const selected = lines[li].words.slice(labelEndWord + 1, stopWord);
      const alignmentX = selected[0]?.bbox?.x0 ?? lines[li].words[labelStartWord]?.bbox?.x0 ?? 0;
      const xTolerance = Math.max(15, (lines[li].bbox.y1 - lines[li].bbox.y0) * 2);
      for (let next = li + 1; next < lines.length; next++) {
        if (lineHits[next].length || LABELS.some(([key, source]) => key === 'stop' &&
          new RegExp(source.source).test(matchText(lineTexts[next])))) break;
        const continuation = lines[next].words.filter((word) => {
          const x = word.bbox?.x0 ?? 0;
          return x >= alignmentX - 12 && x <= alignmentX + xTolerance;
        });
        if (!continuation.length) break;
        selected.push(...continuation);
      }
      segments.push({ key: hit.key, words: selected });
      seen.add(hit.key);
    }
  }

  const confidenceWords: OcrWord[] = [];
  let canonical = '';
  for (const segment of segments) {
    if (canonical) canonical += '\n';
    canonical += `${labelText[segment.key]}: `;
    for (const word of segment.words) {
      if (canonical && !canonical.endsWith(' ')) canonical += ' ';
      const start = canonical.length;
      canonical += word.text;
      confidenceWords.push({ ...word, start, end: canonical.length });
    }
  }
  const number = extractNumero(text);
  if (number) {
    if (canonical) canonical += '\n';
    const start = canonical.length;
    canonical += number.field.raw ?? '';
    for (const word of words.filter((item) => item.start < number.end && item.end > number.start)) {
      const offset = text.slice(number.start, word.start).length;
      confidenceWords.push({ ...word, start: start + offset, end: start + offset + word.text.length });
    }
  }
  return { ...extractFields(canonical), confidenceWords };
}
