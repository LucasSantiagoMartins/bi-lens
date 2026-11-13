/** Entrada pública da análise de imagem e das APIs reduzidas de análise textual. */
export * from './text';
export { createBILens, analyzeBI, analyzeBIFrom, parseBI, DEFAULT_PASSES } from './angola/bi/bi-document-analyzer';
export type { BILens, LensOptions, PassConfig, OcrPass } from './angola/bi/bi-document-analyzer';
export { createDocumentSource, urlDocumentSource } from './core/image-processing/document-source';
export type { DocumentSource, DocumentReferences } from './core/image-processing/document-source';
export type { OcrEngine, OcrLine, OcrResult, OcrWord } from './core/ocr/types';
