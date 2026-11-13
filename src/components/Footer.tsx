import { Link } from "react-router-dom";
import { Logo } from "./Header";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line/70 bg-surface/30">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
            Escáner y traductor del alfabeto <span className="text-gold">Solaris-3</span> de
            Wuthering Waves. La inferencia corre por completo en tu navegador: tus capturas nunca
            salen de tu dispositivo.
          </p>
          <p className="mt-4 text-xs text-muted/80">
            Proyecto fan no oficial. Wuthering Waves © Kuro Games. Fuente y capturas usadas con
            fines de referencia.
          </p>
        </div>
        <div>
          <p className="label">Herramientas</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>
              <Link className="transition hover:text-gold" to="/">
                Escáner OCR
              </Link>
            </li>
            <li>
              <Link className="transition hover:text-gold" to="/manual">
                Traductor manual
              </Link>
            </li>
            <li>
              <Link className="transition hover:text-gold" to="/alphabet">
                Tabla del alfabeto
              </Link>
            </li>
            <li>
              <Link className="transition hover:text-gold" to="/variants">
                Otras variantes
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="label">Búsquedas</p>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
            <li>Wuthering Waves Translator</li>
            <li>WuWa OCR</li>
            <li>Solaris-3 Alphabet Decoder</li>
            <li>WuWa Font Scanner</li>
          </ul>
          <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />
            100% client-side · ONNX Runtime Web
          </p>
        </div>
      </div>
      <div className="border-t border-line/60 px-4 py-4 text-center font-display text-[0.62rem] tracking-[0.24em] text-muted/70">
        SOLARIS-3 · RESONANCE ARCHIVE · {new Date().getFullYear()}
      </div>
    </footer>
  );
}
