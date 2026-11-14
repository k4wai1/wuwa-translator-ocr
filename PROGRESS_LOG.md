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
- ONNX Runtime Web empaquetado por Vite (`onnxruntime-web/wasm`): el `.wasm` se emite
  como asset con hash y se sirve desde el propio sitio (sin CDN).
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

## Fase 3 · Selección de modelo según el hardware (completada)

Hardware medido: **Intel Celeron 847 @ 1.10 GHz, 2 núcleos, 3.7 GB RAM, sin GPU y sin
AVX/AVX2/FMA** (solo SSE2/SSE4.2). `onnxruntime` y `torch` funcionan, pero la CPU es muy
lenta para convoluciones modernas.

- Benchmark YOLOv8n @ 320 px, batch 8: **~12 s/lote** de entrenamiento y **~0.53 s/imagen**
  en validación. Un run de 30 épocas sobre 2.400 imágenes tardaría días.
- Se intentó una CNN con convoluciones depthwise-separables: 47 k parámetros pero
  **~10 s/lote** por ineficiencia de las depthwise en esta CPU.
- Solución: **SolarisCharNet**, detector anchor-free con convoluciones densas
  (16→32→48 canales, stride 4, heatmap de centros + 45 clases + caja).
  - ~21.5 k parámetros, ~100 KB en FP32.
  - Benchmark: **~1.0 s/lote** a 192 px, batch 16 (≈10× más rápido que YOLOv8n).
  - Dataset específico `--profile micro` 192×192 con glifos grandes (12–22 % del lado).
- Se conservan `train_yolo.py` / `export_onnx.py` como alternativa reproducible en
  hardware con GPU, tal como pide la especificación.
- Incidencia resuelta: `polars` 2.0 lanzaba SIGILL en este CPU sin AVX; se instaló
  `polars[rtcompat]`.
- Incidencia resuelta: `data.yaml` usaba `path: .`, que Ultralytics resolvía contra el CWD.
  Ahora el generador escribe la ruta absoluta del dataset.

## Fase 4 · Entrenamiento y resultados (completada, presupuesto limitado)

- Dataset micro: 1.800 train / 250 val, 192×192, glifos grandes.
- Detector SolarisCharNet: 21.506 parámetros, 85 KB ONNX.
- Entrenamiento detenido en la época 18 de 30 por presupuesto de CPU (el mAP seguía
  subiendo). Mejor checkpoint validado: **mAP50 = 0.3008**, P = 0.17, R = 0.42.
- Clasificador de glifos de segunda etapa: 24×24, 311 KB ONNX, **val acc = 0.7939**.
- Pipeline detector + clasificador sobre 150 imágenes val (conf 0.05):
  **mAP50 = 0.2931**, recall@0.5 = **0.5089**.
- Inferencia en navegador (modelo epoch 1 de prueba): ~200–330 ms por recorte en el
  Celeron, incluyendo carga inicial del runtime WASM.
- Limitación documentada: el modelo es un prototipo funcional; con más épocas o una GPU
  el mAP debería subir. El teclado visual y la heurística A/. cubren los glifos dudosos.

## Fase 5 · Web, pruebas y despliegue (completada)

- UI verificada con MCP de navegador: consola limpia, modo oscuro/claro, viewports
  375×812 y 1440×900, recortador, CLAHE/umbral, editor sincronizado y flujo de escaneo.
- Build de producción con Vite: runtime WASM emitido como asset local (sin CDN) y ambos
  modelos ONNX servidos desde `public/models`.
- `HashRouter` + base `/wuwa-translator-ocr/` para GitHub Pages; workflow de Actions listo.
- Repositorio preparado con commits atómicos y documentación (`README.md`, `AGENTS.md`).
- Demo pública desplegada: https://k4wai1.github.io/wuwa-translator-ocr/
- Se añadieron dos muestras sintéticas (`demo-cafe.jpg`, `demo-light.jpg`) generadas con la
  fuente oficial para probar el escáner sin depender de una captura externa.
- Validación del pipeline completa en Python: detector + clasificador + NMS. La lectura
  sobre las muestras sintéticas recupera los glifos principales; las capturas reales
  requieren recorte ajustado y contraste.
