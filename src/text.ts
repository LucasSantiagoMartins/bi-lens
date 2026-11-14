/*
 * Responsibility: provide a lightweight API for callers who already have OCR text.
 * Contents: BI parsing, validation schema, and result types.
 * Key points: does not export or initialize image processing or OCR.
 */
export { analyzeOcrPasses, parseBI } from './angola/bi/bi-document-analyzer';
export type { BITextInput } from './angola/bi/bi-document-analyzer';
export { isValidNumeroBI, BI_NUMBER_RE } from './angola/bi/bi-layout';
export { BIAnalysisSchema } from './angola/bi/bi-schema';
export type * from './angola/bi/types';
