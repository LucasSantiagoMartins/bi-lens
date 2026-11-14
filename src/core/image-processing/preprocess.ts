/*
 * Responsabilidade: preparar imagens para análise e OCR.
 * Conteúdo: orientação EXIF, métricas, detecção de lados empilhados e recortes.
 * Pontos importantes: regras de classificação e campos ficam nos módulos do BI.
 */
export type ImageInput = Buffer | Uint8Array | string;

async function loadSharp(): Promise<any> {
  const m: any = await import('sharp');
  return m.default ?? m;
}

export interface ImageInfo {
  width: number;
  height: number;
  sharpness: number;
}

export interface ImageRegion { left: number; top: number; width: number; height: number }

export async function detectHorizontalDocumentRegions(buffer: Buffer, info: ImageInfo): Promise<ImageRegion[]> {
  if (info.height < info.width * 1.2) return [];
  const sharp = await loadSharp();
  const analysisWidth = Math.min(480, info.width);
  const { data, info: small } = await sharp(buffer).resize({ width: analysisWidth }).greyscale()
    .raw().toBuffer({ resolveWithObject: true });
  const activity = Array.from({ length: small.height }, (_, y) => {
    let dark = 0;
    for (let x = 0; x < small.width; x++) if (data[y * small.width + x] < 125) dark++;
    return dark / small.width;
  });
  const smooth = activity.map((_, y) => {
    const from = Math.max(0, y - 2), to = Math.min(activity.length, y + 3);
    return activity.slice(from, to).reduce((sum, value) => sum + value, 0) / (to - from);
  });
  const threshold = 0.022;
  const maxGap = Math.ceil(small.height * 0.025);
  const candidates: Array<[number, number]> = [];
  let start = -1, last = -1;
  for (let y = 0; y < smooth.length; y++) {
    if (smooth[y] >= threshold) {
      if (start < 0) start = y;
      if (last >= 0 && y - last > maxGap) {
        candidates.push([start, last + 1]);
        start = y;
      }
      last = y;
    }
  }
  if (start >= 0) candidates.push([start, last + 1]);

  const scale = info.width / small.width;
  const minHeight = small.height * 0.12, maxHeight = small.height * 0.46;
  return candidates.filter(([a, b]) => b - a >= minHeight && b - a <= maxHeight)
    .map(([a, b]) => {
      const pad = Math.max(4, Math.round((b - a) * 0.08));
      const top = Math.max(0, Math.floor((a - pad) * scale));
      const bottom = Math.min(info.height, Math.ceil((b + pad) * scale));
      return { left: 0, top, width: info.width, height: bottom - top };
    });
}

export async function loadImage(input: ImageInput): Promise<{ buffer: Buffer; info: ImageInfo }> {
  const sharp = await loadSharp();
  const { data, info } = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
  let pipeline = sharp(data).grayscale();
  if (info.width > 800) pipeline = pipeline.resize({ width: 800 });
  const lap = await pipeline
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], scale: 1, offset: 128 })
    .stats();
  const sd: number = lap.channels[0].stdev;
  return { buffer: data, info: { width: info.width, height: info.height, sharpness: Number((sd * sd).toFixed(1)) } };
}

export async function preprocess(buffer: Buffer, opts: { width: number }): Promise<Buffer> {
  const sharp = await loadSharp();
  return sharp(buffer)
    .resize({ width: opts.width, kernel: 'lanczos3' })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

export async function cropImageRegion(buffer: Buffer, region: ImageRegion): Promise<Buffer> {
  const sharp = await loadSharp();
  return sharp(buffer).extract(region).png().toBuffer();
}
