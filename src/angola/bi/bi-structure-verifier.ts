/*
 * Responsabilidade: classificar a estrutura reconhecida no texto OCR.
 * Conteúdo: correspondência de marcadores, lados presentes e sinais de BI.
 * Pontos importantes: rejeita marcadores conhecidos de documentos de teste.
 */
import { fuzzyContains } from '../../core/classification/fuzzy';
import { matchText } from '../../core/text/normalize';
import { MARKERS } from './bi-layout';
import type { Sides, StructureResult } from './types';

export function verifyStructure(texts: string[], hasNumber: boolean): StructureResult {
  const hay = texts.map(matchText).join('\n');
  const hit = (list: string[]) => list.filter((m) => fuzzyContains(hay, m));
  const header = hit(MARKERS.header), front = hit(MARKERS.front), back = hit(MARKERS.back);

  const weight = header.length + front.length + back.length + (hasNumber ? 2 : 0);
  const score = Math.min(1, weight / 8);
  const found = [...header, ...front, ...back, ...(hasNumber ? ['Nº DO BI'] : [])];
  const missing = [...MARKERS.header, ...MARKERS.front, ...MARKERS.back].filter((m) => !found.includes(m));

  const hasFront = front.length >= 1 && (hasNumber || front.includes('NOME COMPLETO')) || (hasNumber && header.length >= 1);
  const hasBack = back.length >= 3;
  const sides: Sides = hasFront && hasBack ? 'both' : hasFront ? 'front' : hasBack ? 'back' : 'unknown';
  const rejected = [
    ...(hay.includes('NAO POSSUI VALIDADE LEGAL') ? ['disclaimer:NAO POSSUI VALIDADE LEGAL'] : []),
    ...(hay.includes('GERADO AUTOMATICAMENTE PARA FINS DE TESTE') ? ['disclaimer:GERADO AUTOMATICAMENTE PARA FINS DE TESTE'] : []),
  ];
  const strongHeader = header.includes('REPUBLICA DE ANGOLA') || header.includes('CIDADAO NACIONAL');
  const verifiedFront = strongHeader && hasNumber && front.includes('NOME COMPLETO') && front.includes('FILIACAO');
  const dateCount = [...hay.matchAll(/\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}\b/g)].length;
  const verifiedBack = back.length >= 3 && dateCount >= 2 &&
    /\bSEXO\s*:?\s*(?:M|F|MASCULINO|FEMININO)\b/.test(hay) &&
    /\bPROVINCIA(?: DE)?\s*:?\s*(?:BENGO|BENGUELA|BIE|CABINDA|CUANDO|CUBANGO|CUANZA|CUNENE|HUAMBO|HUILA|LUANDA|LUNDA|MALANJE|MOXICO|NAMIBE|UIGE|ZAIRE)\b/.test(hay);
  const isBI = score >= 0.5 && sides !== 'unknown' && (verifiedFront || verifiedBack) && rejected.length === 0;
  return { score, isBI, sides, found, missing, rejected, signals: { strongHeader, hasNumber, verifiedFront, verifiedBack } };
}
