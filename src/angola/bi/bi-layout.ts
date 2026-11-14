/*
 * Responsabilidade: centralizar regras e vocabulário impressos no BI angolano.
 * Conteúdo: formato do número, validade, proporção, rótulos e marcadores.
 * Pontos importantes: estes marcadores alimentam extração e classificação.
 */
import { matchText } from '../../core/text/normalize';
import type { BIFieldKey } from './types';

export const BI_NUMBER_RE = /^\d{9}[A-Z]{2}\d{3}$/;
export const VALIDITY_YEARS = { minor: 5, adult: 10 } as const;
export const CARD_RATIO = 85.6 / 54;

export type SegKey = Exclude<BIFieldKey, 'numero'>;

export const LABELS: [SegKey | 'stop', RegExp][] = [
  ['nome', /\bNOME(?: COMPLETO)?\b/],
  ['filiacao', /\bFILIACAO(?:\s*:?\s*FILHO\(?A?\)?\s+DE)?|\bFILHO\(?A?\)?\s+DE\b/],
  ['naturalDe', /\bNATURALIDADE\b|\bNATURAL DE\b/],
  ['provincia', /\bPROVINCIA DE\b|\bPROVINCIA\b/],
  ['dataNascimento', /\bDATA DE NASCIMENTO\b|\bNASCIDO\(?A?\)? EM\b|\bNASCIMENTO\b/],
  ['estadoCivil', /\bESTADO CIVIL\b/],
  ['sexo', /\bSEXO\b/],
  ['altura', /\bALTURA(?:\s*\(M\))?/],
  ['residencia', /\bRESIDENCIA\b|\bRESIDENTE EM\b/],
  ['emitidoEm', /\bEMITIDO EM\b|\bDATA DE EMISSAO\b|\bEMISSAO\b/],
  ['validoAte', /\bVALIDO ATE\b|\bDATA DE VALIDADE\b|\bVALIDADE\b|\bATE\s*:/],
  ['stop', /\bBILHETE DE IDENTIDADE\b(?:\s+N[º°O0]?\s*:?)?/],
  ['stop', /\bASSINATURA DO TITULAR\b/],
  ['stop', /\bDIRECTOR NACIONAL(?: DE IDENTIFICACAO)?\b/],
  ['stop', /\bCIDADAO NACIONAL\b/],
  ['stop', /\bREPUBLICA DE ANGOLA\b/],
];

export const FRONT_FIELDS: BIFieldKey[] = ['numero', 'nome', 'filiacao'];
export const BACK_FIELDS: BIFieldKey[] = [
  'residencia', 'naturalDe', 'provincia', 'dataNascimento', 'sexo', 'altura', 'estadoCivil', 'emitidoEm', 'validoAte',
];
export const ALL_FIELDS: BIFieldKey[] = [...FRONT_FIELDS, ...BACK_FIELDS];

export const MARKERS = {
  header: ['REPUBLICA DE ANGOLA', 'BILHETE DE IDENTIDADE', 'CIDADAO NACIONAL'],
  front: ['NOME COMPLETO', 'FILIACAO', 'ASSINATURA DO TITULAR'],
  back: [
    'RESIDENCIA', 'NATURAL DE', 'PROVINCIA DE', 'DATA DE NASCIMENTO', 'SEXO', 'ALTURA',
    'ESTADO CIVIL', 'EMITIDO EM', 'VALIDO ATE', 'DIRECTOR NACIONAL DE IDENTIFICACAO',
  ],
};

const build = (names: string[], extra: Record<string, string> = {}) => {
  const t: Record<string, string> = {};
  for (const n of names) t[matchText(n)] = n;
  return { ...t, ...extra };
};

export const PROVINCIAS = build(
  [
    'Bengo', 'Benguela', 'Bié', 'Cabinda', 'Cuando', 'Cubango', 'Cuanza Norte', 'Cuanza Sul',
    'Cunene', 'Huambo', 'Huíla', 'Icolo e Bengo', 'Luanda', 'Lunda Norte', 'Lunda Sul',
    'Malanje', 'Moxico', 'Moxico Leste', 'Namibe', 'Uíge', 'Zaire', 'Cuando Cubango',
  ],
  { 'KWANZA NORTE': 'Cuanza Norte', 'KWANZA SUL': 'Cuanza Sul' }
);

export const ESTADOS_CIVIS: Record<string, string> = {
  SOLTEIRO: 'SOLTEIRO', SOLTEIRA: 'SOLTEIRO',
  CASADO: 'CASADO', CASADA: 'CASADO',
  DIVORCIADO: 'DIVORCIADO', DIVORCIADA: 'DIVORCIADO',
  VIUVO: 'VIUVO', VIUVA: 'VIUVO',
  'UNIAO DE FACTO': 'UNIAO_DE_FACTO',
};
export const SEXOS: Record<string, 'M' | 'F'> = { M: 'M', MASCULINO: 'M', F: 'F', FEMININO: 'F' };

export function isValidNumeroBI(value: string): boolean {
  return BI_NUMBER_RE.test(value.replace(/\s/g, '').toUpperCase());
}
