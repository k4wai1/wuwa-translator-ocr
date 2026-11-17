const BASE = import.meta.env.BASE_URL;

export interface ExampleImage {
  id: string;
  src: string;
  titleKey: string;
  noteKey: string;
  tag: "captura" | "letrero" | "livestream" | "alfabeto";
}

export const EXAMPLE_IMAGES: ExampleImage[] = [
  {
    id: "demo-shop",
    src: `${BASE}examples/demo-shop.jpg`,
    titleKey: "example.demoShop.title",
    noteKey: "example.demoShop.note",
    tag: "captura",
  },
  {
    id: "demo-cafe",
    src: `${BASE}examples/demo-cafe.jpg`,
    titleKey: "example.demoCafe.title",
    noteKey: "example.demoCafe.note",
    tag: "captura",
  },
  {
    id: "demo-light",
    src: `${BASE}examples/demo-light.jpg`,
    titleKey: "example.demoLight.title",
    noteKey: "example.demoLight.note",
    tag: "captura",
  },
  {
    id: "decoding",
    src: `${BASE}examples/decoding.jpg`,
    titleKey: "example.decoding.title",
    noteKey: "example.decoding.note",
    tag: "letrero",
  },
  {
    id: "decoding-1",
    src: `${BASE}examples/decoding-1.jpg`,
    titleKey: "example.decoding1.title",
    noteKey: "example.decoding1.note",
    tag: "captura",
  },
  {
    id: "decoding-2",
    src: `${BASE}examples/decoding-2.jpg`,
    titleKey: "example.decoding2.title",
    noteKey: "example.decoding2.note",
    tag: "letrero",
  },
  {
    id: "kuro",
    src: `${BASE}examples/kuro-script.jpg`,
    titleKey: "example.kuro.title",
    noteKey: "example.kuro.note",
    tag: "captura",
  },
  {
    id: "poster",
    src: `${BASE}examples/alphabet-poster.jpg`,
    titleKey: "example.poster.title",
    noteKey: "example.poster.note",
    tag: "alfabeto",
  },
  {
    id: "latest",
    src: `${BASE}examples/latest.webp`,
    titleKey: "example.latest.title",
    noteKey: "example.latest.note",
    tag: "captura",
  },
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `live-${i + 1}`,
    src: `${BASE}examples/livestream/photo_${i + 1}_2026-11-13_19-04-12.jpg`,
    titleKey: "example.live.title",
    noteKey: "example.live.note",
    tag: "livestream" as const,
  })),
];

export const LIVESTREAM_IMAGES = EXAMPLE_IMAGES.filter((e) => e.tag === "livestream");

export const VARIANT_IMAGES = [
  {
    src: `${BASE}examples/variants/Lahairoi.jpg`,
    titleKey: "variant.lahairoi.title",
    noteKey: "variant.lahairoi.note",
  },
  {
    src: `${BASE}examples/variants/Lahairoi1.png`,
    titleKey: "variant.lahairoiSample.title",
    noteKey: "variant.lahairoiSample.note",
  },
  {
    src: `${BASE}examples/variants/Raguna.jpg`,
    titleKey: "variant.raguna.title",
    noteKey: "variant.raguna.note",
  },
  {
    src: `${BASE}examples/variants/beta-ver.gif`,
    titleKey: "variant.beta.title",
    noteKey: "variant.beta.note",
  },
];
