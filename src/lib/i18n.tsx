import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "../locales/en.json";

export type LocaleCode = "en" | "es" | "ja" | "zh" | "hi" | "fr" | "ar" | "bn" | "pt" | "ru";

export interface LocaleInfo {
  code: LocaleCode;
  label: string;
  short: string;
  dir: "ltr" | "rtl";
}

export const LOCALES: LocaleInfo[] = [
  { code: "en", label: "English", short: "EN", dir: "ltr" },
  { code: "es", label: "Español", short: "ES", dir: "ltr" },
  { code: "ja", label: "日本語", short: "JA", dir: "ltr" },
  { code: "zh", label: "简体中文", short: "ZH", dir: "ltr" },
  { code: "hi", label: "हिन्दी", short: "HI", dir: "ltr" },
  { code: "fr", label: "Français", short: "FR", dir: "ltr" },
  { code: "ar", label: "العربية", short: "AR", dir: "rtl" },
  { code: "bn", label: "বাংলা", short: "BN", dir: "ltr" },
  { code: "pt", label: "Português", short: "PT", dir: "ltr" },
  { code: "ru", label: "Русский", short: "RU", dir: "ltr" },
];

export const DEFAULT_LOCALE: LocaleCode = "en";
const STORAGE_KEY = "wuwa-ocr-lang";

type Dict = Record<string, string>;

const LOADERS: Record<LocaleCode, () => Promise<{ default: Dict }>> = {
  en: async () => ({ default: en as Dict }),
  es: () => import("../locales/es.json"),
  ja: () => import("../locales/ja.json"),
  zh: () => import("../locales/zh.json"),
  hi: () => import("../locales/hi.json"),
  fr: () => import("../locales/fr.json"),
  ar: () => import("../locales/ar.json"),
  bn: () => import("../locales/bn.json"),
  pt: () => import("../locales/pt.json"),
  ru: () => import("../locales/ru.json"),
};

function normalize(code: string | null | undefined): LocaleCode {
  if (code && (LOCALES as LocaleInfo[]).some((l) => l.code === code)) return code as LocaleCode;
  return DEFAULT_LOCALE;
}

interface I18nValue {
  locale: LocaleCode;
  dir: "ltr" | "rtl";
  setLocale: (code: LocaleCode) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function translate(dict: Dict, key: string, vars?: Record<string, string | number>): string {
  let value = dict[key] ?? (en as Dict)[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.split(`{${k}}`).join(String(v));
    }
  }
  return value;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() =>
    normalize(typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY)),
  );
  const [dict, setDict] = useState<Dict>(en as Dict);

  useEffect(() => {
    let alive = true;
    const info = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];
    document.documentElement.lang = locale;
    document.documentElement.dir = info.dir;
    if (locale === DEFAULT_LOCALE) {
      setDict(en as Dict);
      return;
    }
    LOADERS[locale]()
      .then((mod) => {
        if (alive) setDict(mod.default as Dict);
      })
      .catch(() => {
        if (alive) setDict(en as Dict);
      });
    return () => {
      alive = false;
    };
  }, [locale]);

  const setLocale = useCallback((code: LocaleCode) => {
    setLocaleState(code);
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* storage may be blocked */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(dict, key, vars),
    [dict],
  );

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dir: (LOCALES.find((l) => l.code === locale) ?? LOCALES[0]).dir,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
