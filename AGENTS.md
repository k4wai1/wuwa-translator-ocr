# AGENTS.md — Reglas del proyecto `wuwa-translator-ocr`

Actúa como Ingeniero Senior Full-Stack (React) y Especialista en Computer Vision.

## Objetivo

Aplicación web 100% client-side (GitHub Pages) que escanea y traduce el alfabeto
**Solaris-3 Script** de *Wuthering Waves* con un detector YOLOv8n/v11n exportado a ONNX y
ejecutado con `onnxruntime-web`.

## Reglas estrictas

1. **Gestor de paquetes:** usar **exclusivamente `pnpm`**. Prohibido `npm` o `yarn`.
2. **Fuente y datos:** solo `./Solaris-3 Script.ttf` y `./Ejemplos/` (validación visual,
   pruebas y galería).
3. **Prohibido entrenar o validar con `./Otros/`** (`Lahairoi`, `Raguna`, `beta-ver.gif`).
   Solo puede mostrarse en la sección informativa de variantes del lore.
4. **Documentación viva:** actualizar `PROGRESS_LOG.md` tras cada fase con acciones,
   métricas y problemas resueltos.
5. **Git:** commits atómicos y descriptivos. Despliegue en GitHub Pages mediante Actions.
6. **Verificación con MCP de navegador:** abrir la web en `pnpm dev`, revisar consola,
   cambiar tema claro/oscuro, probar viewports 375×812 y 1440×900, el editor
   autosincronizado y un escaneo con una imagen de `./Ejemplos/`.

## Alfabeto (45 clases únicas)

- Letras: `A-Z` (26). Las minúsculas usan los mismos glifos.
- Números: `0-9` (10).
- Signos: `(`, `)`, `,`, `-`, `/`, `:`, `;`, `[`, `]` (9).
- **El punto `.` es visualmente idéntico a `A`**: una sola clase `A` + heurística en JS.
- **No hay llaves** `{` `}`: los signos tras la `Z` mayúscula son corchetes `[` `]`.

## Orden de clases del modelo

```
A B C D E F G H I J K L M N O P Q R S T U V W X Y Z
0 1 2 3 4 5 6 7 8 9
( ) , - / : ; [ ]
```

Este orden es compartido por `scripts/generate_dataset.py` y `src/lib/classes.ts`.

## Modelo desplegado

El hardware de entrenamiento es un Celeron sin AVX; YOLOv8n tarda ~12 s por lote y hace
inviable un entrenamiento completo. El modelo que se despliega es **SolarisCharNet**
(CNN densa anchor-free, ~21 k parámetros, salida `[1, 50, 48, 48]`, stride 4). Los scripts
YOLO permanecen como alternativa para hardware con GPU. Ver `PROGRESS_LOG.md`.

## Internacionalización (10 idiomas, inglés por defecto)

- La web está disponible en `en, es, ja, zh, hi, fr, ar, bn, pt, ru`; **inglés por defecto**
  salvo que el usuario tenga otro idioma en `localStorage.getItem("wuwa-ocr-lang")`.
- `src/locales/en.json` es la fuente de verdad (claves planas). Toda cadena visible debe
  pasar por `t("clave")` de `src/lib/i18n.tsx`; prohibido hardcodear texto de UI.
- Cualquier cambio de textos debe replicarse en **los 10** JSON con las mismas claves y los
  mismos placeholders `{...}`.
- Antes de commitear: `pnpm i18n:check` (también corre en `prebuild`), `pnpm build`,
  revisión con MCP de navegador (inglés por defecto, cambio de idioma, RTL en árabe) y
  `git push origin main`.
- Skill detallada: `.opencode/skills/i18n-parity/SKILL.md`.

## Créditos y licencia

- Autor y desarrollador: **Luis (@k4wai1)** — https://github.com/k4wai1
- Proyecto **100% Open Source** bajo **licencia MIT** (`LICENSE`).
- Stack: React 19 · TypeScript · Vite · TailwindCSS · PyTorch (SolarisCharNet + GlyphNet) ·
  ONNX Runtime Web (WASM) · HTML5 Canvas.
