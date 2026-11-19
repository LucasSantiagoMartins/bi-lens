/*
 * Responsibility: load images through external references.
 * Contents: source contracts and adapters for URLs or custom storage.
 * Key points: URLs accept only HTTP(S); decoding is handled by the pipeline.
 */
import type { ImageInput } from "./preprocess";

export type DocumentReferences =
  string | { front: string; back?: string } | { back: string; front?: string };

export interface DocumentSource {
  load(reference: string): Promise<ImageInput>;
}

export const urlDocumentSource: DocumentSource = {
  async load(reference) {
    let url: URL;
    try {
      url = new URL(reference);
    } catch {
      throw new TypeError(
        "A referência da imagem deve ser uma URL HTTP(S) válida.",
      );
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("A fonte URL aceita apenas endereços HTTP(S).");
    }
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(
        `Falha ao obter imagem da fonte externa (HTTP ${response.status}).`,
      );
    return Buffer.from(await response.arrayBuffer());
  },
};

export function createDocumentSource(
  load: DocumentSource["load"],
): DocumentSource {
  return { load };
}
