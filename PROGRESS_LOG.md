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

## Fase 6 · Corrección del motor (parcial)

- Se activó el tiling para recortes grandes (máx. 24 tiles, solape 28%), se corrigió el
  botón "Gris + CLAHE" para activar CLAHE y se fusionó la confianza detector×clasificador.
- Detector v2: 2 bloques residuales dilatados (RF ≈ 55 px), 67.970 parámetros.
  Dataset micro regenerado con marcos de UI, distractores sin etiqueta y rechazo de
  umbrales saturados. Mejor val: **mAP50 0.7483**, P 0.497, R 0.797 (época 16).
- Clasificador: 79.4 % val (modelo 24×24) para identidad de glifos.
- **Limitación pendiente:** en capturas reales (photo_3, póster) el detector todavía
  produce falsos positivos en bordes de paneles y no generaliza del todo. Se necesita
  etiquetado real o fine-tuning con GPU; el recorte ajustado + "Ampliar 2×" mejora el
  resultado, pero no lo garantiza.

## Fase 7 · Reingeniería del motor (2026-11-16)

### Dataset
- Generador reescrito: rotación ±4° (50 % a 0°), jitter ≤ 0.015, glifos de 24–48 px
  (70 %) y 14–22 px (30 %), **sin** Otsu/adaptive/Sobel, contraste de luminancia
  garantizado ≥ 22/255, fondos reales de `Ejemplos/` con blur 4.5–8, distractores
  de UI sin etiqueta y 50 % de líneas desde un mazo balanceado de las 45 clases.
- Local: 3 900 imágenes / 28 564 cajas, 0 vacías, 45/45 clases (364–1486 por clase).
- Kaggle: 12 000 train / 1 500 val.

### Modelos
| Modelo | Config | Métrica |
|---|---|---|
| Detector | `width=64`, 118 633 params, 465 KB | mAP50 **0.9714** (val Kaggle), **0.9672** ONNX local |
| Clasificador | 32×32, 46 clases (45 = ruido) | val_acc **0.9886** (Kaggle) / 0.9804 (local) |

### Pipeline navegador
- `letterbox` ya no amplía; normalización por ventana de 192 px (CLAHE 2.2 + p2..p98).
- Barrido a escala nativa (más 1.5× en recortes pequeños), ventanas con solape 80 px.
- NMS agnóstico 0.40, dedup entre ventanas, rechazo de cajas con aspecto > 2.
- Filtros manuales (`threshold`/`edges`/`invert`) ya no se re-normalizan.
- `cache: no-cache` en los fetch de modelos (evita servir ONNX viejos).

### Holdout_5 (ciego, nunca usado en entrenamiento)
- `test_01`: "STAY TUNED" (línea inferior) + ruido de fondo.
- `test_02`: "STAY TUNED" ×2.
- `test_03`: "NEW RESONATOR".
- `test_04`: glifos de otra variante del lore (fuera de las 45 clases).
- `test_05`: "STAY TUNED" repetido en las etiquetas del inventario.

### Fix de paridad clasificador (wasm ↔ Python)
Eran **dos** bugs en `classifyDetections`, no una diferencia de backend:
1. **Percentiles sobre el tamaño equivocado**: el recorte se renderiza a 64×64
   (`W`) y se reduce a 32×32 (`S`), pero el histograma se indexaba con
   `S*S*q` en vez de `W*W*q`. p5/p95 caían en los percentiles 1.25 %/23.4 %,
   saturando el parche.
2. **Layout del tensor**: con el batch fijo de 16 el buffer se rellenaba como
   `[C, N, H, W]` (`base = i*S*S`, canales a `BATCH*S*S`) pero se declaraba
   `[N, 3, S, S]`. Con `N = 1` ambos layouts coinciden, por eso el bug solo
   aparecía con ≥ 2 glifos. Ahora `base = i*3*S*S` y canales a `+S*S`, `+2*S*S`.

Tras el fix el navegador decodifica **SHOP** (S 0.81, P 0.76, H 0.90, O 0.57;
conf. media 77 %), **CAFE TEA** (93 %) y la clase del clasificador vuelve a
mandar sobre la del detector, con rechazo de la clase 45.

### test_04: fuera de alcance (no es un problema de color)
Medido: `mean` de luminancia 115 (no es un fondo blanco), `std` luma 58.4 vs
`min(R,G,B)` 54.2 → el canal cromático **no** aporta contraste (ratio 0.93).
El recorte de los botones es perfectamente legible tras CLAHE y el detector
coloca cajas sobre los glifos. Lo que falla es la forma de los glifos: al
renderizar `VIEW NOTES` con `Solaris-3 Script.ttf` y compararlo con la captura,
las formas no coinciden (la UI usa otra variante del lore — trazos tipo
Lahaï-Roi: `S` con bandera, `O` con barra, `V` en Z). Esas clases no existen en
las 45 del modelo y `Otros/` está prohibido para entrenar (AGENTS.md), así que
`test_04` queda documentado como limitación, sin tocar el pipeline.

### Holdout_5 final (conf 0.45, modelo desplegado)
| Imagen | Lectura |
|---|---|
| test_01 | `STAY TUNED` (línea inferior) |
| test_02 | `STAY TUNED` ×2 |
| test_03 | `N E W R E S O N A T O R` |
| test_04 | variante distinta, no decodificable |
| test_05 | `STAY TUNED` repetido |
