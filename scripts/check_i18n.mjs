#!/usr/bin/env node
/**
 * i18n parity guard: every locale must expose exactly the same keys as the
 * English source, with no empty strings and with matching {placeholders}.
 *
 * Run with: pnpm i18n:check (also runs automatically before `pnpm build`).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const localesDir = join(here, "..", "src", "locales");
const REQUIRED = ["en", "es", "ja", "zh", "hi", "fr", "ar", "bn", "pt", "ru"];

const read = (code) => JSON.parse(readFileSync(join(localesDir, `${code}.json`), "utf8"));
const placeholders = (value) => [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();

const en = read("en");
const enKeys = Object.keys(en);
const failures = [];

const present = readdirSync(localesDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

for (const code of REQUIRED) {
  if (!present.includes(code)) failures.push(`missing locale file: src/locales/${code}.json`);
}
for (const code of present) {
  if (!REQUIRED.includes(code)) failures.push(`unexpected locale file (not wired): ${code}.json`);
}

for (const code of REQUIRED) {
  if (!present.includes(code)) continue;
  let dict;
  try {
    dict = read(code);
  } catch (err) {
    failures.push(`${code}: invalid JSON (${err.message})`);
    continue;
  }
  const keys = Object.keys(dict);
  const missing = enKeys.filter((k) => !(k in dict));
  const extra = keys.filter((k) => !(k in en));
  if (missing.length) failures.push(`${code}: ${missing.length} missing keys -> ${missing.slice(0, 6).join(", ")}`);
  if (extra.length) failures.push(`${code}: ${extra.length} unknown keys -> ${extra.slice(0, 6).join(", ")}`);
  for (const key of enKeys) {
    const value = dict[key];
    if (typeof value !== "string") {
      failures.push(`${code}: ${key} is not a string`);
      continue;
    }
    if (!value.trim()) failures.push(`${code}: ${key} is empty`);
    const a = placeholders(en[key]).join(",");
    const b = placeholders(value).join(",");
    if (a !== b) failures.push(`${code}: ${key} placeholders differ (en="${a}" vs ${code}="${b}")`);
  }
}

if (failures.length) {
  console.error(`i18n: ${failures.length} problem(s) found`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`i18n: OK — ${REQUIRED.length} locales × ${enKeys.length} keys in sync`);
