# WuWa Translator OCR — Solaris-3 Alphabet Decoder

Aplicación web **100% client-side** para escanear y traducir el alfabeto **Solaris-3** de
*Wuthering Waves*. El detector (YOLOv8n exportado a ONNX) se ejecuta en el navegador con
`onnxruntime-web`; ninguna captura sale del dispositivo.

**Keywords:** Wuthering Waves Translator · WuWa OCR · Solaris-3 Alphabet Decoder · WuWa Font Scanner

## Características

- **Escáner OCR** con carga por archivo, cámara, `Ctrl+V` o arrastrar y soltar.
- **Recortador táctil** con tiradores, regla de tercios y ajuste por teclado.
- **Pre-procesado interactivo**: brillo/contraste, CLAHE, umbral adaptativo, inversión,
  Sobel, enfoque y auto-mejora según el histograma.
- **Inferencia local** con YOLOv8n → ONNX, NMS, agrupación por líneas y reconstrucción de
  espacios. Cajas y letras dibujadas sobre la captura.
- **Heurística A / punto**: la fuente dibuja `A`, `a` y `.` con el mismo glifo; el
  post-procesado decide cuándo es punto según el contexto.
- **Traductor manual bidireccional** con renderizado en la fuente oficial, teclado visual
  de 45 glifos, copia y descarga en PNG.
- **Tabla del alfabeto** completa y galería de capturas reales (incluye 15 frames de
  livestream como test set de estrés).
- **Modo claro / oscuro** con estética Terminal Pangu, responsive móvil y escritorio.

## Stack

| Capa | Tecnología |
| --- | --- |
| Web | Vite 8 + React 19 + TypeScript + TailwindCSS 4 |
| Router | `HashRouter` (compatible con GitHub Pages) |
| IA | Ultralytics YOLOv8n → ONNX + ONNX Runtime Web (WASM) |
| Dataset | Python + Pillow + OpenCV + NumPy (síntesis con la fuente oficial) |
| Paquetes | **pnpm** exclusivamente |

## Inicio rápido

```bash
pnpm install
pnpm dev
```

Abre `http://localhost:5173/wuwa-translator-ocr/`.

> El modelo entrenado se sirve desde `public/models/model.onnx`. Si no existe, la UI lo
> indica y explica cómo generarlo.

## Pipeline de Machine Learning

La fuente oficial `Solaris-3 Script.ttf` se usa para renderizar textos de UI/lore sobre
fondos procedurales con **bajo contraste, gradientes, perspectiva, rotación, desenfoque,
ruido, glow y umbral adaptativo**, generando cajas YOLO exactas por carácter.

```bash
# 1. Dataset sintético (2.400 train / 400 val por defecto)
python3 scripts/generate_dataset.py

# 2. Entrenamiento (CPU-friendly)
python3 scripts/train_yolo.py --epochs 45 --imgsz 416 --batch 8

# 3. Exportación ONNX + cuantización + validación + copia a public/models
python3 scripts/export_onnx.py
```

### Clases (45)

- **Letras (26):** `A-Z` (minúsculas comparten glifo).
- **Números (10):** `0-9`.
- **Signos (9):** `(`, `)`, `,`, `-`, `/`, `:`, `;`, `[`, `]`.
- El **punto** `.` se fusiona con la clase `A` (glifo idéntico).
- La fuente **no incluye llaves** `{` `}`; solo corchetes `[` `]`.

## Estructura

```
├── public/
│   ├── examples/            Capturas reales y frames de livestream
│   ├── fonts/               Solaris-3-Script.ttf
│   ├── models/              model.onnx (generado)
│   └── ort/                 Runtime WASM de ONNX Runtime
├── scripts/
│   ├── generate_dataset.py
│   ├── train_yolo.py
│   ├── export_onnx.py
│   └── copy-ort.mjs
├── src/
│   ├── components/          UI (Cropper, FilterPanel, ScanResult…)
│   ├── lib/                 OCR, preprocesado, reconstrucción, glifos
│   └── pages/               Escáner, Traductor, Alfabeto, Variantes
├── training/                Dataset generado + runs (ignorados por git)
├── PROGRESS_LOG.md
└── AGENTS.md
```

## Despliegue en GitHub Pages

El workflow `.github/workflows/deploy.yml` compila con pnpm y publica `dist/` mediante
GitHub Actions. `vite.config.ts` usa `base: "/wuwa-translator-ocr/"` y la app usa
`HashRouter`, por lo que las rutas profundas no producen 404.

## Reglas del dataset

- **Solo** se usa `./Solaris-3 Script.ttf` y capturas de `./Ejemplos/` para validación
  visual y galería.
- **`./Otros/` está prohibido** para entrenamiento y validación (variantes cursivas:
  Lahairoi, Raguna, beta). Solo aparece en la página informativa de variantes.

## Licencia y descargo

Proyecto fan no oficial, sin afiliación con Kuro Games. *Wuthering Waves* y su tipografía
pertenecen a sus respectivos titulares. Código bajo licencia MIT.
