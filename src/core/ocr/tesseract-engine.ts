import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OcrEngine, OcrResult, OcrWord } from './types';

function defaultLangPath(): string {
  const candidates = ['../assets/', '../../../assets/'].map((p) => fileURLToPath(new URL(p, import.meta.url)));
  return candidates.find((c) => existsSync(c + 'por.traineddata')) ?? candidates[0];
}

export async function createTesseractEngine(opts: { langPath?: string; lang?: string } = {}): Promise<OcrEngine> {
  const T: any = await import('tesseract.js');
  const createWorker = T.createWorker ?? T.default?.createWorker;
  const worker = await createWorker(opts.lang ?? 'por', 1, {
    langPath: opts.langPath ?? defaultLangPath(),
    gzip: false,
    cacheMethod: 'none',
  });

  return {
    async recognize(image, o = {}) {
      await worker.setParameters({ tessedit_pageseg_mode: o.psm ?? '3' });
      const { data } = await worker.recognize(image, {}, { blocks: true, text: true });
      let text = '';
      const words: OcrWord[] = [];
      for (const block of data.blocks ?? [])
        for (const para of block.paragraphs ?? [])
          for (const line of para.lines ?? []) {
            for (const w of line.words ?? []) {
              if (text && !text.endsWith('\n')) text += ' ';
              const start = text.length;
              text += w.text;
              words.push({ text: w.text, confidence: w.confidence, start, end: text.length,
                bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 } });
            }
            text += '\n';
          }
      return { text, words, confidence: data.confidence } satisfies OcrResult;
    },
    async terminate() {
      await worker.terminate();
    },
  };
}
