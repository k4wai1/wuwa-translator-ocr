import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PageMeta } from "../components/PageMeta";
import { AlphabetIcon, CheckIcon, CopyIcon, KeyboardIcon } from "../components/Icons";
import { CLASSES, GLYPH_LABELS, filterRenderable } from "../lib/classes";
import { useI18n } from "../lib/i18n";

const LETTERS = CLASSES.slice(0, 26);
const DIGITS = CLASSES.slice(26, 36);
const PUNCT = CLASSES.slice(36);

export function Alphabet() {
  const { t } = useI18n();
  const [converter, setConverter] = useState("SOLARIS 3");
  const [copied, setCopied] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return CLASSES;
    const q = query.trim().toUpperCase();
    return CLASSES.filter(
      (c) => c === q || t(GLYPH_LABELS[c] ?? "").toLowerCase().includes(q.toLowerCase()),
    );
  }, [query, t]);

  const copy = async (ch: string) => {
    try {
      await navigator.clipboard.writeText(ch);
      setCopied(ch);
      window.setTimeout(() => setCopied(""), 1200);
    } catch {
      /* noop */
    }
  };

  return (
    <>
      <PageMeta
        title={t("alphabet.metaTitle")}
        description={t("alphabet.metaDesc")}
        path="/alphabet"
      />
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div>
            <span className="chip border-gold/40 text-gold">
              <AlphabetIcon className="h-3 w-3" /> {t("alphabet.badge")}
            </span>
            <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              {t("alphabet.titleA")} <span className="text-gold">{t("alphabet.titleB")}</span> {t("alphabet.titleC")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              {t("alphabet.body")}
            </p>
          </div>

          <div className="panel p-4">
            <label className="label" htmlFor="converter">
              {t("alphabet.converter")}
            </label>
            <input
              id="converter"
              value={converter}
              onChange={(e) => setConverter(filterRenderable(e.target.value).slice(0, 120))}
              className="input mt-2 font-body text-sm"
              placeholder={t("alphabet.placeholder")}
              maxLength={120}
            />
            <div className="mt-3 min-h-[86px] rounded-lg border border-line bg-bg/60 p-3">
              <p className="glyph break-words text-2xl leading-relaxed text-gold">
                {converter || "SOLARIS-3"}
              </p>
            </div>
            <div className="mt-2 flex items-center justify-between text-[0.62rem] text-muted">
              <span>{t("common.characters", { count: converter.length })}</span>
              <Link to="/manual" className="text-gold hover:underline">
                {t("alphabet.openEditor")}
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[0.7rem] text-muted">
            <span className="chip">{t("alphabet.chipMerged")}</span>
            <span className="chip">{t("alphabet.chipNoBraces")}</span>
            <span className="chip">{t("alphabet.chipBrackets")}</span>
            <span className="chip">{t("alphabet.chipUnicase")}</span>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("alphabet.filter")}
            className="input max-w-[220px] !py-1.5 text-xs"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted">{t("alphabet.noMatch", { query })}</p>
        ) : (
          <>
            <Section title={t("alphabet.letters")} count={26} note={t("alphabet.lettersNote")}>
              <Grid chars={LETTERS} onCopy={copy} copied={copied} />
            </Section>
            <Section title={t("alphabet.digits")} count={10} note={t("alphabet.digitsNote")}>
              <Grid chars={DIGITS} onCopy={copy} copied={copied} />
            </Section>
            <Section
              title={t("alphabet.punct")}
              count={9}
              note={t("alphabet.punctNote")}
            >
              <Grid chars={PUNCT} onCopy={copy} copied={copied} />
            </Section>
          </>
        )}

        <section className="panel mt-10 p-5">
          <h2 className="font-display text-lg font-bold tracking-wide">{t("alphabet.notesTitle")}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Note title={t("alphabet.note1t")}>{t("alphabet.note1b")}</Note>
            <Note title={t("alphabet.note2t")}>{t("alphabet.note2b")}</Note>
            <Note title={t("alphabet.note3t")}>{t("alphabet.note3b")}</Note>
          </div>
        </section>

        <section className="panel mt-5 overflow-hidden">
          <div className="grid gap-5 p-5 md:grid-cols-[1fr_1.3fr] md:items-center">
            <div>
              <p className="label text-gold">{t("alphabet.posterLabel")}</p>
              <h2 className="mt-1 font-display text-xl font-bold">{t("alphabet.posterTitle")}</h2>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {t("alphabet.posterBody")}
              </p>
              <div className="mt-3 flex gap-2">
                <Link to="/manual" className="btn btn-gold !py-2">
                  <KeyboardIcon className="h-4 w-4" /> {t("alphabet.ctaManual")}
                </Link>
                <Link to="/" className="btn btn-ghost !py-2">
                  {t("alphabet.ctaScan")}
                </Link>
              </div>
            </div>
            <a
              href={`${import.meta.env.BASE_URL}examples/alphabet-poster.jpg`}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-lg border border-line bg-black/30"
            >
              <img
                src={`${import.meta.env.BASE_URL}examples/alphabet-poster.jpg`}
                alt={t("alphabet.posterAlt")}
                className="h-auto w-full"
                loading="lazy"
              />
            </a>
          </div>
        </section>
      </div>
    </>
  );
}

function Section({
  title,
  count,
  note,
  children,
}: {
  title: string;
  count: number;
  note: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section className="mt-9">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-bold tracking-wide">{title}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">{note}</p>
        </div>
        <span className="chip">{t("common.glyphs", { count })}</span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Grid({ chars, onCopy, copied }: { chars: string[]; onCopy: (ch: string) => void; copied: string }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
      {chars.map((ch) => (
        <button
          key={ch}
          type="button"
          onClick={() => onCopy(ch)}
          title={t("alphabet.copyGlyph", { glyph: ch })}
          className="group relative flex aspect-square flex-col items-center justify-center rounded-lg border border-line bg-surface/40 transition hover:border-gold/50 hover:bg-gold/10"
        >
          <span className="glyph text-3xl leading-none text-ink transition group-hover:text-gold">{ch}</span>
          <span className="mt-2 font-display text-[0.58rem] uppercase tracking-[0.18em] text-muted">
            {GLYPH_LABELS[ch] ? ch : ch === "A" ? "A / ." : ch}
          </span>
          {copied === ch && (
            <span className="absolute right-1 top-1 text-ok">
              <CheckIcon className="h-3 w-3" />
            </span>
          )}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-gold py-0.5 text-center text-[0.5rem] font-semibold uppercase tracking-wider text-black group-hover:block">
            <CopyIcon className="mr-0.5 inline h-2.5 w-2.5" /> {t("common.copy")}
          </span>
        </button>
      ))}
    </div>
  );
}

function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface/40 p-3">
      <h3 className="font-display text-sm font-semibold text-gold">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{children}</p>
    </div>
  );
}
