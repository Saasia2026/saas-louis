import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getDictionary } from "@/i18n/server";

// Vignette affichée quand le site est partagé (réseaux sociaux, messageries)
// et reprise par Google. Dessinée à la volée, dans la langue du visiteur, au
// style de la landing : une image d'une démo en plein cadre, assombrie en
// bas, le nom en capitales larges, puis le titre en deux temps en blanc.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "TwinPost";

export default async function OpengraphImage() {
  const [t, backdrop] = await Promise.all([
    getDictionary(),
    readFile(join(process.cwd(), "src/app/og-backdrop.jpg"), "base64"),
  ]);
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#08080b",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/jpeg;base64,${backdrop}`}
          alt=""
          width={1200}
          height={630}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.1) 35%, rgba(0,0,0,0.78)), linear-gradient(to right, rgba(0,0,0,0.45), rgba(0,0,0,0) 65%)",
          }}
        />
        <div style={{ display: "flex", fontSize: 30, fontWeight: 900, letterSpacing: 2 }}>TWINPOST</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 0.98, letterSpacing: -3 }}>{t.landing.titleTop}</div>
          <div style={{ fontSize: 92, fontWeight: 400, lineHeight: 0.98, letterSpacing: -2, color: "rgba(255,255,255,0.86)" }}>
            {t.landing.titleBottom}
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 34, fontSize: 26, color: "rgba(255,255,255,0.74)" }}>
            <div style={{ width: 44, height: 2, background: "rgba(255,255,255,0.74)", marginRight: 18 }} />
            {t.landing.eyebrow}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
