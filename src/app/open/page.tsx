import type { Metadata } from "next";
import { LogoMark } from "@/app/logo-mark";

export const metadata: Metadata = {
  title: "Ouvrir TwinPost",
  robots: { index: false, follow: false },
};

/**
 * Page interstitielle pour les navigateurs in-app (TikTok, Instagram, etc.).
 * Le proxy redirige ici quand le user-agent indique un webview social.
 * Le bouton utilise un lien intent Android + un fallback JS pour Safari
 * afin de sortir du webview et ouvrir dans le vrai navigateur.
 */
export default function OpenPage({
  searchParams,
}: PageProps<"/open">) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--bg)] px-6 text-center text-[var(--text)]">
      <LogoMark className="mb-6 size-14" />
      <h1 className="font-headline text-2xl font-bold tracking-tight">
        TwinPost
      </h1>
      <p className="mt-3 max-w-xs text-sm text-[var(--text-muted)]">
        Pour une meilleure expérience, ouvre dans ton navigateur.
      </p>

      <OpenButton searchParams={searchParams} />

      <p className="mt-8 max-w-[16rem] text-xs text-[var(--text-faint)]">
        Appuie sur le bouton ci-dessus ou copie le lien :<br />
        <span className="mt-1 inline-block select-all font-mono text-[var(--text-muted)]">
          twinpost.video
        </span>
      </p>
    </div>
  );
}

async function OpenButton({
  searchParams,
}: {
  searchParams: PageProps<"/open">["searchParams"];
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const target = `https://twinpost.video${next.startsWith("/") ? next : `/${next}`}`;

  return (
    <a
      href={target}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-8 py-3.5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-95"
    >
      <ExternalIcon />
      Ouvrir dans le navigateur
    </a>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
