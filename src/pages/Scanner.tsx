import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { PageMeta } from "../components/PageMeta";
import { Cropper } from "../components/Cropper";
import { FilterPanel } from "../components/FilterPanel";
import { ScanResult } from "../components/ScanResult";
import {
  AlertIcon,
  CheckIcon,
  ClipboardIcon,
  CropIcon,
  EyeIcon,
  ScanIcon,
  SparkIcon,
  UploadIcon,
} from "../components/Icons";
import {
  cropImage,
  DEFAULT_FILTERS,
  processCanvas,
  type FilterOptions,
} from "../lib/preprocess";
import { loadModel, runOcr, type SessionBundle } from "../lib/ocr";
import { reconstruct } from "../lib/reconstruct";
import type { CropRect, ModelState, OcrResult } from "../lib/types";
import { EXAMPLE_IMAGES } from "../lib/examples";
import { useI18n } from "../lib/i18n";

const DEFAULT_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

interface Source {
  url: string;
  img: HTMLImageElement;
  name: string;
  revoke: boolean;
}

export function Scanner() {
  const { t } = useI18n();
  const [source, setSource] = useState<Source | null>(null);
  const sourceRef = useRef<Source | null>(null);
  const [crop, setCrop] = useState<CropRect>(DEFAULT_CROP);
  const [cropped, setCropped] = useState<HTMLCanvasElement | null>(null);
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);
  const deferredFilters = useDeferredValue(filters);
  const [confidence, setConfidence] = useState(0.30);
  const [upscale, setUpscale] = useState(1);
  const [periodHeuristic, setPeriodHeuristic] = useState(true);
  const [model, setModel] = useState<ModelState>({ status: "idle" });
  const modelRef = useRef<SessionBundle | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [resultImage, setResultImage] = useState("");
  const [ocrError, setOcrError] = useState("");
  const [toast, setToast] = useState("");
  const [dragging, setDragging] = useState(false);
  const [cropBusy, setCropBusy] = useState(false);
  const galleryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const toolRef = useRef<HTMLDivElement>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 3800);
  }, []);

  const applySource = useCallback((img: HTMLImageElement, url: string, name: string, revoke: boolean) => {
    if (sourceRef.current?.revoke) URL.revokeObjectURL(sourceRef.current.url);
    const next: Source = { url, img, name, revoke };
    sourceRef.current = next;
    setSource(next);
    setCrop(DEFAULT_CROP);
    setFilters(DEFAULT_FILTERS);
    setResult(null);
    setResultImage("");
    setOcrError("");
  }, []);

  const loadFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        notify(t("scanner.toast.notImage"));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = async () => {
        try { await img.decode(); } catch { /* noop */ }
        applySource(img, url, file.name || "captura", true);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        notify(t("scanner.toast.loadFailed"));
      };
      img.src = url;
    },
    [applySource, notify, t],
  );

  const loadUrl = useCallback(
    (url: string, name: string) => {
      const img = new Image();
      img.onload = async () => {
        try { await img.decode(); } catch { /* noop */ }
        applySource(img, url, name, false);
      };
      img.onerror = () => notify(t("scanner.toast.exampleFailed"));
      img.src = url;
    },
    [applySource, notify, t],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            loadFile(file);
            notify(t("scanner.toast.pasted"));
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile, notify]);

  useEffect(() => {
    return () => {
      if (sourceRef.current?.revoke) URL.revokeObjectURL(sourceRef.current.url);
    };
  }, []);

  useEffect(() => {
    if (!source) {
      setCropped(null);
      return;
    }
    setCropBusy(true);
    const t = window.setTimeout(() => {
      setCropped(cropImage(source.img, crop, 1600));
      setCropBusy(false);
    }, 110);
    return () => window.clearTimeout(t);
  }, [source, crop]);

  const processed = useMemo(
    () => (cropped ? processCanvas(cropped, deferredFilters) : null),
    [cropped, deferredFilters],
  );

  const ensureModel = useCallback(async (): Promise<SessionBundle | null> => {
    if (modelRef.current) return modelRef.current;
    setModel({ status: "loading", progress: 0, label: t("scanner.model.downloading") });
    try {
      const bundle = await loadModel((ratio, loaded, total) => {
        setModel({
          status: "loading",
          progress: ratio,
          label: total
            ? `${(loaded / 1_000_000).toFixed(1)} / ${(total / 1_000_000).toFixed(1)} MB`
            : `${(loaded / 1_000_000).toFixed(1)} MB`,
        });
      });
      modelRef.current = bundle;
      setModel({ status: "ready", backend: bundle.info.backend, bytes: bundle.info.bytes });
      return bundle;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("MODEL_MISSING")) {
        setModel({ status: "missing", message });
      } else {
        setModel({ status: "error", message });
      }
      return null;
    }
  }, [t]);

  const scan = useCallback(async () => {
    if (!cropped || scanning) return;
    setScanning(true);
    setOcrError("");
    setResult(null);
    try {
      const bundle = await ensureModel();
      if (!bundle) return;
      const input = processed ?? cropped;
      const customFilters = (Object.keys(DEFAULT_FILTERS) as (keyof typeof DEFAULT_FILTERS)[])
        .some((k) => filters[k] !== DEFAULT_FILTERS[k]);
      const res = await runOcr(
        input,
        {
          confidence,
          iou: 0.4,
          periodHeuristic,
          maxDetections: 400,
          scale: upscale,
          preprocessed: customFilters,
        },
        bundle,
      );
      setResult(res);
      setResultImage(cropped.toDataURL("image/jpeg", 0.92));
      window.setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }, [confidence, cropped, ensureModel, filters, periodHeuristic, processed, scanning, upscale]);

  const changePeriodHeuristic = (value: boolean) => {
    setPeriodHeuristic(value);
    if (!result) return;
    const lines = reconstruct(result.detections, {
      periodHeuristic: value,
      spaceFactor: 0.40,
      lineTolerance: 0.65,
    });
    setResult({ ...result, lines, text: lines.map((l) => l.text).join("\n") });
  };

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            loadFile(new File([blob], "portapapeles.png", { type }));
            return;
          }
        }
      }
      notify(t("scanner.toast.clipboardEmpty"));
    } catch {
      notify(t("scanner.toast.clipboardBlocked"));
    }
  };

  const resetImage = () => {
    if (sourceRef.current?.revoke) URL.revokeObjectURL(sourceRef.current.url);
    sourceRef.current = null;
    setSource(null);
    setCropped(null);
    setResult(null);
    setResultImage("");
    setOcrError("");
  };

  return (
    <>
      <PageMeta
        title={t("scanner.metaTitle")}
        description={t("scanner.metaDesc")}
        path="/"
      />
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
        <Hero onStart={() => toolRef.current?.scrollIntoView({ behavior: "smooth" })} />

        <div ref={toolRef} className="mt-10 scroll-mt-24 sm:mt-14">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="label text-gold">{t("scanner.tool.label")}</p>
              <h2 className="mt-1 font-display text-xl font-bold tracking-wide sm:text-2xl">
                {t("scanner.tool.title")}
              </h2>
            </div>
            <span className="chip">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan" /> {t("scanner.tool.local")}
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.08fr_1fr]">
            <section className="panel p-4 sm:p-5" aria-labelledby="step-capture">
              <StepHeading n="01" id="step-capture" title={t("scanner.capture")} icon={CropIcon} />
              {!source ? (
                <Dropzone
                  dragging={dragging}
                  setDragging={setDragging}
                  onFile={loadFile}
                  onPaste={pasteFromClipboard}
                  onGallery={() => galleryInput.current?.click()}
                  onCamera={() => cameraInput.current?.click()}
                />
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-muted" title={source.name}>
                      {source.name}
                    </span>
                    <button type="button" onClick={resetImage} className="shrink-0 text-gold hover:underline">
                      {t("scanner.change")}
                    </button>
                  </div>
                  <Cropper
                    src={source.url}
                    crop={crop}
                    onChange={setCrop}
                    naturalWidth={source.img.naturalWidth}
                    naturalHeight={source.img.naturalHeight}
                    onReset={() => setCrop(DEFAULT_CROP)}
                  />
                  {cropBusy && (
                    <p className="text-[0.68rem] text-cyan">{t("scanner.updating")}</p>
                  )}
                </div>
              )}

              <div className="mt-4 border-t border-line/70 pt-3">
                <p className="label mb-2">{t("scanner.examples")}</p>
                <div className="scroll-x mt-2 flex min-w-0 gap-2 overflow-x-auto pb-1">
                  {EXAMPLE_IMAGES.filter((e) => e.tag !== "livestream")
                    .slice(0, 5)
                    .map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => loadUrl(ex.src, t(ex.titleKey))}
                        className="group relative h-16 w-24 shrink-0 overflow-hidden rounded border border-line bg-surface-2 transition hover:border-gold/60"
                        title={t(ex.titleKey)}
                      >
                        <img
                          src={ex.src}
                          alt={t(ex.titleKey)}
                          className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
                          loading="lazy"
                        />
                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1 py-0.5 text-left text-[0.55rem] text-white/90">
                          {t(ex.titleKey)}
                        </span>
                      </button>
                    ))}
                  <Link
                    to="/manual"
                    className="grid h-16 w-24 shrink-0 place-items-center rounded border border-dashed border-line text-center text-[0.58rem] leading-tight text-muted transition hover:border-gold/60 hover:text-gold"
                  >
                    {t("scanner.gallery1")}
                    <br />
                    {t("scanner.gallery2")}
                  </Link>
                </div>
              </div>
            </section>

            <section className="panel p-4 sm:p-5" aria-labelledby="step-filters">
              <StepHeading n="02" id="step-filters" title={t("scanner.filters")} icon={SparkIcon} />
              {!cropped || !processed ? (
                <div className="mt-4 flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-line bg-surface/20 px-6 text-center">
                  <EyeIcon className="h-8 w-8 text-line-strong" />
                  <p className="mt-3 font-display text-sm uppercase tracking-widest text-muted">
                    {t("scanner.waiting")}
                  </p>
                  <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">
                    {t("scanner.waitingBody")}
                  </p>
                </div>
              ) : (
                <div className="mt-4">
                  <FilterPanel
                    source={cropped}
                    processed={processed}
                    value={filters}
                    onChange={setFilters}
                  />
                </div>
              )}
            </section>
          </div>

          <section className="panel mt-5 p-4 sm:p-5" aria-labelledby="step-infer">
            <StepHeading n="03" id="step-infer" title={t("scanner.infer")} icon={ScanIcon} />
            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <label className="block">
                  <span className="flex items-center justify-between text-xs">
                    <span className="text-muted">{t("scanner.threshold")}</span>
                    <span className="font-display text-[0.72rem] tabular-nums text-ink">
                      {(confidence * 100).toFixed(0)}%
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0.1}
                    max={0.7}
                    step={0.05}
                    value={confidence}
                    onChange={(e) => setConfidence(Number(e.target.value))}
                    className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-gold"
                  />
                  <span className="mt-1 block text-[0.66rem] text-muted/80">
                    {t("scanner.thresholdHint")}
                  </span>
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-[0.68rem] text-muted">
                    <input
                      type="checkbox"
                      checked={upscale === 2}
                      onChange={(e) => setUpscale(e.target.checked ? 2 : 1)}
                      className="accent-gold"
                    />
                    {t("scanner.upscale")}
                  </label>
                </label>
                <label className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface/40 px-3 py-2 sm:flex-col sm:items-start sm:gap-1.5">
                  <span className="text-xs text-muted">{t("scanner.period")}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={periodHeuristic}
                    onClick={() => changePeriodHeuristic(!periodHeuristic)}
                    className={`relative h-5 w-9 rounded-full border transition ${
                      periodHeuristic ? "border-gold/60 bg-gold/30" : "border-line bg-surface-2"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
                        periodHeuristic ? "left-[18px] bg-gold" : "left-0.5 bg-muted"
                      }`}
                    />
                  </button>
                </label>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="btn btn-gold h-11 min-w-[210px]"
                  onClick={scan}
                  disabled={!processed || scanning || model.status === "missing"}
                >
                  {scanning ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                      {t("scanner.scanning")}
                    </>
                  ) : (
                    <>
                      <ScanIcon className="h-4 w-4" />
                      {t("scanner.scan")}
                    </>
                  )}
                </button>
                <ModelStatus state={model} onPreload={ensureModel} />
              </div>
            </div>

            {model.status === "missing" && <ModelMissing />}
            {ocrError && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t("scanner.error", { message: ocrError })}{" "}
                  <code className="text-ink">public/models/model.onnx</code>
                </span>
              </div>
            )}
          </section>

          <div ref={resultRef} className="mt-5 scroll-mt-24">
            {result && resultImage && (
              <section className="panel p-4 sm:p-5" aria-label={t("result.done")}>
                <ScanResult
                  result={result}
                  imageUrl={resultImage}
                  periodHeuristic={periodHeuristic}
                  onPeriodHeuristic={changePeriodHeuristic}
                />
              </section>
            )}
          </div>
        </div>

        <HowItWorks />
        <Faq />
        <input
          ref={galleryInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) loadFile(f);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) loadFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 rounded-lg border border-gold/40 bg-surface/95 px-4 py-2.5 text-center text-xs text-ink shadow-2xl backdrop-blur md:bottom-6">
          {toast}
        </div>
      )}
    </>
  );
}

function Hero({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();
  const heroBody = t("scanner.hero.body").split("Ctrl+V");
  return (
    <section className="relative grid items-center gap-8 lg:grid-cols-[1.35fr_1fr]">
      <div className="animate-fade-up">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip border-gold/40 text-gold">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" /> {t("scanner.hero.badge")}
          </span>
          <span className="chip">{t("scanner.hero.client")}</span>
          <span className="chip">{t("scanner.hero.onnx")}</span>
        </div>
        <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
          {t("scanner.hero.titleA")}{" "}
          <span className="text-gold text-glow-gold">{t("scanner.hero.titleB")}</span>
          <br />
          {t("scanner.hero.titleC")}{" "}
          <span className="font-logo text-cyan text-glow-cyan">Wuthering Waves</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          {heroBody[0]}
          <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 text-[0.7rem]">Ctrl+V</kbd>
          {heroBody[1] ?? ""}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-gold h-11 px-5" onClick={onStart}>
            <ScanIcon className="h-4 w-4" />
            {t("scanner.hero.cta")}
          </button>
          <Link to="/manual" className="btn btn-ghost h-11 px-5">
            <ClipboardIcon className="h-4 w-4" />
            {t("scanner.hero.manual")}
          </Link>
          <span className="flex items-center gap-1.5 text-[0.7rem] text-muted">
            <CheckIcon className="h-3.5 w-3.5 text-ok" /> {t("scanner.hero.noUpload")}
          </span>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
        <div className="panel panel-notch scanline overflow-hidden p-5">
          <div className="flex items-center justify-between">
            <span className="label">{t("scanner.hero.signal")}</span>
            <span className="font-display text-[0.6rem] tracking-[0.3em] text-cyan">{t("scanner.hero.live")}</span>
          </div>
          <div className="mt-4 rounded border border-line/70 bg-bg/70 p-4">
            <p className="glyph break-words text-2xl leading-relaxed text-gold">
              WUTHERING WAVES
            </p>
            <p className="font-logo mt-3 border-t border-line/60 pt-3 text-[0.8rem] tracking-[0.2em] text-muted">
              WUTHERING WAVES
            </p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { k: "26", v: t("scanner.hero.letters") },
              { k: "10", v: t("scanner.hero.digits") },
              { k: "9", v: t("scanner.hero.signs") },
            ].map((s) => (
              <div key={s.v} className="rounded border border-line/60 bg-surface/40 py-2">
                <p className="font-display text-lg font-bold text-ink">{s.k}</p>
                <p className="text-[0.58rem] uppercase tracking-[0.18em] text-muted">{s.v}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-[0.62rem] text-muted">
            <span>{t("scanner.hero.shared")}</span>
            <span className="text-gold">{t("scanner.hero.classes")}</span>
          </div>
        </div>
        <div className="absolute -bottom-3 -right-2 hidden h-16 w-16 border-r border-b border-gold/40 lg:block" />
        <div className="absolute -top-3 -left-2 hidden h-16 w-16 border-t border-l border-cyan/40 lg:block" />
      </div>
    </section>
  );
}

function StepHeading({
  n,
  id,
  title,
  icon: Icon,
}: {
  n: string;
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-8 w-8 place-items-center rounded border border-gold/40 bg-gold/10 font-display text-[0.66rem] font-bold tracking-widest text-gold">
        {n}
      </span>
      <h3 id={id} className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.14em]">
        <Icon className="h-4 w-4 text-muted" />
        {title}
      </h3>
    </div>
  );
}

function Dropzone({
  dragging,
  setDragging,
  onFile,
  onPaste,
  onGallery,
  onCamera,
}: {
  dragging: boolean;
  setDragging: (v: boolean) => void;
  onFile: (file: File) => void;
  onPaste: () => void;
  onGallery: () => void;
  onCamera: () => void;
} ) {
  const { t } = useI18n();
  return (
    <div
      className={`mt-4 rounded-lg border-2 border-dashed p-6 text-center transition ${
        dragging ? "border-gold bg-gold/10" : "border-line bg-surface/20"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-gold/40 bg-gold/10 text-gold">
        <UploadIcon className="h-5 w-5" />
      </div>
      <p className="mt-3 font-display text-sm font-semibold uppercase tracking-[0.14em]">
        {t("scanner.drop.title")}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted">
        {t("scanner.drop.body")}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button type="button" className="btn btn-gold" onClick={onGallery}>
          <UploadIcon className="h-4 w-4" /> {t("scanner.drop.upload")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCamera}>
          <ScanIcon className="h-4 w-4" /> {t("scanner.drop.camera")}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onPaste}>
          <ClipboardIcon className="h-4 w-4" /> {t("scanner.drop.paste")}
        </button>
      </div>
    </div>
  );
}

function ModelStatus({ state, onPreload }: { state: ModelState; onPreload: () => void }) {
  const { t } = useI18n();
  if (state.status === "loading") {
    return (
      <div className="w-full min-w-[210px] rounded border border-line bg-surface/40 px-3 py-2">
        <div className="flex items-center justify-between text-[0.62rem] text-muted">
          <span>{t("scanner.model.loading")}</span>
          <span>{Math.round(state.progress * 100)}%</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full bg-cyan transition-all"
            style={{ width: `${Math.max(4, state.progress * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-[0.6rem] text-muted/80">{state.label}</p>
      </div>
    );
  }
  if (state.status === "ready") {
    return (
      <div className="flex items-center justify-between gap-2 rounded border border-ok/30 bg-ok/10 px-3 py-2 text-[0.64rem] text-ok">
        <span className="flex items-center gap-1.5">
          <CheckIcon className="h-3.5 w-3.5" /> {t("scanner.model.ready")} · {state.backend.toUpperCase()}
        </span>
        <span className="text-muted">{(state.bytes / 1_000_000).toFixed(1)} MB</span>
      </div>
    );
  }
  if (state.status === "missing") {
    return (
      <div className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-[0.64rem] text-danger">
        {t("scanner.model.missing")}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-[0.64rem] text-danger">
        {t("scanner.model.error")}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onPreload}
      className="flex items-center justify-between gap-2 rounded border border-line bg-surface/40 px-3 py-2 text-left text-[0.64rem] text-muted transition hover:border-cyan/50 hover:text-cyan"
    >
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-muted" /> {t("scanner.model.idle")}
      </span>
      <span className="font-display tracking-wider">{t("scanner.model.preload")}</span>
    </button>
  );
}

function ModelMissing() {
  const { t } = useI18n();
  return (
    <div className="mt-3 rounded-md border border-gold/40 bg-gold/10 p-3 text-xs leading-relaxed text-ink">
      <p className="font-semibold text-gold">{t("scanner.missing.title")}</p>
      <p className="mt-1 text-muted">
        {t("scanner.missing.body")}{" "}
        <code className="text-ink">public/models/model.onnx</code>
      </p>
      <pre className="mt-2 overflow-x-auto rounded bg-bg/70 p-2 text-[0.68rem] text-cyan">
{`python scripts/generate_dataset.py --profile micro --out training/micro
python scripts/train_chargen.py
python scripts/export_chargen.py`}
      </pre>
    </div>
  );
}

function HowItWorks() {
  const { t } = useI18n();
  const steps = [
    {
      icon: CropIcon,
      title: t("scanner.how.1t"),
      body: t("scanner.how.1b"),
    },
    {
      icon: SparkIcon,
      title: t("scanner.how.2t"),
      body: t("scanner.how.2b"),
    },
    {
      icon: ScanIcon,
      title: t("scanner.how.3t"),
      body: t("scanner.how.3b"),
    },
  ];
  return (
    <section className="mt-16">
      <p className="label text-gold">{t("scanner.how.label")}</p>
      <h2 className="mt-1 font-display text-2xl font-bold tracking-wide">{t("scanner.how.title")}</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <article key={s.title} className="panel p-5">
            <div className="flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded border border-line bg-surface-2 text-gold">
                <s.icon className="h-4 w-4" />
              </span>
              <span className="font-display text-xs tracking-[0.3em] text-muted/60">0{i + 1}</span>
            </div>
            <h3 className="mt-3 font-display text-base font-semibold">{s.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{s.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  const { t } = useI18n();
  const faqs = [
    {
      q: t("scanner.faq.1q"),
      a: t("scanner.faq.1a"),
    },
    {
      q: t("scanner.faq.2q"),
      a: t("scanner.faq.2a"),
    },
    {
      q: t("scanner.faq.3q"),
      a: t("scanner.faq.3a"),
    },
    {
      q: t("scanner.faq.4q"),
      a: t("scanner.faq.4a"),
    },
  ];
  return (
    <section className="mt-16">
      <p className="label text-gold">{t("scanner.faq.label")}</p>
      <h2 className="mt-1 font-display text-2xl font-bold tracking-wide">
        {t("scanner.faq.title")}
      </h2>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {faqs.map((f) => (
          <details key={f.q} className="panel group p-4 open:border-gold/40">
            <summary className="cursor-pointer list-none font-display text-sm font-semibold text-ink marker:hidden">
              <span className="mr-2 text-gold">+</span>
              {f.q}
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
