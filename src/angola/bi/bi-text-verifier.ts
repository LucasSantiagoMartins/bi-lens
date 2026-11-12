import { levenshtein, matchText } from '../../core/text/normalize';
import type { OcrWord } from '../../core/ocr/types';
import { ALL_FIELDS, VALIDITY_YEARS } from './bi-layout';
import type { BIData, BIFieldKey, Field, Issue, Spans, Status } from './types';

const CAP_CORRECTED = 0.75;
const capped = (f: Field<unknown>) => (f.corrected ? Math.min(f.baseConfidence, CAP_CORRECTED) : f.baseConfidence);
const keys = (d: BIData) => Object.keys(d) as BIFieldKey[];
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

/* ---------- Confiança do OCR ---------- */

const STRICT = new Set<BIFieldKey>(['numero', 'dataNascimento', 'emitidoEm', 'validoAte', 'altura']);

/** Confiança por palavra do Tesseract → confiança por campo (mín. em campos de dígitos, média nos de texto). */
export function applyWordConfidence(data: BIData, spans: Spans, words: OcrWord[]) {
  for (const key of keys(data)) {
    const f = data[key] as Field<unknown>, sp = spans[key];
    if (f.raw === null || !sp) continue;
    let ws = words.filter((w) => w.start < sp.end && w.end > sp.start && w.text.trim());
    if (STRICT.has(key)) ws = ws.filter((w) => /[0-9(\[|!\/]/.test(w.text)); // ignora lixo à volta da data
    if (!ws.length) continue;
    const c = ws.map((w) => Math.max(0, Math.min(1, w.confidence / 100)));
    f.ocrConfidence = STRICT.has(key) ? Math.min(...c) : mean(c);
    f.confidence = capped(f) * f.ocrConfidence;
  }
}

/** Confiança global do OCR (quando não há palavras). */
export function applyScalarConfidence(data: BIData, ocr: number) {
  const factor = Math.max(0, Math.min(1, ocr > 1 ? ocr / 100 : ocr));
  for (const key of keys(data)) {
    const f = data[key] as Field<unknown>;
    if (f.raw === null) continue;
    f.ocrConfidence = factor;
    f.confidence = capped(f) * factor;
  }
}

/* ---------- Votação entre passagens ---------- */

const FUZZY = new Set<BIFieldKey>(['nome', 'filiacao', 'naturalDe', 'residencia']); // texto livre: tolera pequenas diferenças
const similarity = (a: string, b: string) => 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
const uncappedOf = (f: Field<unknown>) => f.baseConfidence * (f.ocrConfidence ?? 1);

export function mergePasses(passes: BIData[]): BIData {
  if (passes.length === 1) return passes[0];
  const out = {} as Record<string, unknown>;
  for (const key of keys(passes[0])) {
    const cands = passes.map((p) => p[key] as Field<unknown>).filter((f) => f.raw !== null);
    if (!cands.length) { out[key] = passes[0][key]; continue; }
    const valid = cands.filter((f) => f.valid && f.value !== null);
    if (!valid.length) {
      out[key] = { ...cands.reduce((a, b) => (b.confidence > a.confidence ? b : a)), votes: 0 };
      continue;
    }
    const groups: { key: string; members: Field<unknown>[]; exact: boolean }[] = [];
    for (const f of valid) {
      const k = matchText(JSON.stringify(f.value));
      const g = groups.find((x) => x.key === k || (FUZZY.has(key) && similarity(x.key, k) >= 0.85));
      if (!g) groups.push({ key: k, members: [f], exact: true });
      else { g.members.push(f); if (g.key !== k) g.exact = false; }
    }
    groups.sort(
      (a, b) => b.members.length - a.members.length ||
        Math.max(...b.members.map((f) => f.confidence)) - Math.max(...a.members.map((f) => f.confidence))
    );
    const best = groups[0];
    const chosen = best.members.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    const merged: Field<unknown> = { ...chosen, votes: best.members.length };
    if (best.members.length >= 2) {
      // Leituras independentes concordam: sobe a confiança (e levanta o limite das correcções).
      merged.confidence = Math.min(0.99, Math.max(...best.members.map(uncappedOf)) + 0.05 * (best.members.length - 1));
      merged.note = `${best.members.length}/${passes.length} passagens concordam`;
      if (!best.exact) { merged.confidence *= 0.9; merged.note += ' (com pequenas diferenças)'; }
    }
    if (groups.length > 1) {
      merged.confidence *= 0.75;
      merged.note = 'passagens divergentes';
    }
    out[key] = merged;
  }
  return out as unknown as BIData;
}

/* ---------- Regra de validade (emissão + 10 anos − 1 dia) ---------- */

export function expectedValidity(emitidoIso: string, years = VALIDITY_YEARS): string {
  const [y, m, d] = emitidoIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y + years, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** Confiança de um par que cumpre a regra: o OCR por palavra é pouco fiável em texto pequeno, por isso tem piso 0.9 se houver corroboração. */
const ruled = (f: Field<unknown>, corroborated: boolean) =>
  Math.min(0.97, f.baseConfidence * (corroborated ? Math.max(f.ocrConfidence ?? 1, 0.9) : f.ocrConfidence ?? 1));

/**
 * Se emissão e validade são incoerentes, tenta resolver com leituras alternativas das outras passagens.
 * Um par que cumpre exactamente a regra é muito improvável por coincidência, por isso ganha confiança.
 */
export function resolveValidity(merged: BIData, passes: BIData[]) {
  const pool = (k: 'emitidoEm' | 'validoAte') =>
    passes.map((p) => p[k]).filter((f) => f.valid && f.value);
  const E = pool('emitidoEm'), V = pool('validoAte');
  const cur = { e: merged.emitidoEm.value, v: merged.validoAte.value };
  const note = 'confirmado pela regra de validade (emissão + 10 anos − 1 dia)';

  if (cur.e && cur.v && expectedValidity(cur.e) === cur.v) {
    const corroborated = merged.emitidoEm.votes >= 2 || merged.validoAte.votes >= 2;
    for (const f of [merged.emitidoEm, merged.validoAte]) { f.confidence = Math.max(f.confidence, ruled(f, corroborated)); f.note = note; }
    return;
  }
  const pairs: [Field<string>, Field<string>][] = [];
  for (const e of E) for (const v of V) if (expectedValidity(e.value!) === v.value) pairs.push([e, v]);
  if (!pairs.length) return;
  const score = ([e, v]: [Field<string>, Field<string>]) =>
    (e.value === cur.e ? 1 : 0) + (v.value === cur.v ? 1 : 0) + e.confidence + v.confidence;
  const [e, v] = pairs.sort((a, b) => score(b) - score(a))[0];
  const corroborated = [e, v].some((f) => passes.filter((p) => p[f === e ? 'emitidoEm' : 'validoAte'].value === f.value).length >= 2);
  merged.emitidoEm = { ...e, confidence: ruled(e, corroborated), votes: Math.max(e.votes, 1), note: `resolvido: ${note}` };
  merged.validoAte = { ...v, confidence: ruled(v, corroborated), votes: Math.max(v.votes, 1), note: `resolvido: ${note}` };
}

/* ---------- Validação cruzada + decisão ---------- */

export interface FinalizeArgs {
  minConfidence: number;
  rejectBelow: number;
  now: Date;
  expected: BIFieldKey[];
  critical: BIFieldKey[];
  /** Multiplica a confiança agregada (qualidade da imagem). */
  factor?: number;
  extraIssues?: Issue[];
}

export function finalizeText(data: BIData, a: FinalizeArgs): { confidence: number; status: Status; reasons: string[]; issues: Issue[] } {
  const issues: Issue[] = [...(a.extraIssues ?? [])];
  const add = (field: string, code: string, message: string, severity: Issue['severity']) =>
    issues.push({ field, code, message, severity });

  for (const k of a.expected) {
    const f = data[k] as Field<unknown>;
    const isCrit = a.critical.includes(k);
    if (f.raw === null) add(k, 'missing', 'campo não encontrado', isCrit ? 'error' : 'warning');
    else if (!f.valid) add(k, 'invalid', 'valor não passou na validação', isCrit ? 'error' : 'warning');
    if (f.raw !== null && f.valid && !isCrit && f.confidence < a.minConfidence)
      add(k, 'low_confidence', `confiança baixa (${f.confidence.toFixed(2)}); confirme manualmente`, 'warning');
    if (f.note === 'passagens divergentes') add(k, 'ocr_disagreement', 'as passagens de OCR leram valores diferentes', 'warning');
  }

  const today = a.now.toISOString().slice(0, 10);
  const nasc = data.dataNascimento.value, emi = data.emitidoEm.value, val = data.validoAte.value;
  // Compare calendar anniversaries in UTC so month lengths and leap years are respected.
  const addMonths = (iso: string, months: number): string => {
    const [year, month, day] = iso.split('-').map(Number);
    const targetMonth = month - 1 + months;
    const targetYear = year + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
    return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
  };
  const expiryAge = val && val < today
    ? (today > addMonths(val, 12) ? 'over_year' : today > addMonths(val, 6) ? 'over_six_months' : 'under_six_months')
    : null;
  const expiryReason = expiryAge === 'over_year'
    ? 'Bilhete de Identidade caducado há mais de 1 ano.'
    : expiryAge === 'over_six_months' ? 'Bilhete de Identidade caducado há mais de 6 meses.' : null;
  if (nasc && nasc > today) add('dataNascimento', 'future', 'data de nascimento no futuro', 'error');
  if (emi && emi > today) add('emitidoEm', 'future', 'data de emissão no futuro', 'error');
  if (nasc && a.now.getUTCFullYear() - Number(nasc.slice(0, 4)) > 120) add('dataNascimento', 'age', 'idade superior a 120 anos', 'warning');
  if (nasc && emi && nasc >= emi) add('emitidoEm', 'date_order', 'emissão anterior ou igual ao nascimento', 'error');
  if (emi && val && emi >= val) add('validoAte', 'date_order', 'validade anterior ou igual à emissão', 'error');
  if (emi && val && emi < val && expectedValidity(emi) !== val) {
    add('validoAte', 'validity_span', `validade esperada ${expectedValidity(emi)} (emissão + 10 anos − 1 dia), lido ${val}`, 'warning');
    for (const f of [data.emitidoEm, data.validoAte]) f.confidence *= 0.8; // um dos dois está provavelmente mal lido
  }
  if (val && val < today) add('validoAte', 'expired', 'documento expirado', 'warning');

  const all = a.expected.map((k) => (data[k] as Field<unknown>).confidence);
  const minCrit = Math.min(...a.critical.map((k) => (data[k] as Field<unknown>).confidence));
  const confidence = Number(((0.6 * minCrit + 0.4 * mean(all)) * (a.factor ?? 1)).toFixed(4));

  const reasons: string[] = [];
  if (confidence < a.rejectBelow) {
    if (expiryReason) reasons.push(expiryReason);
    reasons.push(`confiança agregada (${confidence.toFixed(2)}) abaixo de ${a.rejectBelow}`);
    return { confidence, status: 'rejected', reasons: [...new Set(reasons)], issues };
  }

  for (const k of a.critical) {
    const f = data[k] as Field<unknown>;
    if (f.raw === null) reasons.push(`${k}: não encontrado`);
    else if (!f.valid) reasons.push(`${k}: inválido`);
    else if (f.confidence < a.minConfidence) reasons.push(`${k}: confiança baixa (${f.confidence.toFixed(2)})`);
  }
  for (const i of issues) if (i.severity === 'error' && i.code !== 'missing' && i.code !== 'invalid') reasons.push(`${i.field}: ${i.message}`);
  if (confidence < a.minConfidence) reasons.push(`confiança agregada (${confidence.toFixed(2)}) abaixo de ${a.minConfidence}`);
  if (expiryReason) reasons.push(expiryReason);

  const status: Status = expiryAge === 'over_year' ? 'rejected'
    : (reasons.length || expiryAge === 'over_six_months') ? 'needs_review' : 'approved';
  return { confidence, status, reasons: [...new Set(reasons)], issues };
}

export { ALL_FIELDS };
