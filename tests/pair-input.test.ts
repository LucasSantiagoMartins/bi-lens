import { describe, expect, it } from 'vitest';
import { parseBI } from '../src/angola/bi/bi-document-analyzer';

const front = `REPÚBLICA DE ANGOLA BILHETE DE IDENTIDADE DE CIDADÃO NACIONAL
Nome Completo: ANA SILVA
Filiação: JOÃO SILVA e MARIA SILVA
Bilhete de Identidade Nº: 123456789LA012 ASSINATURA DO TITULAR`;
const back = `Residência: RUA UM
Natural de: LUANDA
Província de: LUANDA
Data de Nascimento: 01/01/1990
Sexo: F Altura(m): 1.60
Estado Civil: SOLTEIRA
Emitido em: 01/01/2020 Válido até: 31/12/2029
DIRECTOR NACIONAL DE IDENTIFICAÇÃO`;

describe('text pair input', () => {
  it('merges a front and back into one analysis', () => {
    const result = parseBI({ front, back });
    expect(result.isBI).toBe(true);
    expect(result.sides).toBe('both');
    expect(Object.values(result.values).every((value) => value !== null)).toBe(true);
  });

  it('detects and reports reversed role hints', () => {
    const result = parseBI({ front: back, back: front });
    expect(result.issues.some((issue) => issue.code === 'sides_swapped')).toBe(true);
  });

  it('reports duplicate sides for two fronts', () => {
    const result = parseBI({ front, back: front });
    expect(result.issues.some((issue) => issue.code === 'duplicate_side')).toBe(true);
    expect(result.status).toBe('needs_review');
  });

  it('rejects explicit non-document disclaimers', () => {
    const result = parseBI(`${front}\n${back}\nDOCUMENTO GERADO AUTOMATICAMENTE PARA FINS DE TESTE; NÃO POSSUI VALIDADE LEGAL`);
    expect(result.isBI).toBe(false);
    expect(result.status).toBe('rejected');
  });
});
