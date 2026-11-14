/*
 * Responsabilidade: avaliar geometria e qualidade básica da imagem.
 * Conteúdo: proporção do cartão, resolução mínima e heurística de nitidez.
 * Pontos importantes: produz avisos e ajusta confiança; não rejeita por si só.
 */
import type { ImageInfo } from '../../core/image-processing/preprocess';
import { CARD_RATIO } from './bi-layout';
import type { GeometryResult, Issue } from './types';

const TOL = 0.15;
const MIN_WIDTH = 500;
const BLURRY_BELOW = 800;

export function verifyGeometry(info: ImageInfo): GeometryResult {
  const ratio = info.width / info.height;
  const near = (target: number) => Math.abs(ratio - target) / target <= TOL;
  const layout = near(CARD_RATIO) ? 'single-card' : near(CARD_RATIO / 2) ? 'two-sides-stacked' : 'unknown';

  const issues: Issue[] = [];
  let score = 1;
  const warn = (code: string, message: string, penalty: number) => {
    issues.push({ field: 'imagem', code, message, severity: 'warning' });
    score -= penalty;
  };
  if (layout === 'unknown')
    warn('aspect_ratio', `proporção ${ratio.toFixed(2)} não corresponde a um cartão ou a dois lados empilhados (recorte/rotação?)`, 0.3);
  if (info.width < MIN_WIDTH) warn('low_resolution', `largura de ${info.width}px; recomenda-se ≥ ${MIN_WIDTH}px`, 0.15);
  if (info.sharpness < BLURRY_BELOW) warn('blurry', 'imagem possivelmente desfocada', 0.3);

  return {
    score: Math.max(0, score), layout, width: info.width, height: info.height,
    aspectRatio: Number(ratio.toFixed(3)), sharpness: info.sharpness, issues,
  };
}
