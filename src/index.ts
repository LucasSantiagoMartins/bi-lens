/** Entrada pública da análise de imagem e das APIs reduzidas de análise textual. */
export * from './text';
export { createBILens, analyzeBI, parseBI, DEFAULT_PASSES } from './angola/bi/bi-document-analyzer';
export type { BILens, LensOptions, PassConfig, OcrPass } from './angola/bi/bi-document-analyzer';
export type { OcrEngine, OcrLine, OcrResult, OcrWord } from './core/ocr/types';
