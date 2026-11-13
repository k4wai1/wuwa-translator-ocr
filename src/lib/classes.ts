/**
 * The 45 unique glyph classes of Solaris-3 Script, in the exact index order
 * used by the trained YOLO model.
 *
 * Note: '.' is deliberately merged into class 'A' (index 0). The official font
 * draws 'A', 'a' and '.' with the exact same outline, so splitting them would
 * force the detector to learn an impossible distinction. The web app resolves
 * the ambiguity with a spatial heuristic in `reconstruct.ts`.
 */
export const CLASSES = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."0123456789",
  ..."()-,/:;[]",
] as const;

export type GlyphClass = (typeof CLASSES)[number];

export const PERIOD_MERGED_INTO: GlyphClass = "A";

export const CLASS_TO_INDEX: Record<string, number> = Object.fromEntries(
  CLASSES.map((c, i) => [c, i]),
);

/** Map any supported input character to its detector class index. */
export function classIndexForChar(ch: string): number | null {
  const upper = ch.toUpperCase();
  if (upper === ".") return CLASS_TO_INDEX.A;
  const idx = CLASS_TO_INDEX[upper];
  return idx === undefined ? null : idx;
}

export function charForClassIndex(index: number): string {
  return CLASSES[index] ?? "?";
}

/** Human-friendly names for the visual keyboard / alphabet page. */
export const GLYPH_LABELS: Record<string, string> = {
  "(": "Paréntesis izq.",
  ")": "Paréntesis der.",
  ",": "Coma",
  "-": "Guion",
  "/": "Barra",
  ":": "Dos puntos",
  ";": "Punto y coma",
  "[": "Corchete izq.",
  "]": "Corchete der.",
};

export const SUPPORTED_PUNCTUATION = ["(", ")", ",", "-", ".", "/", ":", ";", "[", "]"];

/** Characters that can be rendered with the font (used by the manual editor). */
export const RENDERABLE =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()-,./:;[] ";

export function filterRenderable(text: string): string {
  return Array.from(text.toUpperCase())
    .filter((ch) => RENDERABLE.includes(ch) || ch === "\n")
    .join("");
}
