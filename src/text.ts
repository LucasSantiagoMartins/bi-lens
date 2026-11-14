/*
 * Responsabilidade: oferecer a API leve para quem já tem o texto OCR.
 * Conteúdo: parsing do BI, schema de validação e tipos do resultado.
 * Pontos importantes: não exporta nem inicializa processamento de imagem ou OCR.
 */
export { analyzeOcrPasses, parseBI } from './angola/bi/bi-document-analyzer';
export type { BITextInput } from './angola/bi/bi-document-analyzer';
export { isValidNumeroBI, BI_NUMBER_RE } from './angola/bi/bi-layout';
export { BIAnalysisSchema } from './angola/bi/bi-schema';
export type * from './angola/bi/types';
