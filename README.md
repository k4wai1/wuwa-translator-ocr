# WuWa Translator OCR — Solaris-3 Alphabet Decoder

Aplicación web **100% client-side** para escanear y traducir el alfabeto **Solaris-3** de
*Wuthering Waves*. El detector (YOLOv8n exportado a ONNX) se ejecuta en el navegador con
`onnxruntime-web`; ninguna captura sale del dispositivo.

**Keywords:** Wuthering Waves Translator · WuWa OCR · Solaris-3 Alphabet Decoder · WuWa Font Scanner

**Demo en vivo:** https://k4wai1.github.io/wuwa-translator-ocr/

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
| IA | SolarisCharNet (CNN detector ligero) → ONNX + ONNX Runtime Web (WASM) |
| Alternativa | YOLOv8n (`scripts/train_yolo.py`) para hardware con GPU |
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

El modelo que se distribuye por defecto es **SolarisCharNet**, un detector CNN
anchor-free de ~21 k parámetros (heatmap de centros a stride 4 + 45 clases + regresión de
caja). Se eligió tras medir el hardware: un Celeron de 2 núcleos sin AVX tarda ~12 s por
lote con YOLOv8n a 320 px, mientras que SolarisCharNet entrena ~10× más rápido y produce
un ONNX de ~100 KB que infiere en el navegador en decenas de milisegundos.

```bash
# 1. Dataset sintético (YOLO, hardware con GPU)
python3 scripts/generate_dataset.py --train 2400 --val 400

# 2A. Modelo ligero que se despliega (CPU)
python3 scripts/generate_dataset.py --profile micro --out training/micro --train 1800 --val 250
python3 scripts/train_chargen.py --epochs 30 --imgsz 192 --batch 16
python3 scripts/export_chargen.py

# 2A-bis. Clasificador de glifos de segunda etapa
python3 scripts/train_classifier.py --epochs 18
cp training/classifier/classifier.onnx public/models/

# 2B. Alternativa YOLOv8n para hardware con GPU
python3 scripts/train_yolo.py --epochs 45 --imgsz 416 --batch 8
python3 scripts/export_onnx.py
```

> En un equipo sin AVX/GPU el entrenamiento completo de YOLOv8n lleva días. Los scripts
> YOLO se conservan para reproducir el pipeline en una máquina con GPU; el modelo
> desplegado y validado aquí es SolarisCharNet.

### Resultados del modelo incluido

| Etapa | Métrica |
| --- | --- |
| Detector (época 18, detenido por CPU) | mAP50 **0.3008** |
| Clasificador de glifos (2.ª etapa) | accuracy **0.7939** |
| Pipeline completo (150 val) | mAP50 **0.2931** · recall@0.5 **0.5089** |
| Tamaño | detector 85 KB + clasificador 311 KB |

El mAP seguía mejorando al detener el entrenamiento; con GPU o más épocas puede subir.
El teclado visual del traductor manual permite corregir glifos dudosos.

### Limitaciones y siguientes pasos

- El detector se entrenó solo con datos sintéticos; en capturas reales conviene recortar
  muy cerca de la línea de texto y usar **Auto-mejorar** o **Umbral**.
- El pipeline es un prototipo funcional (mAP50 ≈ 0.29), no un OCR de producción.
- Siguientes pasos: más épocas/GPU, etiquetado de capturas reales, tiling optimizado para
  recortes grandes y un modelo de lenguaje que corrija la reconstrucción.

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
│   └── ...                  capturas y fuente
├── scripts/
│   ├── generate_dataset.py
│   ├── train_chargen.py     Entrenamiento del modelo desplegado
│   ├── export_chargen.py    Exportación ONNX + validación + instalación
│   ├── chargen.py           Modelo, dataset y decodificación compartidos
│   ├── train_yolo.py        Alternativa YOLOv8n (GPU)
│   └── export_onnx.py
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
