/** Entrada sem dependências de imagem/OCR para aplicações que já têm texto OCR. */
export { analyzeOcrPasses, parseBI } from './angola/bi/bi-document-analyzer';
export type { BITextInput } from './angola/bi/bi-document-analyzer';
export { isValidNumeroBI, BI_NUMBER_RE } from './angola/bi/bi-layout';
export { BIAnalysisSchema } from './angola/bi/bi-schema';
export type * from './angola/bi/types';
