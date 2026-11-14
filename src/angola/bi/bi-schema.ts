/*
 * Responsabilidade: validar em runtime opções e resultados da análise.
 * Conteúdo: schemas Zod para campos, issues, metadados e configuração.
 * Pontos importantes: limites das opções devem coincidir com os tipos públicos.
 */
import { z } from 'zod';

export const FieldSchema = z.object({
  value: z.unknown(),
  raw: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  valid: z.boolean(),
  corrected: z.boolean(),
  baseConfidence: z.number().min(0).max(1),
  ocrConfidence: z.number().min(0).max(1).nullable(),
  votes: z.number().int().min(0),
  note: z.string().optional(),
});

const Issue = z.object({
  field: z.string(), code: z.string(), message: z.string(), severity: z.enum(['error', 'warning']),
});

export const BIAnalysisSchema = z.object({
  isBI: z.boolean(),
  documentType: z.enum(['ao-bi-card', 'unknown']),
  sides: z.enum(['front', 'back', 'both', 'unknown']),
  status: z.enum(['approved', 'needs_review', 'rejected']),
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  issues: z.array(Issue),
  values: z.object({
    numero: z.string().nullable(), nome: z.string().nullable(), pai: z.string().nullable(), mae: z.string().nullable(),
    dataNascimento: z.string().nullable(), sexo: z.enum(['M', 'F']).nullable(), estadoCivil: z.string().nullable(),
    naturalDe: z.string().nullable(), provincia: z.string().nullable(), residencia: z.string().nullable(),
    altura: z.number().nullable(), emitidoEm: z.string().nullable(), validoAte: z.string().nullable(),
  }),
  data: z.record(z.string(), FieldSchema),
  checks: z.object({ structure: z.object({ score: z.number(), isBI: z.boolean() }).passthrough(), geometry: z.unknown() }),
  meta: z.object({ passes: z.number(), durationMs: z.number().optional(), inputs: z.array(z.object({
    role: z.enum(['front', 'back', 'combined']), sidesDetected: z.enum(['front', 'back', 'both', 'unknown']), durationMs: z.number(),
  })).optional() }),
  debug: z.unknown().optional(),
});

export const LensOptionsSchema = z.object({
  minConfidence: z.number().min(0).max(1).optional(),
  rejectBelow: z.number().min(0).max(1).optional(),
  ocrConfidence: z.number().min(0).max(100).optional(),
  now: z.date().optional(),
  critical: z.array(z.string()).optional(),
  debug: z.boolean().optional(),
  langPath: z.string().optional(),
  passes: z.array(z.object({ width: z.number().int().min(300).max(4000), psm: z.string() })).min(1).max(6).optional(),
  engine: z.custom<object>((v) => typeof v === 'object' && v !== null).optional(),
}).strict();
