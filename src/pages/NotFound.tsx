import { Link } from "react-router-dom";
import { ScanIcon } from "../components/Icons";

export function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 text-center">
      <p className="glyph text-5xl text-gold">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-wide">Señal perdida</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Esta ruta no existe en el archivo de resonancia. Vuelve al escáner o abre el traductor
        manual.
      </p>
      <div className="mt-5 flex gap-2">
        <Link to="/" className="btn btn-gold">
          <ScanIcon className="h-4 w-4" /> Escáner
        </Link>
        <Link to="/manual" className="btn btn-ghost">
          Traductor
        </Link>
      </div>
    </div>
  );
}
