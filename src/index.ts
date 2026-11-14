/*
 * Responsabilidade: ponto de entrada principal do pacote.
 * Conteúdo: análise de imagem e texto, fontes externas, tipos e extensão OCR.
 * Pontos importantes: mantém os exports públicos disponíveis pelo caminho ".".
 */
export * from './text';
export { createBILens, analyzeBI, analyzeBIFrom, parseBI, DEFAULT_PASSES } from './angola/bi/bi-document-analyzer';
export type { BILens, LensOptions, PassConfig, OcrPass } from './angola/bi/bi-document-analyzer';
export { createDocumentSource, urlDocumentSource } from './core/image-processing/document-source';
export type { DocumentSource, DocumentReferences } from './core/image-processing/document-source';
export type { OcrEngine, OcrLine, OcrResult, OcrWord } from './core/ocr/types';
