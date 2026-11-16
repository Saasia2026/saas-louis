"use client";

import { ArrowRight, Check, Download, ImagePlus, LoaderCircle, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { fmt } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { SWAP_IMAGE_TYPES } from "@/lib/generation";
import {
  INFLUENCER_DESCRIPTION_MAX,
  INFLUENCER_GENDERS,
  INFLUENCER_KINDS,
  INFLUENCER_PRESETS,
  influencerCredits,
  kindPreview,
  presetImage,
  type InfluencerGender,
  type InfluencerKind,
} from "@/lib/influencer";
import { createClient } from "@/lib/supabase/client";
import { uploadSwapFile } from "../generate/swap-input";
import { createInfluencer } from "./actions";

export type CreatedInfluencer = { id: string; path: string; url: string };

// Création d'un influenceur : type, genre, détails, photo de départ, puis
// l'image. `stacked` : une seule colonne (tunnel d'accueil) ; `onContinue`
// remplace alors « Utiliser dans le studio ».
export function InfluencerCreator({
  userId,
  credits: initialCredits,
  stacked = false,
  onCreated,
  onContinue,
}: {
  userId: string;
  credits: number;
  stacked?: boolean;
  onCreated?: (influencer: CreatedInfluencer) => void;
  onContinue?: (influencer: CreatedInfluencer) => void;
}) {
  const { t } = useI18n();
  const I = t.influencer;
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [kind, setKind] = useState<InfluencerKind>("natural");
  // Exemple choisi : il remplace le type et le genre.
  const [preset, setPreset] = useState<string | null>(null);
  const [gender, setGender] = useState<InfluencerGender>("woman");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<{ path: string; previewUrl: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(0);
  const [result, setResult] = useState<CreatedInfluencer | null>(null);
  const [credits, setCredits] = useState(initialCredits);
  const [pending, startGenerating] = useTransition();
  const [elapsed, setElapsed] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Sur téléphone, la création lancée amène l'image à l'écran.
  useEffect(() => {
    if (pending && window.matchMedia("(max-width: 1023px)").matches) {
      panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pending]);

  const cost = influencerCredits(Boolean(photo));
  const short = credits < cost;

  // Secondes écoulées pendant la création, pour patienter.
  useEffect(() => {
    if (!pending) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => {
      clearInterval(timer);
      setElapsed(0);
    };
  }, [pending]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!SWAP_IMAGE_TYPES.includes(file.type)) {
      setError(I.photoFormat);
      return;
    }
    setUploading(true);
    const path = await uploadSwapFile(supabase, userId, file);
    setUploading(false);
    if (!path) {
      setError(I.errors.upload);
      return;
    }
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto({ path, previewUrl: URL.createObjectURL(file) });
  }

  function generate() {
    setError(null);
    setMissing(0);
    startGenerating(async () => {
      const res = await createInfluencer({ kind, gender, description, photoPath: photo?.path, preset });
      if (!res.ok) {
        if (res.error === "credits") setMissing(res.need ?? cost);
        setError(I.errors[res.error]);
        return;
      }
      const created = { id: res.id, path: res.path, url: res.url };
      setResult(created);
      setCredits(res.credits);
      onCreated?.(created);
      // Solde de la barre du haut.
      router.refresh();
    });
  }

  // min-w-0 : la ligne d'exemples défilante ne doit pas élargir la colonne.
  const controls = (
    <div className="min-w-0 space-y-7">
      {/* Type de personnage, en vignettes. */}
      <section>
        <h2 className="label">{I.type}</h2>
        <div className={`mt-3 grid gap-2.5 ${stacked ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-6"}`}>
          {INFLUENCER_KINDS.map((k) => {
            const selected = !preset && kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  setPreset(null);
                }}
                aria-pressed={selected}
                className={`group relative aspect-[3/4] overflow-hidden rounded-2xl border bg-surface-2 text-left transition-[border-color,transform] duration-200 active:scale-[0.98] ${
                  selected ? "border-accent" : "border-line hover:border-line-strong"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={kindPreview(k)}
                  alt=""
                  className={`absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04] ${
                    selected ? "" : "opacity-85"
                  }`}
                />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 pt-8 pb-2 text-sm font-semibold text-white">
                  {I.kinds[k]}
                </span>
                {selected && (
                  <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-accent text-white">
                    <Check className="size-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Exemples prêts, à faire défiler : un clic, et on part de ce style. */}
      <section>
        <h2 className="label">{I.examples}</h2>
        <div className="-mx-1 mt-3 flex snap-x gap-2.5 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
          {INFLUENCER_PRESETS.map((p) => {
            const selected = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(selected ? null : p.id)}
                aria-pressed={selected}
                aria-label={I.example}
                className={`relative aspect-[3/4] w-24 shrink-0 snap-start overflow-hidden rounded-2xl border bg-white transition-[border-color,transform] duration-200 active:scale-[0.98] sm:w-28 ${
                  selected ? "border-accent" : "border-line hover:border-line-strong"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={presetImage(p.id)} alt="" className="absolute inset-0 size-full object-cover" />
                {selected && (
                  <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-accent text-white">
                    <Check className="size-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Genre (un exemple a déjà le sien). */}
      <section className={preset ? "hidden" : ""}>
        <h2 className="label">{I.gender}</h2>
        <div className="rail mt-3 inline-flex gap-1 border border-line text-sm">
          {INFLUENCER_GENDERS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              aria-pressed={gender === g}
              className={`rounded-full px-4 py-1.5 font-semibold transition-colors ${
                gender === g ? "bg-accent text-white" : "text-muted hover:text-text"
              }`}
            >
              {I.genders[g]}
            </button>
          ))}
        </div>
      </section>

      {/* Détails libres. */}
      <section>
        <label htmlFor="influencer-details" className="label">
          {I.details} <span className="font-normal normal-case text-faint">· {I.optional}</span>
        </label>
        <textarea
          id="influencer-details"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, INFLUENCER_DESCRIPTION_MAX))}
          rows={2}
          placeholder={I.detailsPlaceholder}
          className="mt-3 w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors placeholder:text-faint focus:border-accent"
        />
      </section>

      {/* Photo de départ. */}
      <section>
        <h2 className="label">
          {I.photo} <span className="font-normal normal-case text-faint">· {I.optional}</span>
        </h2>
        <input
          ref={fileInput}
          type="file"
          accept={SWAP_IMAGE_TYPES.join(",")}
          className="sr-only"
          onChange={(e) => {
            void pickPhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {photo ? (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-surface p-2 pr-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.previewUrl} alt="" className="size-14 rounded-xl object-cover" />
            <p className="min-w-0 flex-1 text-sm text-muted">{I.photoHint}</p>
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(photo.previewUrl);
                setPhoto(null);
              }}
              className="btn btn-ghost size-9 p-0"
              title={I.photoRemove}
            >
              <X />
              <span className="sr-only">{I.photoRemove}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface px-4 py-3.5 text-left transition-colors hover:border-accent"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-3">
              {uploading ? <LoaderCircle className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{uploading ? I.uploading : I.photoAdd}</span>
              <span className="block text-xs text-muted">{I.photoHint}</span>
            </span>
          </button>
        )}
      </section>
    </div>
  );

  const generateButton = (
    <div>
      <button
        type="button"
        onClick={generate}
        disabled={pending || uploading || short}
        className="btn btn-accent w-full py-3.5 text-base"
      >
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        {pending ? I.creating : I.generate}
        {!pending && <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs tabular-nums">{fmt(I.cost, { n: cost })}</span>}
      </button>
      <p className="mt-2 text-center text-xs text-muted tabular-nums">{fmt(I.balance, { n: credits })}</p>
      {(short || missing > 0) && (
        <p className="mt-2 text-center text-sm">
          {fmt(I.missing, { n: missing || cost - credits })}{" "}
          <Link href="/dashboard/credits" className="font-semibold text-accent-light hover:underline">
            {I.recharge}
          </Link>
        </p>
      )}
      {error && !missing && (
        <p role="alert" className="mt-3 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );

  // Cadre de l'image : aperçu du type, création en cours, puis le résultat.
  const frame = (
    <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-surface-2">
      {result ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={result.url} alt="" className="absolute inset-0 size-full animate-fade-up object-cover" />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo?.previewUrl ?? (preset ? presetImage(preset) : kindPreview(kind))}
            alt=""
            className={`absolute inset-0 size-full object-cover transition-[filter,opacity] duration-500 ${
              pending ? "scale-105 opacity-60 blur-xl" : "opacity-35"
            }`}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            {pending ? (
              <>
                <LoaderCircle className="size-7 animate-spin text-accent-light" />
                <p className="font-semibold">{I.creating}</p>
                <p className="text-xs text-muted tabular-nums">{fmt(I.creatingHint, { n: elapsed })}</p>
              </>
            ) : (
              <p className="rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white">
                {preset ? I.example : I.kinds[kind]}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );

  const resultActions = result && (
    <div className="mt-4 space-y-2">
      {onContinue ? (
        <button type="button" onClick={() => onContinue(result)} className="btn btn-accent w-full py-3.5 text-base">
          {I.continue}
          <ArrowRight />
        </button>
      ) : (
        <Link href={`/dashboard/generate?influencer=${result.id}`} className="btn btn-accent w-full py-3.5 text-base">
          {I.use}
          <ArrowRight />
        </Link>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setResult(null);
            generate();
          }}
          disabled={pending || short}
          className="btn btn-secondary"
        >
          <RotateCcw />
          {fmt(I.again, { n: cost })}
        </button>
        <button type="button" onClick={() => setResult(null)} className="btn btn-secondary">
          {I.change}
        </button>
      </div>
      <a href={result.url} target="_blank" rel="noreferrer" className="btn btn-ghost w-full">
        <Download />
        {I.download}
      </a>
    </div>
  );

  // Tunnel : une colonne, le cadre n'apparaît qu'une fois la création lancée.
  if (stacked) {
    return result || pending ? (
      <div className="mx-auto max-w-sm">
        {frame}
        {resultActions}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>
    ) : (
      <div className="space-y-7">
        {controls}
        {generateButton}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
      {controls}
      {/* Sur téléphone, le cadre n'apparaît qu'une fois la création lancée :
          avant, il ne ferait que répéter la vignette choisie. */}
      <div ref={panel} className="panel mx-auto w-full max-w-[22rem] scroll-mt-24 p-3 lg:sticky lg:top-24 lg:max-w-none">
        <div className={result || pending ? "mb-4" : "mb-4 hidden lg:block"}>{frame}</div>
        <div className="px-1 pb-1">{result ? resultActions : generateButton}</div>
      </div>
    </div>
  );
}
