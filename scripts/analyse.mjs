import { createBILens } from 'bi-lens';

/**
 * Ferramenta local para executar a API pública de análise de imagem sobre
 * ficheiros indicados pelo programador. Gere primeiro o pacote com `npm run build`.
 *
 * Utilização:
 *   node scripts/analyse.mjs <imagem>
 *   node scripts/analyse.mjs --front <imagem> --back <imagem>
 *   node scripts/analyse.mjs <imagem> --debug
 *   node scripts/analyse.mjs --front <imagem> --back <imagem> --min-confidence 0.9
 *
 * `--debug` imprime o diagnóstico OCR devolvido pela biblioteca, que pode
 * conter dados pessoais. Use-o apenas com ficheiros que possa inspeccionar.
 * O resumo apresenta classificação, estado, confiança, valores e motivos.
 * Esta ferramenta apoia a análise manual; expectativas automatizadas pertencem
 * à suite de testes.
 */
function parseArguments(args) {
  const options = { debug: false, minConfidence: 0.85 };
  const files = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--debug') options.debug = true;
    else if (arg === '--min-confidence') {
      const value = Number(args[++index]);
      if (!Number.isFinite(value) || value < 0 || value > 1)
        throw new Error('--min-confidence deve ser um número entre 0 e 1.');
      options.minConfidence = value;
    } else if (arg === '--front' || arg === '--back') {
      const path = args[++index];
      if (!path || path.startsWith('--')) throw new Error(`Indique o ficheiro após ${arg}.`);
      options[arg.slice(2)] = path;
    } else if (arg.startsWith('-')) throw new Error(`Opção desconhecida: ${arg}`);
    else files.push(arg);
  }

  if (options.front || options.back) {
    if (files.length) throw new Error('Não misture ficheiros posicionais com --front/--back.');
    options.input = { ...(options.front ? { front: options.front } : {}), ...(options.back ? { back: options.back } : {}) };
  } else {
    if (files.length !== 1) throw new Error('Indique um ficheiro de imagem.');
    options.input = files[0];
  }
  return options;
}

const usage = `Uso:
  node scripts/analyse.mjs <imagem> [--debug] [--min-confidence <0..1>]
  node scripts/analyse.mjs --front <imagem> [--back <imagem>] [--debug] [--min-confidence <0..1>]

Exemplos:
  node scripts/analyse.mjs ./documento.jpg
  node scripts/analyse.mjs --front ./frente.jpg --back ./verso.jpg --debug`;

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  console.error(usage);
  process.exitCode = 2;
}

if (options?.help) console.log(usage);
else if (options?.input) {
  const lens = createBILens({ minConfidence: options.minConfidence });
  try {
    const result = await lens.analyze(options.input, { debug: options.debug });
    console.log(`Documento: ${result.isBI ? 'BI angolano reconhecido' : 'não reconhecido como BI angolano'}`);
    console.log(`Lados: ${result.sides}`);
    console.log(`Decisão: ${result.status} (confiança ${result.confidence.toFixed(2)})`);
    console.log('Valores:', result.values);
    if (result.reasons.length) console.log('Motivos:', result.reasons);
    if (options.debug) console.dir(result.debug, { depth: null });
  } finally {
    await lens.close();
  }
}
