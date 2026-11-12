# Engineering Guide for BI Lens

These instructions apply to the entire repository. There are no module-specific instruction files; keep shared conventions consistent unless a real boundary requires otherwise.

## Project at a glance

BI Lens is a TypeScript library for analyzing images and OCR text from recent Angolan Bilhetes de Identidade. Its package entry points are `.` and `./text`, declared in `package.json`. The text entry point avoids loading `sharp` and Tesseract.js. The package does not currently provide generic document support, document authenticity verification, facial matching, or storage adapters.

The README is the user-facing guide. The changelog records release and maintenance changes. `scripts/analyse.mjs` and `examples/debug.mjs` are developer tools, not alternate library APIs.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | Main public exports for image and text analysis |
| `src/text.ts` | Public text-only exports |
| `src/angola/bi/` | BI-specific layout, parsing, validation, options, result types, and orchestration |
| `src/core/image-processing/` | Image loading, EXIF orientation, quality metrics, region detection, and preprocessing through `sharp` |
| `src/core/ocr/` | OCR contracts, Tesseract.js adapter, and OCR word/line structures |
| `src/core/text/` | Text normalization, OCR character correction, date parsing, and edit distance |
| `src/core/classification/` | Shared approximate text matching |
| `assets/por.traineddata` | Bundled Portuguese Tesseract model |
| `tests/` | Vitest tests using synthetic OCR text and word coordinates |
| `scripts/analyse.mjs` | CLI for manually analyzing developer-supplied images |
| `examples/debug.mjs` | Local OCR/crop diagnostic output |

Keep country- and document-specific rules in `src/angola/bi/`. Put a utility in `src/core/` only when it is genuinely reusable and does not depend on BI fields or rules. Do not add another country or document type by weakening the current BI rules into a generic abstraction without a concrete supported use case.

## Architecture and processing flow

The image path in `createBILens` currently:

1. Loads and EXIF-orients the image through `sharp`, retaining a buffer and measuring dimensions and sharpness.
2. Looks for dense horizontal document bands in portrait images; when at least two are found, OCR uses those regions.
3. Applies the configured preprocessing and runs the configured OCR passes (three scales by default) through `OcrEngine`.
4. Parses each pass into fields, using word coordinates where available, then merges readings and resolves validity-date candidates across passes.
5. Classifies BI structure and sides, applies geometry and text checks, and returns a `BIAnalysis` with values, confidence, status, reasons, issues, checks, and metadata.

For separate `{ front, back }` image inputs, each side is analyzed and the results are combined. The text path starts with OCR text and runs the BI-specific parsing and validation stages without image processing or OCR initialization.

Keep these stages focused. Do not duplicate OCR parsing or BI validation in the image adapter, CLI, or examples. Preserve the public result shape and status strings: `approved`, `needs_review`, and `rejected`. Geometry affects confidence; BI-specific structural, field, date, and expiration rules belong in the BI verification layer.

## TypeScript and code conventions

- `tsconfig.json` enables `strict` checking and targets ES2020. Keep new source and tests type-safe.
- Prefer explicit types, discriminated unions, generics, `unknown`, and narrowing. Avoid adding `any`, unchecked casts, or non-null assertions; where interoperability with a dependency requires one, keep it at the adapter boundary and explain it.
- Follow existing names: `camelCase` for values/functions, `PascalCase` for types/interfaces, and uppercase names for module-level constants. Existing BI field identifiers are Portuguese (`validoAte`, `dataNascimento`); preserve those API names.
- Use focused functions and small modules. Prefer plain functions and composition, as the current implementation does; add classes, service layers, or generic frameworks only when they solve a concrete problem.
- Use type-only imports for types where appropriate. Keep implementation dependencies flowing from BI modules to shared core utilities, not from core utilities back into `src/angola/bi/`.
- Match the nearby formatting: two-space indentation, single quotes, and semicolons. There is no configured formatter or linter; do not document or rely on an unconfigured command.
- Add or update TSDoc for public exports and extension contracts. Comments should explain constraints, reasons, or non-obvious behavior, not restate the code. Keep terminology consistent with the surrounding file; user-facing documentation is currently in Portuguese.

## Public API and compatibility

- Treat exports reachable through the package paths in `package.json` as consumer contracts. Internal file paths are not declared package subpaths.
- Prefer additive, backward-compatible changes. If a public type, option, result field, status, or behavior must change, update its TSDoc, README examples, and tests in the same change; call out breaking changes explicitly.
- Validate analyzer options with the existing Zod schema in `src/angola/bi/bi-schema.ts`. Keep defaults and bounds aligned with the public option types.
- `createBILens` lazily creates and reuses its OCR worker. Callers must use `close()` when finished. `analyzeBI` manages its internally created worker for a single call. A caller-supplied `OcrEngine` remains caller-owned and is not terminated by `close()`.
- `LensOptions.engine` is the existing OCR extension point. Preserve `OcrEngine` input/output semantics when adding an adapter.

## BI rules, parsing, and results

- Treat OCR as uncertain evidence. Preserve raw text, correction flags, field validity, confidence, votes, and notes where the current `Field<T>` model supports them.
- Put field extraction in `bi-text-parser.ts`, reusable text normalization in `src/core/text/`, BI layout markers in `bi-layout.ts`, structural classification in `bi-structure-verifier.ts`, and cross-field/business decisions in `bi-text-verifier.ts`.
- Keep validation rules explicit and testable. Use `TextOptions.now` for date-dependent behavior so tests can supply a fixed date. Preserve the existing `issues` and `reasons` conventions and do not silently convert uncertain or missing data into valid values.
- `approved` is an automated processing result, not proof of identity or authenticity. Do not describe the current implementation as detecting fraud, matching a face, or supporting other countries or document formats.
- Facial verification, authenticity analysis, and multi-source document acquisition are roadmap items in `README.md`; do not implement them unless requested.

## Inputs, errors, and privacy

- Image inputs are file-path strings, `Buffer`s, or `Uint8Array`s. The image library currently decodes inputs through `sharp`; invalid or unsupported image errors propagate from the dependency. Do not trust a file extension as proof of content.
- Do not silently swallow errors or log-and-continue after a failed processing stage. Preserve useful dependency context, but avoid adding personal document contents to error messages.
- There is no project-wide custom error hierarchy or explicit file-size/dimension limit today. Do not invent incompatible error handling or arbitrary limits; introduce a limit only with a defined requirement, clear behavior, and tests.
- Identity images, OCR text, field values, and debug output are sensitive. Never add real identity documents to the repository. Use synthetic or appropriately anonymized data in tests, and keep debug output opt-in and out of logs unless the application explicitly requires it.
- Avoid unnecessary image copies and repeated OCR work. The current image path holds buffers in memory and the OCR worker is reusable; do not add a stream/storage abstraction or concurrency layer without a concrete requirement and resource analysis.

## Tests and verification

Tests use Vitest and are included in the TypeScript typecheck. Existing tests cover text-side merging/classification and OCR line/column reconstruction; there is no image fixture suite or dedicated test for every business rule yet.

- Add deterministic tests for changed behavior, including expected and rejected paths, missing/malformed values, boundary dates, and relevant OCR uncertainty.
- Prefer synthetic OCR text and constructed `OcrWord` coordinates over personal images. Keep tests independent of network services and external documents.
- Do not add a new test framework or image fixture dependency when Vitest and pure text tests suffice.
- Run the relevant checks for the change. For changes to analysis behavior or public types, run all three:

```bash
npm test
npm run typecheck
npm run build
```

Other available commands are `npm run analyse -- --help` for CLI usage and `npm run analyse -- <image-path>` for a manual image analysis after building. There is no `lint` script in `package.json`; do not claim lint was run.

## Dependencies, build, and documentation

- Use npm and keep `package-lock.json` in sync when dependencies change. Runtime dependencies are `sharp`, `tesseract.js`, and `zod`; TypeScript, tsup, and Vitest are development dependencies.
- `npm run build` uses tsup to generate ESM, CommonJS, and declarations in ignored `dist/`. `npm run typecheck` runs `tsc --noEmit`.
- Avoid unnecessary dependencies, especially parallel image, OCR, schema, or test libraries. Check runtime compatibility and package impact before proposing a dependency.
- Update `README.md` when supported behavior, options, result fields, commands, requirements, or limitations change. Keep examples consistent with the package exports and scripts. Update `CHANGELOG.md` when the change merits a release or maintenance entry; follow its existing format.

## Workflow for changes

1. Read the relevant public API, implementation, tests, and README before editing.
2. Identify whether the change is shared infrastructure or BI-specific; keep it in the corresponding module.
3. Make the smallest implementation change that fits existing contracts.
4. Add deterministic tests for behavior changes and update public documentation when needed.
5. Run the relevant test, typecheck, and build commands; report checks that could not run and why.
6. Review the final diff for accidental API changes, sensitive data, stale documentation, and unnecessary dependencies.
