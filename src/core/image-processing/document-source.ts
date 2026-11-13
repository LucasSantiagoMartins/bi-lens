import type { ImageInput } from './preprocess';

/** Identifies one or both document sides in an external source. */
export type DocumentReferences = string | { front: string; back?: string } | { back: string; front?: string };

/** Loads an image reference from any storage or external service. */
export interface DocumentSource {
  /** Resolve a reference to encoded image bytes; image decoding remains BI Lens' responsibility. */
  load(reference: string): Promise<ImageInput>;
}

/** Generic HTTP(S) source for public or signed image URLs. */
export const urlDocumentSource: DocumentSource = {
  async load(reference) {
    let url: URL;
    try { url = new URL(reference); } catch { throw new TypeError('A referência da imagem deve ser uma URL HTTP(S) válida.'); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new TypeError('A fonte URL aceita apenas endereços HTTP(S).');
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Falha ao obter imagem da fonte externa (HTTP ${response.status}).`);
    return Buffer.from(await response.arrayBuffer());
  },
};

/** Adapts a consumer-provided source (R2, S3, Azure, local service, etc.) to BI Lens. */
export function createDocumentSource(load: DocumentSource['load']): DocumentSource {
  return { load };
}
