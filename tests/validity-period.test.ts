import { describe, expect, it } from 'vitest';
import { expectedValidity } from '../src/angola/bi/bi-text-verifier';
import { parseBI } from '../src/angola/bi/bi-document-analyzer';

const front = `REPÚBLICA DE ANGOLA BILHETE DE IDENTIDADE DE CIDADÃO NACIONAL
Nome Completo: ANA SILVA
Filiação: JOÃO SILVA e MARIA SILVA
Bilhete de Identidade Nº: 123456789LA012 ASSINATURA DO TITULAR`;

function back(dataNascimento: string, validoAte: string) {
  return `Residência: RUA UM
Natural de: LUANDA
Província de: LUANDA
Data de Nascimento: ${dataNascimento}
Sexo: F Altura(m): 1.60
Estado Civil: SOLTEIRA
Emitido em: 30/07/2026 Válido até: ${validoAte}
DIRECTOR NACIONAL DE IDENTIFICAÇÃO`;
}

describe('validity period by age at issue', () => {
  it('expects five years when the holder was 15 at issue', () => {
    expect(expectedValidity('2026-07-30', '2010-08-25')).toBe('2031-07-29');
    const result = parseBI({ front, back: back('25/08/2010', '29/07/2031') }, { now: new Date('2026-11-13T00:00:00Z') });
    expect(result.issues.some((issue) => issue.code === 'validity_span')).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'expired')).toBe(false);
  });

  it('expects ten years for an adult below the lifetime band', () => {
    expect(expectedValidity('2026-07-30', '1990-01-01')).toBe('2036-07-29');
  });

  it('does not predict a numeric expiry for lifetime validity', () => {
    expect(expectedValidity('2026-07-30', '1960-01-01')).toBeNull();
  });
});
