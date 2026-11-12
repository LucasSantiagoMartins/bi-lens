# Changelog

## Unreleased

- Reorganized the README and public API comments to describe the current package, its limits and development workflow.
- Moved the generic analysis CLI to `scripts/analyse.mjs` and made all input files explicit command-line arguments.
- Removed bundled/local BI image samples and the regression helper that depended on that private sample set; retained the Portuguese OCR model.

## 0.3.0

- Detects and OCRs separate content bands in portrait photos, improving extraction when the card sides are far apart.
- Retains Tesseract word bounding boxes and exposes coordinate-rebuilt lines in debug output.
- Adds optional debug output and `examples/debug.mjs` for local crop/text inspection.
- Accepts `{ front, back }` and one-sided image inputs; reorders swapped sides and reports duplicate or non-BI inputs.
- Rejects documents carrying explicit non-legal/test disclaimers and reports classification signals.
- Adds `examples/regression.mjs`; local sample images and debug output are excluded from Git.
