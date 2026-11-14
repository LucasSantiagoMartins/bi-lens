/*
 * Responsabilidade: definir os contratos partilhados da análise do BI.
 * Conteúdo: campos extraídos, confiança, issues, estrutura, opções e resultado.
 * Pontos importantes: datas são ISO; altura está em metros; nomes de campos
 * portugueses preservam o formato de dados do BI e a API pública existente.
 */
import type { OcrLine } from '../../core/ocr/types';
import type { ImageInput } from '../../core/image-processing/preprocess';

export type Severity = 'error' | 'warning';
export interface Issue { field: string; code: string; message: string; severity: Severity }

export interface Field<T> {
  value: T | null;
  raw: string | null;
  confidence: number;
  valid: boolean;
  corrected: boolean;
  baseConfidence: number;
  ocrConfidence: number | null;
  votes: number;
  note?: string;
}

export interface Filiacao { pai: string | null; mae: string | null }
export type Sexo = 'M' | 'F';

export interface BIData {
  numero: Field<string>;
  nome: Field<string>;
  filiacao: Field<Filiacao>;
  dataNascimento: Field<string>;
  sexo: Field<Sexo>;
  estadoCivil: Field<string>;
  naturalDe: Field<string>;
  provincia: Field<string>;
  residencia: Field<string>;
  altura: Field<number>;
  emitidoEm: Field<string>;
  validoAte: Field<string>;
}
export type BIFieldKey = keyof BIData;
export type Spans = Partial<Record<BIFieldKey, { start: number; end: number }>>;

export type Status = 'approved' | 'needs_review' | 'rejected';
export type Sides = 'front' | 'back' | 'both' | 'unknown';

export interface TextOptions {
  minConfidence?: number;
  rejectBelow?: number;
  ocrConfidence?: number;
  now?: Date;
  critical?: BIFieldKey[];
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
  confidence: number;
  reasons: string[];
  issues: Issue[];
  values: {
    numero: string | null; nome: string | null; pai: string | null; mae: string | null;
    dataNascimento: string | null; sexo: Sexo | null; estadoCivil: string | null;
    naturalDe: string | null; provincia: string | null; residencia: string | null;
    altura: number | null; emitidoEm: string | null; validoAte: string | null;
  };
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

export type BIInputRole = 'front' | 'back' | 'combined';
export type BIInput = ImageInput | { front: ImageInput; back?: ImageInput } | { back: ImageInput; front?: ImageInput };
