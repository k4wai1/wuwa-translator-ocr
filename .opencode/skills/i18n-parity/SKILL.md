---
name: i18n-parity
description: Use whenever adding, editing or removing any user-visible string in the WuWa Translator OCR web app. Keeps the 10 locale dictionaries in sync (keys, placeholders, empty strings) and verifies the build.
---

# i18n parity skill — WuWa Translator OCR

The web UI ships in **10 languages** and defaults to **English** (`en`):

`en, es, ja, zh, hi, fr, ar, bn, pt, ru`

Arabic (`ar`) is right-to-left; `src/lib/i18n.tsx` sets `document.documentElement.dir`
from the locale metadata.

## Where things live

| Path | Purpose |
| --- | --- |
| `src/locales/en.json` | **Source of truth**. Flat keys (`surface.thing`), 2-space JSON. |
| `src/locales/<code>.json` | Translations. Same keys, same order, same placeholders. |
| `src/lib/i18n.tsx` | Provider, `useI18n()`, `t(key, vars)`, lazy per-locale import, `localStorage` key `wuwa-ocr-lang`. |
| `scripts/check_i18n.mjs` | Parity guard: missing/extra keys, empty values, `{placeholder}` mismatches. |

## Rules when editing text

1. Never hardcode user-visible Spanish/English text in a component. Add a key to
   `src/locales/en.json` and call `t("your.key")`.
2. Interpolate with `{name}` placeholders and pass them as
   `t("key", { name: value })`. Placeholder **names must never be translated**.
3. Add the same key to **all 9 other locale files** (same position, same order).
4. Keep brand and technical terms untranslated: `WUWA OCR`, `Solaris-3`,
   `Wuthering Waves`, `ONNX`, `WASM`, `CLAHE`, `PNG`, `GitHub`, `React 19`,
   `TypeScript`, `Vite`, `TailwindCSS`, `PyTorch`, `HTML5 Canvas`, `Lahairoi`,
   `Raguna`, `Kuro Games`.
5. Glyph letters `A-Z`, digits and punctuation `( ) , - / : ; [ ]` stay as-is.

## Verification (mandatory before commit)

```bash
pnpm i18n:check     # parity across the 10 locales (also runs via prebuild)
pnpm build          # tsc --noEmit + vite build
```

Then open the app with the browser MCP and check:

- the page loads in **English** by default and the header selector switches locale;
- switching to `ar` flips the layout to RTL;
- no missing-key text (`common.…`-style keys leaking into the DOM) and no console errors.

Finish with an atomic commit and `git push origin main` (GitHub Pages deploys from `main`).
