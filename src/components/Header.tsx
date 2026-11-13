import { NavLink } from "react-router-dom";
import { useTheme } from "../lib/theme";
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
  { to: "/", label: "Escáner", icon: ScanIcon, end: true },
  { to: "/manual", label: "Traductor", icon: KeyboardIcon },
  { to: "/alphabet", label: "Alfabeto", icon: AlphabetIcon },
  { to: "/variants", label: "Variantes", icon: LayersIcon },
];

export function Logo({ compact = false }: { compact?: boolean }) {
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
        <span className="block font-display text-[0.95rem] font-bold tracking-[0.18em] text-ink">
          WUWA OCR
        </span>
        {!compact && (
          <span className="mt-1 block font-display text-[0.58rem] tracking-[0.32em] text-muted">
            SOLARIS-3 DECODER
          </span>
        )}
      </span>
    </span>
  );
}

export function Header() {
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <NavLink to="/" className="shrink-0" aria-label="WuWa Translator OCR — inicio">
          <Logo />
        </NavLink>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Navegación principal">
          {NAV.map(({ to, label, icon: Icon, end }) => (
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
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="grid h-9 w-9 place-items-center rounded-md border border-line bg-surface/60 text-muted transition hover:border-line-strong hover:text-gold"
            aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          >
            {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
          </button>
          <a
            href="https://github.com/k4wai1/wuwa-translator-ocr"
            target="_blank"
            rel="noreferrer"
            className="hidden h-9 w-9 place-items-center rounded-md border border-line bg-surface/60 text-muted transition hover:border-line-strong hover:text-ink sm:grid"
            aria-label="Repositorio en GitHub"
          >
            <GithubIcon className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-xl md:hidden"
      aria-label="Navegación móvil"
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {NAV.map(({ to, label, icon: Icon, end }) => (
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
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
