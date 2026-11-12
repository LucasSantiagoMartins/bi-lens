import { describe, expect, it } from 'vitest';
import { buildOcrLines, type OcrWord } from '../src/core/ocr/types';

function word(text: string, x0: number, y0: number, x1: number, y1: number): OcrWord {
  return { text, confidence: 99, start: 0, end: text.length, bbox: { x0, y0, x1, y1 } };
}

describe('buildOcrLines', () => {
  it('groups by vertical overlap and orders words by x regardless of input order', () => {
    const lines = buildOcrLines([
      word('ANGOLA', 100, 12, 160, 24),
      word('REPUBLICA', 10, 10, 90, 23),
      word('NOME', 10, 42, 48, 54),
      word('COMPLETO', 55, 44, 120, 56),
    ]);

    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.words.map((item) => item.text))).toEqual([
      ['REPUBLICA', 'ANGOLA'], ['NOME', 'COMPLETO'],
    ]);
    expect(lines[0].bbox).toEqual({ x0: 10, y0: 10, x1: 160, y1: 24 });
  });

  it('separates distant words into columns', () => {
    const [line] = buildOcrLines([
      word('EMITIDO', 10, 10, 70, 22), word('2020', 75, 10, 108, 22),
      word('VALIDO', 250, 10, 300, 22), word('2030', 305, 10, 338, 22),
    ]);
    expect(line.columns.map((column) => column.map((item) => item.text))).toEqual([
      ['EMITIDO', '2020'], ['VALIDO', '2030'],
    ]);
  });

  it('ignores words without usable bounding boxes', () => {
    expect(buildOcrLines([{ text: 'sem bbox', confidence: 90, start: 0, end: 8 }])).toEqual([]);
  });
});
