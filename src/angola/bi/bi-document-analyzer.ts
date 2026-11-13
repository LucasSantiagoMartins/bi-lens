import { cropImageRegion, detectHorizontalDocumentRegions, loadImage, preprocess, type ImageInput, type ImageRegion } from '../../core/image-processing/preprocess';
import type { DocumentReferences, DocumentSource } from '../../core/image-processing/document-source';
import { createTesseractEngine } from '../../core/ocr/tesseract-engine';
import { buildOcrLines, type OcrEngine, type OcrWord } from '../../core/ocr/types';
import { ALL_FIELDS, BACK_FIELDS, FRONT_FIELDS } from './bi-layout';
import { verifyGeometry } from './bi-geometry-verifier';
import { LensOptionsSchema } from './bi-schema';
import { verifyStructure } from './bi-structure-verifier';
import { extractFields, extractFieldsFromWords } from './bi-text-parser';
import {
  applyScalarConfidence, applyWordConfidence, finalizeText, mergePasses, resolveValidity,
} from './bi-text-verifier';
import type {
  BIAnalysis, BIData, BIFieldKey, BIInput, BIInputRole, GeometryResult, Sides, TextOptions,
} from './types';

/** Resultado OCR fornecido ao pipeline de análise textual. */
export interface OcrPass { text: string; words?: OcrWord[]; regions?: ImageRegion[] }
/** Largura da imagem e modo de segmentação do Tesseract numa passagem OCR. */
export interface PassConfig { width: number; psm: string }
/** Configuração do processamento de imagem, OCR e decisões por confiança. */
export interface LensOptions extends TextOptions {
  langPath?: string;
  passes?: PassConfig[];
  /** Motor de OCR próprio (por defeito: Tesseract.js local). */
  engine?: OcrEngine;
}

/** Escalas OCR padrão; tamanhos independentes podem expor erros de leitura diferentes. */
export const DEFAULT_PASSES: PassConfig[] = [
  // escalas diferentes → erros diferentes → a votação consegue apanhá-los
  { width: 1552, psm: '3' },
  { width: 1164, psm: '3' },
  { width: 970, psm: '3' },
];

const EXPECTED: Record<Sides, BIFieldKey[]> = { both: ALL_FIELDS, front: FRONT_FIELDS, back: BACK_FIELDS, unknown: ALL_FIELDS };
const CRITICAL: Record<Sides, BIFieldKey[]> = {
  both: ['numero', 'nome', 'dataNascimento'],
  front: ['numero', 'nome'],
  back: ['dataNascimento', 'validoAte'],
  unknown: ['numero', 'nome', 'dataNascimento'],
};

const toValues = (d: BIData): BIAnalysis['values'] => ({
  numero: d.numero.valid ? d.numero.value : null,
  nome: d.nome.valid ? d.nome.value : null,
  pai: d.filiacao.valid ? d.filiacao.value?.pai ?? null : null,
  mae: d.filiacao.valid ? d.filiacao.value?.mae ?? null : null,
  dataNascimento: d.dataNascimento.valid ? d.dataNascimento.value : null,
  sexo: d.sexo.valid ? d.sexo.value : null,
  estadoCivil: d.estadoCivil.valid ? d.estadoCivil.value : null,
  naturalDe: d.naturalDe.valid ? d.naturalDe.value : null,
  provincia: d.provincia.valid ? d.provincia.value : null,
  residencia: d.residencia.valid ? d.residencia.value : null,
  altura: d.altura.valid ? d.altura.value : null,
  emitidoEm: d.emitidoEm.valid ? d.emitidoEm.value : null,
  validoAte: d.validoAte.valid ? d.validoAte.value : null,
});

function combineAnalyses(
  entries: Array<{ role: 'front' | 'back'; result: BIAnalysis }>,
  options: LensOptions,
  startedAt: number,
  debug = false,
): BIAnalysis {
  const inputs = entries.map(({ role, result }) => ({ role, sidesDetected: result.sides, durationMs: result.meta.durationMs ?? 0 }));
  const swapped = entries.some(({ role, result }) => (role === 'front' && result.sides === 'back') || (role === 'back' && result.sides === 'front'));
  const effective = entries.map((entry) => ({ ...entry, side: entry.result.sides === 'both' ? 'both' as const :
    (entry.role === 'front' && entry.result.sides === 'back') || (entry.role === 'back' && entry.result.sides === 'front')
      ? entry.result.sides : entry.role }));
  const invalid = entries.find((entry) => !entry.result.isBI);
  if (invalid) {
    const first = entries[0].result;
    return { ...first, isBI: false, documentType: 'unknown', status: 'rejected', confidence: 0,
      reasons: [`a imagem ${invalid.role} não foi classificada como BI`],
      issues: [...first.issues, { field: invalid.role, code: 'not_bi', message: `a imagem ${invalid.role} não parece ser um BI`, severity: 'error' }],
      meta: { passes: entries.reduce((n, e) => n + e.result.meta.passes, 0), durationMs: Date.now() - startedAt, inputs },
      ...(debug ? { debug: { inputs: entries.map((entry) => entry.result.debug) } } : {}),
    };
  }

  const seen = new Set<Sides>();
  let duplicate = false;
  for (const entry of effective) {
    if (entry.side === 'both') { if (seen.has('front') || seen.has('back')) duplicate = true; seen.add('front'); seen.add('back'); }
    else { if (seen.has(entry.side)) duplicate = true; seen.add(entry.side); }
  }
  let sides: Sides = seen.has('front') && seen.has('back') ? 'both' : seen.has('front') ? 'front' : 'back';
  const data: BIData = { ...entries[0].result.data };
  const copySide = (source: BIData, side: 'front' | 'back') => {
    const keys = side === 'front' ? FRONT_FIELDS : BACK_FIELDS;
    for (const key of keys) {
      const candidate = source[key] as BIData[typeof key];
      const current = data[key] as BIData[typeof key];
      if (current.raw === null || candidate.confidence > current.confidence) (data as unknown as Record<string, unknown>)[key] = candidate;
    }
  };
  for (const entry of effective) {
    if (entry.side === 'both' || entry.side === 'front') copySide(entry.result.data, 'front');
    if (entry.side === 'both' || entry.side === 'back') copySide(entry.result.data, 'back');
  }

  const structure = {
    score: entries.reduce((n, e) => n + e.result.checks.structure.score, 0) / entries.length,
    isBI: true, sides,
    found: [...new Set(entries.flatMap((e) => e.result.checks.structure.found))],
    missing: [...new Set(entries.flatMap((e) => e.result.checks.structure.missing))],
    rejected: [],
  };
  const geometryIssues = entries.flatMap((entry) => entry.result.checks.geometry?.issues ?? []);
  const verdict = finalizeText(data, {
    minConfidence: options.minConfidence ?? 0.85, rejectBelow: options.rejectBelow ?? 0.4,
    now: options.now ?? new Date(), expected: EXPECTED[sides], critical: options.critical ?? CRITICAL[sides],
    extraIssues: geometryIssues,
  });
  const sideIssues = [
    ...(swapped && !duplicate ? [{ field: 'inputs', code: 'sides_swapped', message: 'os lados foram detectados trocados e reordenados', severity: 'warning' as const }] : []),
    ...(duplicate ? [{ field: 'inputs', code: 'duplicate_side', message: 'as duas imagens parecem mostrar o mesmo lado', severity: 'error' as const }] : []),
  ];
  if (duplicate) { sides = sides === 'both' ? 'front' : sides; verdict.status = 'needs_review'; verdict.reasons.push('as duas imagens parecem mostrar o mesmo lado'); }
  return {
    isBI: true, documentType: 'ao-bi-card', sides, ...verdict, issues: [...verdict.issues, ...sideIssues],
    values: toValues(data), data, checks: { structure, geometry: null },
    meta: { passes: entries.reduce((n, e) => n + e.result.meta.passes, 0), durationMs: Date.now() - startedAt, inputs },
    ...(debug ? { debug: { inputs: entries.map((entry) => entry.result.debug) } } : {}),
  };
}

/** Combina passagens OCR e produz uma análise sem carregar imagem nem inicializar OCR. */
export function analyzeOcrPasses(
  passes: OcrPass[],
  o: TextOptions = {},
  geometry: GeometryResult | null = null,
  durationMs?: number
): BIAnalysis {
  const minConfidence = o.minConfidence ?? 0.85;
  const rejectBelow = o.rejectBelow ?? 0.4;
  const now = o.now ?? new Date();

  const parsedPasses = passes.map((p) => {
    const fallback = extractFields(p.text);
    const positioned = p.words?.length ? extractFieldsFromWords(p.text, p.words) : null;
    const fallbackData = fallback.data;
    if (p.words?.length) applyWordConfidence(fallbackData, fallback.spans, p.words);
    else if (o.ocrConfidence !== undefined) applyScalarConfidence(fallbackData, o.ocrConfidence);
    if (!positioned) return { data: fallbackData, extractionMode: 'text' as const };
    if (p.words?.length) applyWordConfidence(positioned.data, positioned.spans, positioned.confidenceWords);
    else if (o.ocrConfidence !== undefined) applyScalarConfidence(positioned.data, o.ocrConfidence);
    const quality = (data: BIData) => Object.values(data).filter((field) => field.valid && field.value !== null).length;
    const textQuality = quality(fallbackData), geometryQuality = quality(positioned.data);
    const useGeometry = geometryQuality > textQuality;
    return useGeometry ? { data: positioned.data, extractionMode: 'bbox' as const }
      : { data: fallbackData, extractionMode: 'text' as const };
  });
  const parsed = parsedPasses.map((pass) => pass.data);
  const merged: BIData = mergePasses(parsed);
  if (parsed.length > 1) resolveValidity(merged, parsed);

  const structure = verifyStructure(passes.map((p) => p.text), merged.numero.raw !== null);
  const debug = o.debug ? {
    passes: passes.map((pass, i) => {
      const fields = parsed[i];
      const extracted = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.raw])) as
        Partial<Record<BIFieldKey, string | null>>;
      const nullFields = Object.fromEntries(Object.entries(fields)
        .filter(([, field]) => field.raw === null)
        .map(([key]) => [key, 'Rótulo ou valor não localizado pelo extractor textual nesta passagem.'])) as
        Partial<Record<BIFieldKey, string>>;
      return { text: pass.text, words: pass.words?.length ?? 0, lines: buildOcrLines(pass.words ?? []), extracted, nullFields,
        crops: pass.regions ?? [], extractionMode: parsedPasses[i].extractionMode };
    }),
    markers: { found: structure.found, missing: structure.missing, rejected: structure.rejected ?? [] },
  } : undefined;
  const values = (d: BIData): BIAnalysis['values'] => ({
    numero: d.numero.valid ? d.numero.value : null,
    nome: d.nome.valid ? d.nome.value : null,
    pai: d.filiacao.valid ? d.filiacao.value?.pai ?? null : null,
    mae: d.filiacao.valid ? d.filiacao.value?.mae ?? null : null,
    dataNascimento: d.dataNascimento.valid ? d.dataNascimento.value : null,
    sexo: d.sexo.valid ? d.sexo.value : null,
    estadoCivil: d.estadoCivil.valid ? d.estadoCivil.value : null,
    naturalDe: d.naturalDe.valid ? d.naturalDe.value : null,
    provincia: d.provincia.valid ? d.provincia.value : null,
    residencia: d.residencia.valid ? d.residencia.value : null,
    altura: d.altura.valid ? d.altura.value : null,
    emitidoEm: d.emitidoEm.valid ? d.emitidoEm.value : null,
    validoAte: d.validoAte.valid ? d.validoAte.value : null,
  });
  const meta = { passes: passes.length, durationMs };

  if (!structure.isBI) {
    const classificationIssues = (structure.rejected ?? []).map((marker) => ({ field: 'estrutura', code: 'non_bi_marker',
      message: `marcador de não-BI detectado: ${marker}`, severity: 'error' as const }));
    return {
      isBI: false, documentType: 'unknown', sides: structure.sides, status: 'rejected', confidence: 0,
      reasons: [`o documento não parece ser um BI angolano (estrutura ${structure.score.toFixed(2)})`],
      issues: [...(geometry?.issues ?? []), ...classificationIssues], values: values(merged), data: merged,
      checks: { structure, geometry }, meta, ...(debug ? { debug } : {}),
    };
  }

  const sides = structure.sides;
  const factor = geometry ? 0.8 + 0.2 * geometry.score : 1;
  const verdict = finalizeText(merged, {
    minConfidence, rejectBelow, now, expected: EXPECTED[sides], critical: o.critical ?? CRITICAL[sides],
    factor, extraIssues: geometry?.issues,
  });
  return {
    isBI: true, documentType: 'ao-bi-card', sides, ...verdict,
    values: values(merged), data: merged, checks: { structure, geometry }, meta, ...(debug ? { debug } : {}),
  };
}

export interface BILens {
  /** Analisa uma imagem ou imagens indicadas explicitamente como frente e verso.
   * @throws Erros de descodificação, pré-processamento ou inicialização/leitura OCR. */
  analyze(image: BIInput, options?: { debug?: boolean }): Promise<BIAnalysis>;
  /** Resolve uma ou duas referências pela fonte indicada e analisa as imagens resultantes. */
  analyzeFrom(source: DocumentSource, references: DocumentReferences, options?: { debug?: boolean }): Promise<BIAnalysis>;
  /** Liberta o worker OCR interno; um motor fornecido pelo consumidor não é terminado. */
  close(): Promise<void>;
}

/** Cria um analisador reutilizável. O worker OCR é inicializado na primeira imagem e
 * permanece activo até à chamada de {@link BILens.close}. */
export function createBILens(options: LensOptions = {}): BILens {
  LensOptionsSchema.parse(options);
  const passes = options.passes ?? DEFAULT_PASSES;
  let engine: OcrEngine | null = options.engine ?? null;
  const getEngine = async () => (engine ??= await createTesseractEngine({ langPath: options.langPath }));

  return {
    async analyze(image, analyzeOptions = {}) {
      const debug = options.debug || analyzeOptions.debug;
      const isPair = typeof image === 'object' && !Buffer.isBuffer(image) && !(image instanceof Uint8Array);
      if (isPair) {
        const startedAt = Date.now();
        const pair = image as Exclude<BIInput, ImageInput>;
        const entries = (['front', 'back'] as const).flatMap((role) => pair[role] === undefined ? [] : [{ role, image: pair[role]! }]);
        if (!entries.length) throw new TypeError('BIInput deve conter front ou back.');
        const analyzed: Array<{ role: 'front' | 'back'; result: BIAnalysis }> = [];
        for (const entry of entries) analyzed.push({ role: entry.role, result: await this.analyze(entry.image, { debug }) });
        return combineAnalyses(analyzed, options, startedAt, debug);
      }
      const t0 = Date.now();
      const { buffer, info } = await loadImage(image);
      const foundRegions = await detectHorizontalDocumentRegions(buffer, info);
      const regions = foundRegions.length >= 2 ? foundRegions : [{ left: 0, top: 0, width: info.width, height: info.height }];
      const geometry = verifyGeometry(info);
      if (foundRegions.length >= 2) {
        geometry.layout = 'two-sides-stacked';
        geometry.score = Math.min(1, geometry.score + 0.3);
        geometry.issues = geometry.issues.filter((issue) => issue.code !== 'aspect_ratio');
      }
      const eng = await getEngine();
      const results: OcrPass[] = [];
      for (const p of passes) {
        let text = '';
        const words: OcrWord[] = [];
        let yOffset = 0;
        for (const region of regions) {
          const crop = regions.length === 1 && region.left === 0 && region.top === 0 && region.width === info.width && region.height === info.height
            ? buffer : await cropImageRegion(buffer, region);
          const img = await preprocess(crop, { width: p.width });
          const r = await eng.recognize(img, { psm: p.psm });
          if (text && !text.endsWith('\n')) text += '\n';
          const offset = text.length;
          text += r.text;
          const scale = p.width / region.width;
          words.push(...r.words.map((word) => ({ ...word, start: word.start + offset, end: word.end + offset,
            ...(word.bbox ? { bbox: { ...word.bbox, y0: word.bbox.y0 + yOffset, y1: word.bbox.y1 + yOffset } } : {}) })));
          yOffset += Math.round(region.height * scale) + 40;
        }
        results.push({ text, words, regions });
      }
      return analyzeOcrPasses(results, { ...options, debug }, geometry, Date.now() - t0);
    },
    async analyzeFrom(source, references, analyzeOptions = {}) {
      if (typeof source?.load !== 'function') throw new TypeError('A fonte deve implementar load(reference).');
      if (typeof references === 'string') return this.analyze(await source.load(references), analyzeOptions);
      const resolved: Partial<Record<'front' | 'back', ImageInput>> = {};
      for (const side of ['front', 'back'] as const) {
        const reference = references[side];
        if (reference !== undefined) resolved[side] = await source.load(reference);
      }
      if (resolved.front === undefined && resolved.back === undefined) {
        throw new TypeError('As referências devem conter front ou back.');
      }
      if (resolved.front !== undefined && resolved.back !== undefined) {
        return this.analyze({ front: resolved.front, back: resolved.back }, analyzeOptions);
      }
      if (resolved.front !== undefined) return this.analyze({ front: resolved.front }, analyzeOptions);
      if (resolved.back !== undefined) return this.analyze({ back: resolved.back }, analyzeOptions);
      throw new TypeError('As referências devem conter front ou back.');
    },
    async close() {
      if (engine && !options.engine) await engine.terminate();
      engine = options.engine ?? null;
    },
  };
}

/** Analisa uma entrada e fecha o worker OCR interno no fim da chamada. */
export async function analyzeBI(image: BIInput, options: LensOptions = {}): Promise<BIAnalysis> {
  const lens = createBILens(options);
  try { return await lens.analyze(image); } finally { await lens.close(); }
}

/** Resolve referências externas e analisa-as com um worker OCR de utilização única. */
export async function analyzeBIFrom(
  source: DocumentSource,
  references: DocumentReferences,
  options: LensOptions = {},
): Promise<BIAnalysis> {
  const lens = createBILens(options);
  try { return await lens.analyzeFrom(source, references); } finally { await lens.close(); }
}

/** Texto OCR de um documento ou dos lados reconhecidos separadamente. */
export type BITextInput = string | { front: string; back?: string } | { back: string; front?: string };

/** Analisa texto já reconhecido, sem carregar dependências de imagem ou OCR.
 * Aplica as regras de estrutura, extracção e validação específicas do BI. */
export function parseBI(ocrText: BITextInput, options: TextOptions = {}): BIAnalysis {
  if (typeof ocrText !== 'string') {
    const entries = (['front', 'back'] as const).flatMap((role) => ocrText[role] === undefined ? [] :
      [{ role, result: analyzeOcrPasses([{ text: ocrText[role]! }], options) }]);
    return combineAnalyses(entries, options, Date.now(), Boolean(options.debug));
  }
  return analyzeOcrPasses([{ text: ocrText }], options);
}
