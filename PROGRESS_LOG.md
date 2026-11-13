# PROGRESS LOG — WuWa Translator OCR

Bitácora viva del proyecto. Cada fase registra acciones, métricas y problemas resueltos.

## Fase 0 · Inspección de la fuente (completada)

- `Solaris-3 Script.ttf`: 14.5 KB, nombre interno `Jiting-sans`, 1000 UPM, 83 codepoints,
  81 glifos.
- Caracteres reales en el `cmap`: espacio, `( ) , - . / : ;`, `0-9`, `A-Z`, `[ ]`, `a-z`,
  versiones fullwidth y `nbsp`.
- **Confirmado:** no existen `{` ni `}` en la fuente. Los glifos posteriores a `Z` son
  `[` y `]`.
- **Confirmado:** `A`, `a` y `.` comparten exactamente el mismo contorno (misma área
  -278971, 20 segmentos). Solo cambia el avance horizontal (759 / 755 / 763 UPM).
  → Se entrena **una sola clase `A`** y se resuelve `.` en post-procesado.
- La coma y el punto y coma se dibujan en la zona superior del glifo (estilo cipher).

## Fase 1 · Andamiaje web (completada)

- Vite 8 + React 19 + TypeScript + TailwindCSS 4, router `HashRouter`.
- `pnpm` estricto (`allowBuilds` para `protobufjs` en `pnpm-workspace.yaml`).
- Base de GitHub Pages: `/wuwa-translator-ocr/`.
- ONNX Runtime Web servido localmente desde `public/ort` (sin CDN). Se usa la build
  "extern wasm" para no empaquetar 30 MB dentro del bundle JS.
- Sistema de diseño Terminal Pangu: obsidiana `#0b0d12`, dorado `#d4b170`, cian
  `#4deeea`, modo claro laboratorio Jinzhou `#f4f3ef`.

## Fase 2 · Dataset sintético (completada)

- Generador: `scripts/generate_dataset.py`.
- 2.400 imágenes train + 400 val; tamaños 512–896 px; 1–3 líneas de texto por imagen.
- Cajas YOLO exactas por carácter calculadas con `font.getbbox(anchor="ls")` y
  transformadas por la homografía global.
- Augmentation: contraste extremo (delta 16–48 sobre el fondo, alfa 0.35–1.0),
  rotación ±25°, perspectiva, blur, ruido, viñeta, glow, partículas de UI, JPEG
  70–95 y un 34 % de imágenes en dominio de preprocesado (gris, Otsu, umbral adaptativo,
  Sobel) para alinear el train con los filtros del navegador.
- Cobertura verificada de las 45 clases (0 clases faltantes) y alineación visual de cajas
  revisada en una cuadrícula de previsualización.

*(Métricas de entrenamiento y despliegue se añaden a continuación.)*
