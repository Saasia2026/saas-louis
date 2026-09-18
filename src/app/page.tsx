import Link from "next/link";
import { Logo } from "@/app/logo";
import { CREDIT_PACKS, formatPrice } from "@/lib/credit-packs";
import { createClient } from "@/lib/supabase/server";

const STEPS = [
  {
    label: "01",
    title: "Tu décris ta vidéo",
    text: "Une idée en une phrase, ou une discussion avec le Director qui te pose les bonnes questions.",
  },
  {
    label: "02",
    title: "L'IA écrit chaque plan",
    text: "Cadrage, mouvement, ambiance : un storyboard complet que tu peux retoucher plan par plan.",
  },
  {
    label: "03",
    title: "Les plans sont tournés et montés",
    text: "Sora 2, Wan ou Seedance génèrent chaque plan, avec le son sur Sora. Le montage est automatique.",
  },
];

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const start = data?.claims ? "/dashboard/generate" : "/login";

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2 text-sm">
            <a href="#tarifs" className="btn btn-ghost px-3">
              Tarifs
            </a>
            <Link href={start} className="btn btn-primary">
              {data?.claims ? "Ouvrir le studio" : "Commencer"}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative isolate mx-auto max-w-6xl px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-[36rem] overflow-hidden">
            <div className="absolute left-1/2 top-0 h-[28rem] w-[48rem] -translate-x-1/2 animate-aurora rounded-full bg-[radial-gradient(closest-side,rgb(79_107_255/0.35),transparent)] blur-3xl" />
            <div className="absolute left-[20%] top-24 h-[20rem] w-[26rem] animate-aurora rounded-full bg-[radial-gradient(closest-side,rgb(154_169_255/0.18),transparent)] blur-3xl [animation-delay:-6s]" />
          </div>
          <p className="eyebrow animate-fade-up">Vidéo IA, du texte au montage final</p>
          <h1 className="mx-auto mt-6 max-w-4xl animate-fade-up font-wide text-4xl leading-[1.05] uppercase [animation-delay:80ms] sm:text-6xl">
            Décris-la.
            <br />
            <span className="text-shine [filter:drop-shadow(0_0_24px_rgb(79_107_255/0.55))]">
              On la tourne.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl animate-fade-up text-base leading-relaxed text-muted [animation-delay:160ms]">
            TwinPost transforme une idée en vidéo prête à publier : storyboard, plans générés par
            les meilleurs modèles et montage, en quelques minutes.
          </p>
          <div className="mt-8 flex animate-fade-up flex-wrap justify-center gap-3 [animation-delay:240ms]">
            <Link href={start} className="btn btn-primary px-5 py-3">
              Créer ma première vidéo
            </Link>
            <a href="#tarifs" className="btn btn-secondary px-5 py-3">
              Voir les tarifs
            </a>
          </div>

          <div className="panel glow mx-auto mt-16 max-w-2xl animate-fade-up p-5 text-left [animation-delay:340ms]">
            <p className="text-lg leading-relaxed">
              Un lévrier qui soulève une barre d&apos;haltérophilie en finale olympique,
              retransmission télé, public en délire
              <span className="ml-0.5 inline-block h-5 w-px translate-y-1 animate-pulse bg-text" />
            </p>
            <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
              <span className="chip">Sora 2 · avec le son</span>
              <span className="flex gap-2">
                <span className="tag">9:16</span>
                <span className="tag">16 s</span>
              </span>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="eyebrow">Comment ça marche</p>
          <ol className="mt-6 divide-y divide-line border-y border-line">
            {STEPS.map((step) => (
              <li
                key={step.label}
                className="group grid gap-2 py-7 transition-colors hover:bg-surface/60 sm:grid-cols-[6rem_1fr_1.4fr] sm:gap-8 sm:px-4"
              >
                <span className="font-wide text-2xl text-line-strong transition-colors duration-300 group-hover:text-accent group-hover:[text-shadow:0_0_20px_var(--accent)]">
                  {step.label}
                </span>
                <h2 className="font-wide text-xl uppercase">{step.title}</h2>
                <p className="text-sm leading-relaxed text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="tarifs" className="mx-auto max-w-6xl scroll-mt-8 px-4 py-16 sm:px-6">
          <p className="eyebrow">Tarifs</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">
            Des crédits, sans abonnement
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Un crédit = une seconde de vidéo (Sora 2 : 5 crédits la seconde). 3 crédits offerts à
            l&apos;inscription, et une génération qui échoue te rend ses crédits.
          </p>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {CREDIT_PACKS.map((pack, i) => {
              const featured = "highlight" in pack && pack.highlight;
              return (
                <li
                  key={pack.id}
                  className={`panel lift flex animate-fade-up flex-col p-6 ${featured ? "glow" : ""}`}
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold">{pack.label}</h3>
                    {featured && (
                      <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-white shadow-[0_0_16px_var(--accent)]">
                        Populaire
                      </span>
                    )}
                  </div>
                  <p className="mt-6 font-wide text-4xl">{formatPrice(pack.amount)}</p>
                  <p className="mt-2 text-sm text-muted tabular-nums">
                    {pack.credits} crédits · {formatPrice(Math.round(pack.amount / pack.credits))} le
                    crédit
                  </p>
                  <Link
                    href={start}
                    className={`btn mt-6 w-full ${featured ? "btn-primary" : "btn-secondary"}`}
                  >
                    Commencer
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
          <Logo />
          <span className="text-xs text-muted">© {new Date().getFullYear()} TwinPost</span>
        </div>
      </footer>
    </div>
  );
}
