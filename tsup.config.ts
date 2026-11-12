import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts', text: 'src/text.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  shims: true,
  external: ['sharp', 'tesseract.js'],
});
