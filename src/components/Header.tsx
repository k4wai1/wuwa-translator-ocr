import { NavLink } from "react-router-dom";
import { useTheme } from "../lib/theme";
import { LOCALES, useI18n, type LocaleCode } from "../lib/i18n";
import {
  AlphabetIcon,
  GithubIcon,
  KeyboardIcon,
  LayersIcon,
  MoonIcon,
  ScanIcon,
  SunIcon,
} from "./Icons";

const NAV = [
  { to: "/", key: "nav.scanner", icon: ScanIcon, end: true },
  { to: "/manual", key: "nav.manual", icon: KeyboardIcon },
  { to: "/alphabet", key: "nav.alphabet", icon: AlphabetIcon },
  { to: "/variants", key: "nav.variants", icon: LayersIcon },
];

export function Logo({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <span className="flex items-center gap-3">
      <span className="relative grid h-9 w-9 place-items-center border border-gold/50 bg-gradient-to-br from-gold/25 to-transparent">
        <svg viewBox="0 0 32 32" className="h-5 w-5 text-gold" aria-hidden="true">
          <path
            d="M6 8h20M6 16h13M6 24h20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="square"
          />
          <path d="M25 12l3 4-3 4" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="absolute -right-px -bottom-px h-1.5 w-1.5 bg-cyan" />
      </span>
      <span className="leading-none">
        <span className="font-logo block text-[1.05rem] uppercase tracking-[0.14em] text-ink">
          {t("common.brand")}
        </span>
        {!compact && (
          <span className="mt-1 block font-display text-[0.58rem] tracking-[0.32em] text-muted">
            {t("common.brandSub")}
          </span>
        )}
      </span>
    </span>
  );
}

function LanguagePicker() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="relative grid place-items-center" title={t("common.language")} htmlFor="lang-select">
      <span className="sr-only">{t("common.language")}</span>
      <select
        id="lang-select"
        name="lang"
        value={locale}
        onChange={(e) => setLocale(e.target.value as LocaleCode)}
        className="h-9 cursor-pointer appearance-none rounded-md border border-line bg-surface/60 pl-2.5 pr-7 font-display text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted transition hover:border-line-strong hover:text-gold focus:border-gold focus:outline-none"
        aria-label={t("common.language")}
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.short} · {l.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 10 6"
        className="pointer-events-none absolute right-2 h-1.5 w-2.5 text-muted"
        aria-hidden="true"
      >
        <path d="M0 0l5 6 5-6z" fill="currentColor" />
      </svg>
    </label>
  );
}

export function Header() {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <NavLink to="/" className="shrink-0" aria-label={t("nav.homeAria")}>
          <Logo />
        </NavLink>

        <nav className="hidden items-center gap-1 md:flex" aria-label={t("nav.mainAria")}>
          {NAV.map(({ to, key, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `group relative flex items-center gap-2 px-3 py-2 font-display text-[0.72rem] font-semibold uppercase tracking-[0.16em] transition-colors ${
                  isActive ? "text-gold" : "text-muted hover:text-ink"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {t(key)}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguagePicker />
          <button
            type="button"
            onClick={toggle}
            className="grid h-9 w-9 place-items-center rounded-md border border-line bg-surface/60 text-muted transition hover:border-line-strong hover:text-gold"
            aria-label={theme === "dark" ? t("header.light") : t("header.dark")}
            title={theme === "dark" ? t("header.lightTitle") : t("header.darkTitle")}
          >
            {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
          </button>
          <a
            href="https://github.com/k4wai1/wuwa-translator-ocr"
            target="_blank"
            rel="noreferrer"
            className="hidden h-9 w-9 place-items-center rounded-md border border-line bg-surface/60 text-muted transition hover:border-line-strong hover:text-ink sm:grid"
            aria-label={t("header.github")}
          >
            <GithubIcon className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  const { t } = useI18n();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-xl md:hidden"
      aria-label={t("nav.mobileAria")}
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {NAV.map(({ to, key, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 font-display text-[0.58rem] font-semibold uppercase tracking-[0.14em] transition-colors ${
                isActive ? "text-gold" : "text-muted"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {t(key)}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
