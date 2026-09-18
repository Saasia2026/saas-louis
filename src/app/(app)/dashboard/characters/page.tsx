import type { Metadata } from "next";
import { ArrowRight, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "../../page-header";
import { CharacterUploader } from "./character-uploader";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: `${t.meta.characters} — TwinPost` };
}

// La création d'un personnage attend la réponse de Sora (~30 s).
export const maxDuration = 120;

// Erreur enregistrée : un code, ou un ancien message en français.
function errorText(error: string, t: Dictionary) {
  if (error === "out_of_credit" || error.startsWith("Le compte")) {
    return t.characters.errors.outOfCredit;
  }
  if (error === "sora_failed" || error.startsWith("La création")) {
    return t.characters.errors.soraFailed;
  }
  return error;
}

export default async function CharactersPage() {
  const t = await getDictionary();
  const C = t.characters;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    redirect("/login");
  }

  const { data: characters } = await supabase
    .from("characters")
    .select("id, name, status, error, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader eyebrow={C.eyebrow} title={C.title}>
        {C.intro}
      </PageHeader>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <CharacterUploader userId={auth.claims.sub} />

        <section className="panel spotlight animate-fade-up p-6 [animation-delay:100ms]">
          <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
            <Users className="size-4" />
          </span>
          <h2 className="mt-4 text-base font-semibold">{C.existing}</h2>
          {characters?.length ? (
            <ul className="mt-4 flex flex-col divide-y divide-line border-y border-line">
              {characters.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <span className="font-medium">{c.name}</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-right text-xs ${
                      c.status === "ready"
                        ? "bg-success/10 text-success"
                        : c.status === "failed"
                          ? "bg-danger/10 text-danger"
                          : "bg-surface-3 text-muted"
                    }`}
                  >
                    {c.error ? errorText(c.error, t) : (C.status[c.status as keyof typeof C.status] ?? c.status)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">
              {C.empty}
            </p>
          )}

          <Link
            href="/dashboard/generate"
            className="btn btn-secondary mt-5"
          >
            {C.goStudio}
            <ArrowRight />
          </Link>
        </section>
      </div>
    </div>
  );
}
