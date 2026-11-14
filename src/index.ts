/*
 * Responsibility: main package entry point.
 * Contents: image and text analysis, external sources, types, and OCR extension.
 * Key points: keeps the public exports available through the "." path.
 */
export * from './text';
export { createBILens, analyzeBI, analyzeBIFrom, parseBI, DEFAULT_PASSES } from './angola/bi/bi-document-analyzer';
export type { BILens, LensOptions, PassConfig, OcrPass } from './angola/bi/bi-document-analyzer';
export { createDocumentSource, urlDocumentSource } from './core/image-processing/document-source';
export type { DocumentSource, DocumentReferences } from './core/image-processing/document-source';
export type { OcrEngine, OcrLine, OcrResult, OcrWord } from './core/ocr/types';
