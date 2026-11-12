import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createBILens } from 'bi-lens';

const input = process.argv[2];
if (!input) throw new Error('Uso: node examples/debug.mjs ./caminho/bi.jpg');
const imagePath = resolve(input);
const outputDir = resolve(process.env.BI_DEBUG_DIR ?? './examples/debug-output');
await mkdir(outputDir, { recursive: true });

const lens = createBILens();
try {
  const result = await lens.analyze(imagePath, { debug: true });
  const sharpModule = await import('sharp');
  const sharp = sharpModule.default ?? sharpModule;
  const crops = result.debug?.passes?.[0]?.crops ?? [];
  for (const [index, crop] of crops.entries()) {
    const target = resolve(outputDir, `crop-${index + 1}.jpg`);
    await mkdir(dirname(target), { recursive: true });
    await sharp(imagePath).rotate().extract(crop).jpeg().toFile(target);
  }
  for (const [index, pass] of (result.debug?.passes ?? []).entries())
    await writeFile(resolve(outputDir, `pass-${index + 1}.txt`), pass.text, 'utf8');
  console.log(`Resultado: ${result.isBI ? 'BI' : 'não-BI'}, ${result.status}, confiança ${result.confidence}`);
  console.log(`Marcadores encontrados: ${result.debug?.markers?.found.join(', ') ?? 'nenhum'}`);
  console.log(`Diagnóstico guardado em: ${outputDir}`);
} finally {
  await lens.close();
}
