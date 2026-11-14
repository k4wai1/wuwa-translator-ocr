const BASE = import.meta.env.BASE_URL;

export interface ExampleImage {
  id: string;
  src: string;
  title: string;
  note: string;
  tag: "captura" | "letrero" | "livestream" | "alfabeto";
}

export const EXAMPLE_IMAGES: ExampleImage[] = [
  {
    id: "demo-shop",
    src: `${BASE}examples/demo-shop.jpg`,
    title: "Demo sintética · SHOP",
    note: "Muestra del dataset que el modelo lee al 100%: ideal para verificar el escáner.",
    tag: "captura",
  },
  {
    id: "demo-cafe",
    src: `${BASE}examples/demo-cafe.jpg`,
    title: "Demo sintética · CAFE TEA",
    note: "Imagen generada con la fuente oficial: ideal para probar el escáner.",
    tag: "captura",
  },
  {
    id: "demo-light",
    src: `${BASE}examples/demo-light.jpg`,
    title: "Demo sintética · SOLARIS 3",
    note: "Prueba en fondo claro para el pre-procesado.",
    tag: "captura",
  },
  {
    id: "decoding",
    src: `${BASE}examples/decoding.jpg`,
    title: "Cartel CAFE / TEA",
    note: "Menús y letreros del mundo con la fuente Solaris-3.",
    tag: "letrero",
  },
  {
    id: "decoding-1",
    src: `${BASE}examples/decoding-1.jpg`,
    title: "HECATE · Wuthering Waves",
    note: "Captura comparativa con la traducción al inglés.",
    tag: "captura",
  },
  {
    id: "decoding-2",
    src: `${BASE}examples/decoding-2.jpg`,
    title: "Letreros de Jinzhou",
    note: "Texto sobre fondos claros y paneles de UI.",
    tag: "letrero",
  },
  {
    id: "kuro",
    src: `${BASE}examples/kuro-script.jpg`,
    title: "Script de Kuro Games",
    note: "Ejemplo oficial de la caligrafía del juego.",
    tag: "captura",
  },
  {
    id: "poster",
    src: `${BASE}examples/alphabet-poster.jpg`,
    title: "Poster del alfabeto",
    note: "Referencia visual A-Z para traducción manual.",
    tag: "alfabeto",
  },
  {
    id: "latest",
    src: `${BASE}examples/latest.webp`,
    title: "Latest · UI de juego",
    note: "Captura reciente con texto en perspectiva.",
    tag: "captura",
  },
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `live-${i + 1}`,
    src: `${BASE}examples/livestream/photo_${i + 1}_2026-11-13_19-04-12.jpg`,
    title: `Livestream · frame ${i + 1}`,
    note: "Prueba de estrés: partículas, brillos y UI semitransparente.",
    tag: "livestream" as const,
  })),
];

export const LIVESTREAM_IMAGES = EXAMPLE_IMAGES.filter((e) => e.tag === "livestream");

export const VARIANT_IMAGES = [
  {
    src: `${BASE}examples/variants/Lahairoi.jpg`,
    title: "Lahairoi",
    note: "Variante cursiva de otra región. No forma parte del alfabeto Solaris-3 soportado.",
  },
  {
    src: `${BASE}examples/variants/Lahairoi1.png`,
    title: "Lahairoi · muestra",
    note: "Trazo continuo y ligaduras; el OCR estándar no está entrenado para esta variante.",
  },
  {
    src: `${BASE}examples/variants/Raguna.jpg`,
    title: "Raguna",
    note: "Caligrafía regional alternativa. Se muestra solo como referencia del lore.",
  },
  {
    src: `${BASE}examples/variants/beta-ver.gif`,
    title: "Beta ver.",
    note: "Comparativa de una versión beta de la fuente. No se usa para entrenamiento.",
  },
];
