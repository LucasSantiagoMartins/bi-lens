import { describe, expect, it } from 'vitest';
import { createBILens } from '../src/angola/bi/bi-document-analyzer';
import { createDocumentSource, urlDocumentSource } from '../src/core/image-processing/document-source';
import type { OcrEngine } from '../src/core/ocr/types';

const image = Buffer.from('<svg width="80" height="60" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="60" fill="white"/></svg>');

describe('document sources', () => {
  it('resolves front and back references through a caller-provided source', async () => {
    const loaded: string[] = [];
    const source = createDocumentSource(async (reference) => {
      loaded.push(reference);
      return image;
    });
    const engine: OcrEngine = {
      async recognize() { return { text: '', words: [], confidence: 0 }; },
      async terminate() {},
    };
    const lens = createBILens({ engine, passes: [{ width: 300, psm: '3' }] });
    try {
      const result = await lens.analyzeFrom(source, { front: 'objects/front-key', back: 'objects/back-key' });
      expect(loaded).toEqual(['objects/front-key', 'objects/back-key']);
      expect(result.meta.inputs?.map((input) => input.role)).toEqual(['front', 'back']);
    } finally {
      await lens.close();
    }
  });

  it('accepts only HTTP(S) URLs in the built-in URL source', async () => {
    await expect(urlDocumentSource.load('file:///tmp/document.jpg')).rejects.toThrow('HTTP(S)');
  });
});
