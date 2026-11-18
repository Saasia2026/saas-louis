"use client";

import { Gauge, LoaderCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { fmt } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import type { AspectRatio } from "@/lib/generation";
import { createClient } from "@/lib/supabase/client";
import { VIRALITY_CREDITS, VIRALITY_MAX_SECONDS, type ViralityAnalysis } from "@/lib/virality";
import { CameraGlyph, GlassBubble } from "../generate/bubble-icons";
import { uploadSwapFile } from "../generate/swap-input";
import { analyzeVideo } from "./actions";
import { ScoreRing, ViralReport } from "./report";

export type RenderChoice = { id: string; url: string; aspectRatio: AspectRatio; seconds: number | null };

type Clip = { generationId?: string; path?: string; url: string };

// Page Viralité : choisir un clip (déposé ou un rendu), l'analyser, lire le
// rapport ; les analyses précédentes restent sous la main.
export function ViralWorkspace({
  userId,
  credits: initialCredits,
  renders,
  analyses: initialAnalyses,
  initialVideo,
}: {
  userId: string;
  credits: number;
  renders: RenderChoice[];
  analyses: ViralityAnalysis[];
  initialVideo?: string;
}) {
  const { t } = useI18n();
  const V = t.viral;
  const router = useRouter();
  const [supabase] = useState(createClient);
  const preset = renders.find((r) => r.id === initialVideo);
  const [clip, setClip] = useState<Clip | null>(preset ? { generationId: preset.id, url: preset.url } : null);
  const [shown, setShown] = useState<ViralityAnalysis | null>(null);
  const [analyses, setAnalyses] = useState(initialAnalyses);
  const [credits, setCredits] = useState(initialCredits);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(0);
  const [pending, startAnalyzing] = useTransition();
  const [elapsed, setElapsed] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pending) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => {
      clearInterval(timer);
      setElapsed(0);
    };
  }, [pending]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("video/") && !/\.(mp4|m4v|mov|qt|webm)$/i.test(file.name)) {
      setError(V.errors.format);
      return;
    }
    setUploading(true);
    const path = await uploadSwapFile(supabase, userId, file);
    setUploading(false);
    if (!path) {
      setError(V.errors.upload);
      return;
    }
    setClip({ path, url: URL.createObjectURL(file) });
  }

  function analyze(target: Clip | null = clip) {
    if (!target) return;
    setError(null);
    setMissing(0);
    startAnalyzing(async () => {
      const res = await analyzeVideo({ generationId: target.generationId, path: target.path });
      if (!res.ok) {
        if (res.error === "credits") setMissing(res.need ?? VIRALITY_CREDITS);
        setError(fmt(V.errors[res.error], { max: VIRALITY_MAX_SECONDS }));
        return;
      }
      setShown(res.analysis);
      setAnalyses((list) => [res.analysis, ...list]);
      setCredits(res.credits);
      setClip(null);
      // Solde de la barre du haut.
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function restart() {
    setShown(null);
    setClip(null);
    setError(null);
  }

  const short = credits < VIRALITY_CREDITS;

  return (
    <>
      {shown ? (
        <>
          <div className="mb-4 flex justify-end">
            <button type="button" onClick={restart} className="btn btn-secondary">
              <Plus />
              {V.newAnalysis}
            </button>
          </div>
          <ViralReport
            key={shown.id}
            analysis={shown}
            onAnalyzeVersion={(path, url) => {
              const next = { path, url };
              setShown(null);
              setClip(next);
              analyze(next);
            }}
          />
        </>
      ) : (
        <section className="grid animate-fade-up gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          {/* Le clip choisi, ou le dépôt. */}
          <div className="panel flex min-h-80 items-center justify-center p-4">
            {clip ? (
              <video
                key={clip.url}
                src={`${clip.url}#t=0.1`}
                controls
                playsInline
                preload="metadata"
                className="max-h-[32rem] max-w-full rounded-2xl bg-black"
              />
            ) : (
              <button
                type="button"
                disabled={uploading || pending}
                onClick={() => fileInput.current?.click()}
                className="group flex flex-col items-center gap-3 rounded-2xl px-10 py-12 text-muted transition-colors hover:text-text"
              >
                <GlassBubble className="size-20 group-hover:scale-105">
                  {uploading ? (
                    <LoaderCircle className="size-8 animate-spin text-white/80" />
                  ) : (
                    <CameraGlyph className="size-9" />
                  )}
                </GlassBubble>
                <span className="text-base font-semibold text-text">{uploading ? V.uploading : V.upload}</span>
                <span className="text-sm">{fmt(V.uploadHint, { max: VIRALITY_MAX_SECONDS })}</span>
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => {
                void pickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          <div className="panel flex flex-col gap-5 p-5">
            <div>
              <p className="label">{V.pick}</p>
              <p className="mt-2 text-sm text-muted">{V.intro}</p>
            </div>

            {clip && (
              <button
                type="button"
                disabled={pending}
                onClick={() => setClip(null)}
                className="btn btn-secondary self-start"
              >
                {V.change}
              </button>
            )}

            {!clip && renders.length > 0 && (
              <div>
                <p className="text-sm font-semibold">{V.fromRenders}</p>
                <ul className="mt-3 grid grid-cols-4 gap-2">
                  {renders.slice(0, 12).map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setClip({ generationId: r.id, url: r.url })}
                        className="relative block aspect-[9/16] w-full overflow-hidden rounded-xl border border-line bg-black transition-transform hover:scale-[1.03]"
                      >
                        <video src={`${r.url}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-auto space-y-3">
              {pending ? (
                <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-4">
                  <LoaderCircle className="size-5 shrink-0 animate-spin text-accent-light" />
                  <div>
                    <p className="text-sm font-semibold">{V.analyzing}</p>
                    <p className="text-xs text-muted tabular-nums">{fmt(V.analyzingHint, { n: elapsed })}</p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!clip || uploading || short}
                  onClick={() => analyze()}
                  className="btn btn-hot w-full"
                >
                  <Gauge />
                  {V.analyze} · {fmt(V.cost, { n: VIRALITY_CREDITS })}
                </button>
              )}
              <p className="text-center text-xs text-faint tabular-nums">{fmt(V.balance, { n: credits })}</p>
              {error && <p className="text-center text-sm text-danger">{error}</p>}
              {(short || missing > 0) && (
                <p className="text-center text-sm text-muted">
                  {fmt(V.missing, { n: missing || VIRALITY_CREDITS - credits })}{" "}
                  <Link href="/dashboard/credits" className="font-semibold text-accent-light underline-offset-4 hover:underline">
                    {V.recharge}
                  </Link>
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {analyses.length > 0 && (
        <section className="mt-14">
          <h2 className="font-headline text-3xl leading-none sm:text-4xl">{V.history}</h2>
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {analyses.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    setShown(a);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`group relative block aspect-[9/16] w-full overflow-hidden rounded-2xl border bg-black text-left ${
                    shown?.id === a.id ? "border-accent" : "border-line"
                  }`}
                >
                  <video src={`${a.videoUrl}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover opacity-80" />
                  <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/85 to-transparent p-2.5 pt-10 text-white">
                    <ScoreRing score={a.report.score} size="sm" />
                    <span className="text-xs text-white/75 tabular-nums">{a.date}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
