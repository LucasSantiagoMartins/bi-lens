import type { OcrLine } from '../../core/ocr/types';
import type { ImageInput } from '../../core/image-processing/preprocess';

export type Severity = 'error' | 'warning';
/** A field-level or image-level diagnostic emitted during analysis. */
export interface Issue { field: string; code: string; message: string; severity: Severity }

/** Extracted value and the evidence/confidence retained for that field. */
export interface Field<T> {
  value: T | null;
  /** Texto bruto encontrado (null = campo não localizado). */
  raw: string | null;
  /** Confiança final 0-1 (regras × OCR × votação entre passagens). */
  confidence: number;
  /** Passou na validação de formato/regras. */
  valid: boolean;
  /** Foi preciso corrigir erros típicos de OCR (O↔0, '(' → 1, ...). */
  corrected: boolean;
  /** Confiança só das regras, antes de OCR/votação. */
  baseConfidence: number;
  /** Confiança do OCR nas palavras deste campo (0-1), se disponível. */
  ocrConfidence: number | null;
  /** Nº de passagens de OCR que concordam com este valor. */
  votes: number;
  note?: string;
}

export interface Filiacao { pai: string | null; mae: string | null }
export type Sexo = 'M' | 'F';

export interface BIData {
  numero: Field<string>;
  nome: Field<string>;
  filiacao: Field<Filiacao>;
  dataNascimento: Field<string>; // ISO YYYY-MM-DD
  sexo: Field<Sexo>;
  estadoCivil: Field<string>;    // neutro quanto ao género: SOLTEIRO | CASADO | ...
  naturalDe: Field<string>;
  provincia: Field<string>;
  residencia: Field<string>;
  altura: Field<number>;         // metros
  emitidoEm: Field<string>;      // ISO
  validoAte: Field<string>;      // ISO
}
/** Name of a field returned in {@link BIData}. */
export type BIFieldKey = keyof BIData;
export type Spans = Partial<Record<BIFieldKey, { start: number; end: number }>>;

/** Overall automated decision. It is a processing outcome, not identity proof. */
export type Status = 'approved' | 'needs_review' | 'rejected';
export type Sides = 'front' | 'back' | 'both' | 'unknown';

/** Confidence thresholds and optional overrides shared by image and text analysis. */
export interface TextOptions {
  /** Confiança mínima para aprovação automática. Default 0.85. */
  minConfidence?: number;
  /** Abaixo disto → 'rejected'. Default 0.4. */
  rejectBelow?: number;
  /** Confiança global do OCR (0-1 ou 0-100) quando não há confiança por palavra. */
  ocrConfidence?: number;
  /** Data de referência (testes). */
  now?: Date;
  /** Substitui os campos críticos (por defeito dependem dos lados detectados). */
  critical?: BIFieldKey[];
  /** Inclui texto OCR e diagnóstico detalhado no resultado. Pode conter dados pessoais. */
  debug?: boolean;
}

export interface StructureResult {
  score: number;
  isBI: boolean;
  sides: Sides;
  found: string[];
  missing: string[];
  rejected?: string[];
  signals?: { strongHeader: boolean; hasNumber: boolean; verifiedFront: boolean; verifiedBack: boolean };
}
export interface GeometryResult {
  score: number;
  layout: 'single-card' | 'two-sides-stacked' | 'unknown';
  width: number;
  height: number;
  aspectRatio: number;
  sharpness: number;
  issues: Issue[];
}

export interface BIAnalysis {
  isBI: boolean;
  documentType: 'ao-bi-card' | 'unknown';
  sides: Sides;
  status: Status;
  /** 0-1. */
  confidence: number;
  reasons: string[];
  issues: Issue[];
  /** Valores planos prontos a usar (null se inválido/ausente). */
  values: {
    numero: string | null; nome: string | null; pai: string | null; mae: string | null;
    dataNascimento: string | null; sexo: Sexo | null; estadoCivil: string | null;
    naturalDe: string | null; provincia: string | null; residencia: string | null;
    altura: number | null; emitidoEm: string | null; validoAte: string | null;
  };
  /** Detalhe por campo (confiança, votos, texto bruto...). */
  data: BIData;
  checks: { structure: StructureResult; geometry: GeometryResult | null };
  meta: { passes: number; durationMs?: number; inputs?: Array<{ role: BIInputRole; sidesDetected: Sides; durationMs: number }> };
  debug?: {
    passes?: Array<{
      text: string;
      words: number;
      lines: OcrLine[];
      extracted: Partial<Record<BIFieldKey, string | null>>;
      nullFields: Partial<Record<BIFieldKey, string>>;
      crops: Array<{ left: number; top: number; width: number; height: number }>;
      extractionMode: 'text' | 'bbox';
    }>;
    markers?: { found: string[]; missing: string[]; rejected?: string[] };
    inputs?: unknown[];
  };
}

/** Role assigned to an input image in metadata. */
export type BIInputRole = 'front' | 'back' | 'combined';
export type BIInput = ImageInput | { front: ImageInput; back?: ImageInput } | { back: ImageInput; front?: ImageInput };
