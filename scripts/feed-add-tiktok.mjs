// Ajoute une vidéo TikTok au fil d'exemples sans la télécharger : l'oEmbed
// officiel de TikTok donne le créateur, le titre et la miniature, et la vidéo
// sera lue par le lecteur officiel de TikTok. Rien n'est récupéré d'autre.
//
//   node scripts/feed-add-tiktok.mjs <lien TikTok> [--category trending|shinka|personas] [--caption "texte"] [--first]
//   node scripts/feed-add-tiktok.mjs --refresh
//
// --first    : en tête du fil (sinon à la fin)
// --refresh  : renouvelle les miniatures et les noms de toutes les vidéos
//              TikTok du fil (les liens de miniature TikTok expirent)
//
// Réservé à l'admin : il faut SUPABASE_SERVICE_ROLE_KEY dans .env.local.
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATEGORIES = ["trending", "shinka", "personas"];

const env = Object.fromEntries(
  (await readFile(path.join(ROOT, ".env.local"), "utf8"))
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.replace(/^(["'])(.*)\1$/, "$2")]),
);
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être dans .env.local");
  process.exit(1);
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

class OembedError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function oembed(url) {
  const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`).catch((e) => {
    throw new OembedError(`TikTok injoignable depuis ce réseau (${e.cause?.code ?? e.message})`, 0);
  });
  if (!res.ok) throw new OembedError(`oEmbed TikTok a répondu ${res.status} pour ${url}`, res.status);
  return res.json();
}

// TikTok injoignable : le créateur et l'identifiant sont repris du lien lui-même
// (https://www.tiktok.com/@compte/video/123…), sans miniature ni titre.
function fromLink(url) {
  const match = String(url).match(/tiktok\.com\/@([^/?#]+)\/video\/(\d+)/);
  if (!match) return null;
  return {
    author_unique_id: match[1],
    author_url: `https://www.tiktok.com/@${match[1]}`,
    author_name: null,
    title: null,
    thumbnail_url: null,
    embed_product_id: match[2],
  };
}

// Identifiant de la vidéo : donné par l'oEmbed, sinon lu dans le lien.
function videoId(url, data) {
  const fromData = String(data.embed_product_id ?? "").match(/^\d+$/)?.[0];
  const fromLink = (s) => String(s ?? "").match(/\/video\/(\d+)/)?.[1];
  return fromData ?? fromLink(url) ?? fromLink(data.html);
}

function creator(data) {
  const handle = data.author_unique_id ?? String(data.author_url ?? "").match(/\/@([^/?#]+)/)?.[1];
  if (!handle || !data.author_url) throw new Error("L'oEmbed ne donne pas le créateur : vidéo non ajoutée.");
  return { creator_handle: `@${handle}`, creator_name: data.author_name ?? null, creator_url: data.author_url };
}

async function add(link) {
  let data;
  try {
    data = await oembed(link);
  } catch (e) {
    data = e.status === 0 ? fromLink(link) : null;
    if (!data) throw e;
    console.warn(`${e.message} : créateur et identifiant repris du lien, sans miniature ni titre.`);
    console.warn("Relance --refresh depuis un réseau qui joint TikTok pour les compléter.");
  }
  const id = videoId(link, data);
  if (!id) throw new Error("Identifiant de vidéo introuvable dans la réponse oEmbed.");
  const category = option("--category") ?? "trending";
  if (!CATEGORIES.includes(category)) throw new Error(`Catégorie inconnue : ${category} (${CATEGORIES.join(", ")})`);

  const { data: edge } = await db
    .from("feed_items")
    .select("position")
    .order("position", { ascending: args.includes("--first") })
    .limit(1)
    .maybeSingle();
  const position = (edge?.position ?? 0) + (args.includes("--first") ? -10 : 10);

  const row = {
    slug: `tt-${id}`,
    source: "tiktok_embed",
    tiktok_id: id,
    poster_url: data.thumbnail_url ?? null,
    ratio: "9/16",
    has_sound: true,
    ...creator(data),
    caption: (option("--caption") ?? data.title ?? "").trim().slice(0, 300) || null,
    category,
    rights_note: `Lecteur officiel TikTok (oEmbed), ajouté le ${new Date().toISOString().slice(0, 10)}`,
    position,
  };
  // Déjà dans le fil : ses informations sont mises à jour, sa place reste.
  const { data: existing } = await db.from("feed_items").select("id").eq("slug", row.slug).maybeSingle();
  const { error } = existing
    ? await db.from("feed_items").update({ ...row, position: undefined }).eq("id", existing.id)
    : await db.from("feed_items").insert(row);
  if (error) throw new Error(error.message);
  console.log(`${existing ? "Mise à jour" : "Ajoutée"} : ${row.slug} ${row.creator_handle} — ${row.caption ?? "(sans légende)"}`);
  console.log(`Lien du fil : /studio?reel=${row.slug}`);
}

async function refresh() {
  const { data: rows, error } = await db
    .from("feed_items")
    .select("id, slug, tiktok_id, creator_handle")
    .eq("source", "tiktok_embed");
  if (error) throw new Error(error.message);
  for (const row of rows) {
    try {
      const data = await oembed(`https://www.tiktok.com/${row.creator_handle}/video/${row.tiktok_id}`);
      const { error: updateError } = await db
        .from("feed_items")
        .update({ poster_url: data.thumbnail_url ?? null, ...creator(data) })
        .eq("id", row.id);
      console.log(`${row.slug} : ${updateError ? updateError.message : "à jour"}`);
    } catch (e) {
      // Vidéo supprimée ou rendue privée (TikTok répond 400 ou 404) : on la
      // retire du fil. Un réseau qui ne joint pas TikTok ne retire rien.
      if (e.status !== 400 && e.status !== 404) {
        console.log(`${row.slug} : inchangée (${e.message})`);
        continue;
      }
      await db.from("feed_items").update({ active: false }).eq("id", row.id);
      console.log(`${row.slug} : retirée du fil (${e.message})`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

try {
  if (args.includes("--refresh")) await refresh();
  else if (args[0] && !args[0].startsWith("--")) await add(args[0]);
  else {
    console.error('usage : node scripts/feed-add-tiktok.mjs <lien TikTok> [--category trending|shinka|personas] [--caption "texte"] [--first]');
    console.error("        node scripts/feed-add-tiktok.mjs --refresh");
    process.exit(1);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
