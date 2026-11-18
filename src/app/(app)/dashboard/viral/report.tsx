"use client";

import { CalendarClock, Download, Gauge, LoaderCircle, Scissors } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { fmt } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { scoreTone, type ViralityAnalysis } from "@/lib/virality";
import { CopyButton } from "../generation-details";
import { keepSuggestedPart } from "./actions";

const TONE_TEXT = { good: "text-success", mid: "text-warning", low: "text-danger" } as const;
const TONE_BG = { good: "bg-success", mid: "bg-warning", low: "bg-danger" } as const;

// Note sur 100 dans un anneau, coloré selon la note.
export function ScoreRing({ score, size = "lg" }: { score: number; size?: "sm" | "lg" }) {
  const tone = scoreTone(score);
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${size === "lg" ? "size-28" : "size-9"}`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth={size === "lg" ? 7 : 10} className="stroke-white/10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth={size === "lg" ? 7 : 10}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          className={`${TONE_TEXT[tone]} stroke-current`}
        />
      </svg>
      <span className={`font-semibold tabular-nums ${size === "lg" ? "text-4xl" : "text-xs text-white"}`}>{score}</span>
    </span>
  );
}

const time = (s: number) => `${s.toFixed(1).replace(/\.0$/, "")} s`;

// Rapport d'une analyse : la vidéo et sa ligne de temps (accroche, moments,
// changements de plan) à gauche ; la note, les critères, les corrections, la
// découpe conseillée et la légende à droite.
export function ViralReport({
  analysis,
  onAnalyzeVersion,
}: {
  analysis: ViralityAnalysis;
  onAnalyzeVersion: (path: string, url: string) => void;
}) {
  const { t } = useI18n();
  const V = t.viral;
  const { report, facts } = analysis;
  const video = useRef<HTMLVideoElement>(null);
  const [current, setCurrent] = useState(0);
  const tone = scoreTone(report.score);
  const duration = Math.max(facts.seconds, 0.1);
  const at = (s: number) => `${Math.min(100, Math.max(0, (s / duration) * 100))}%`;

  function seek(s: number) {
    const v = video.current;
    if (!v) return;
    v.currentTime = s;
    void v.play().catch(() => {});
  }

  return (
    <div className="grid animate-fade-up gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      {/* Vidéo, ligne de temps, moments. */}
      <div className="panel flex flex-col gap-4 p-4 lg:sticky lg:top-24 lg:self-start">
        <div className="flex justify-center">
          <video
            ref={video}
            src={`${analysis.videoUrl}#t=0.1`}
            controls
            playsInline
            preload="metadata"
            onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
            className="max-h-[30rem] max-w-full rounded-2xl bg-black"
          />
        </div>

        <div>
          <div
            role="slider"
            aria-label={V.moments}
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={current}
            tabIndex={0}
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - box.left) / box.width) * duration);
            }}
            className="relative h-9 cursor-pointer"
          >
            <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/10" />
            <span
              className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-white/30"
              style={{ width: at(current) }}
            />
            {facts.cuts.map((c) => (
              <span
                key={`cut-${c}`}
                title={`${V.cut} · ${time(c)}`}
                className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-white/35"
                style={{ left: at(c) }}
              />
            ))}
            {report.moments.map((m, i) => (
              <span
                key={`m-${i}`}
                title={`${time(m.at)} · ${m.note}`}
                className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${
                  m.kind === "strong" ? "bg-success" : "bg-warning"
                }`}
                style={{ left: at(m.at) }}
              />
            ))}
            <span
              title={fmt(V.hookAt, { s: report.hookAt })}
              className="absolute top-0 h-full w-0.5 -translate-x-1/2 rounded-full bg-accent-light"
              style={{ left: at(report.hookAt) }}
            />
          </div>
          <div className="flex justify-between text-[0.6875rem] text-faint tabular-nums">
            <span>0 s</span>
            <span>{time(facts.seconds)}</span>
          </div>
        </div>

        <div>
          <p className="label">{V.moments}</p>
          <ul className="mt-2 space-y-1">
            {report.moments.map((m, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => seek(m.at)}
                  className="flex w-full items-start gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <span
                    className={`mt-1.5 size-2.5 shrink-0 rounded-full ${m.kind === "strong" ? "bg-success" : "bg-warning"}`}
                  />
                  <span className="w-10 shrink-0 pt-px text-xs font-semibold text-muted tabular-nums">{time(m.at)}</span>
                  <span className="text-sm">
                    <span className="sr-only">{m.kind === "strong" ? V.strong : V.risk} · </span>
                    {m.note}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Note et rapport. */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="panel flex items-center gap-5 p-5">
          <ScoreRing score={report.score} />
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${TONE_TEXT[tone]}`}>
              {report.score}
              {V.outOf} · {fmt(V.hookAt, { s: report.hookAt })}
            </p>
            <p className="mt-1.5 text-[0.9375rem] leading-snug">{report.verdict}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted">
              {[
                fmt(V.seconds, { n: facts.seconds }),
                facts.aspectRatio,
                facts.cuts.length ? fmt(V.shots, { n: facts.cuts.length + 1 }) : V.oneShot,
                !facts.hasAudio ? V.noSound : facts.speech ? V.speech : V.music,
              ].map((fact) => (
                <li key={fact} className="rounded-full bg-white/[0.06] px-2.5 py-1">
                  {fact}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="panel space-y-4 p-5">
          {report.criteria.map((c) => {
            const ct = scoreTone(c.score * 10);
            return (
              <div key={c.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold">{V.criteria[c.key]}</p>
                  <p className={`text-sm font-semibold tabular-nums ${TONE_TEXT[ct]}`}>{c.score}/10</p>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className={`h-full rounded-full ${TONE_BG[ct]}`} style={{ width: `${c.score * 10}%` }} />
                </div>
                <p className="mt-1.5 text-sm text-muted">{c.note}</p>
              </div>
            );
          })}
        </div>

        {report.fixes.length > 0 && (
          <div className="panel p-5">
            <p className="label">{V.fixes}</p>
            <ol className="mt-3 space-y-3">
              {report.fixes.map((f, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-light">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{f.title}</p>
                    <p className="mt-0.5 text-sm text-muted">{f.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {report.keep && <KeepPanel analysis={analysis} onAnalyzeVersion={onAnalyzeVersion} />}

        <div className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="label">{V.caption}</p>
            <CopyButton
              text={`${report.caption}\n\n${report.hashtags.join(" ")}`}
              label={V.copy}
              className="size-9"
            />
          </div>
          <p className="mt-2 text-sm">{report.caption}</p>
          <p className="mt-2 text-sm text-accent-light">{report.hashtags.join(" ")}</p>
          <Link href="/dashboard/planning" className="btn btn-secondary mt-4">
            <CalendarClock />
            {V.schedule}
          </Link>
        </div>

        <p className="text-center text-xs text-faint">{V.honest}</p>
      </div>
    </div>
  );
}

// Découpe conseillée : le passage à garder, coupé sur demande ; la nouvelle
// version se télécharge ou s'analyse à son tour.
function KeepPanel({
  analysis,
  onAnalyzeVersion,
}: {
  analysis: ViralityAnalysis;
  onAnalyzeVersion: (path: string, url: string) => void;
}) {
  const { t } = useI18n();
  const V = t.viral;
  const keep = analysis.report.keep!;
  const [result, setResult] = useState<{ path: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startCutting] = useTransition();

  return (
    <div className="panel p-5">
      <p className="label">{V.keep}</p>
      <p className="mt-2 text-sm font-semibold tabular-nums">{fmt(V.keepRange, { start: keep.start, end: keep.end })}</p>
      <p className="mt-1 text-sm text-muted">{keep.reason}</p>
      {result ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold text-success">{V.keepDone}</p>
          <div className="flex flex-wrap gap-2">
            <a href={result.url} className="btn btn-secondary">
              <Download />
              {V.keepDownload}
            </a>
            <button type="button" onClick={() => onAnalyzeVersion(result.path, result.url)} className="btn btn-accent">
              <Gauge />
              {V.keepAnalyze}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startCutting(async () => {
              setFailed(false);
              const res = await keepSuggestedPart(analysis.id);
              if (res.ok) setResult({ path: res.path, url: res.url });
              else setFailed(true);
            })
          }
          className="btn btn-secondary mt-4"
        >
          {pending ? <LoaderCircle className="animate-spin" /> : <Scissors />}
          {pending ? V.keeping : V.keepAction}
        </button>
      )}
      {failed && <p className="mt-2 text-sm text-danger">{V.keepFailed}</p>}
    </div>
  );
}
