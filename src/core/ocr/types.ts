/*
 * Responsibility: define the shared OCR contracts.
 * Contents: words, lines, results, engines, and column reconstruction.
 * Key points: OcrEngine is the extension boundary for external engines.
 */
export interface OcrWord {
  text: string;
  confidence: number;
  start: number;
  end: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrLine {
  words: OcrWord[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
  columns: OcrWord[][];
}

export function buildOcrLines(words: OcrWord[]): OcrLine[] {
  const positioned = words
    .filter(
      (word) =>
        word.bbox && word.bbox.x1 > word.bbox.x0 && word.bbox.y1 > word.bbox.y0,
    )
    .slice()
    .sort((a, b) => a.bbox!.y0 - b.bbox!.y0 || a.bbox!.x0 - b.bbox!.x0);
  const groups: OcrWord[][] = [];
  for (const word of positioned) {
    const box = word.bbox!;
    const center = (box.y0 + box.y1) / 2;
    const group = groups.find((line) => {
      const top = Math.min(...line.map((item) => item.bbox!.y0));
      const bottom = Math.max(...line.map((item) => item.bbox!.y1));
      const lineCenter = (top + bottom) / 2;
      const lineHeight = bottom - top;
      const wordHeight = box.y1 - box.y0;
      return (
        Math.min(bottom, box.y1) - Math.max(top, box.y0) > 0 ||
        Math.abs(center - lineCenter) <= Math.max(lineHeight, wordHeight) * 0.35
      );
    });
    (group ?? groups[groups.push([]) - 1]).push(word);
  }

  return groups
    .map((lineWords) => {
      lineWords.sort((a, b) => a.bbox!.x0 - b.bbox!.x0);
      const x0 = Math.min(...lineWords.map((word) => word.bbox!.x0));
      const y0 = Math.min(...lineWords.map((word) => word.bbox!.y0));
      const x1 = Math.max(...lineWords.map((word) => word.bbox!.x1));
      const y1 = Math.max(...lineWords.map((word) => word.bbox!.y1));
      const heights = lineWords
        .map((word) => word.bbox!.y1 - word.bbox!.y0)
        .sort((a, b) => a - b);
      const medianHeight = heights[Math.floor(heights.length / 2)] ?? 0;
      const columns: OcrWord[][] = [];
      for (const word of lineWords) {
        const current = columns[columns.length - 1];
        const previous = current?.[current.length - 1];
        const gap = previous ? word.bbox!.x0 - previous.bbox!.x1 : 0;
        if (!current || gap > medianHeight * 2.5) columns.push([word]);
        else current.push(word);
      }
      return { words: lineWords, bbox: { x0, y0, x1, y1 }, columns };
    })
    .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
}
export interface OcrResult {
  text: string;
  words: OcrWord[];
  confidence: number;
}
export interface OcrEngine {
  recognize(image: Buffer, opts?: { psm?: string }): Promise<OcrResult>;
  terminate(): Promise<void>;
}
