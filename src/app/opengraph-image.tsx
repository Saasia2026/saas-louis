import { ImageResponse } from "next/og";
import { getDictionary } from "@/i18n/server";

// Vignette affichée quand le site est partagé (réseaux sociaux, messageries)
// et reprise par Google. Dessinée à la volée, dans la langue du visiteur.
// Même doctrine que le site : noir cinéma, une idée forte, de l'espace,
// l'accent indigo sur la seconde ligne seulement.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "TwinPost";

export default async function OpengraphImage() {
  const t = await getDictionary();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "96px",
          background: "#09090b",
          color: "#f7f7f8",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 26,
            letterSpacing: 8,
            color: "#64646e",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          TwinPost
        </div>
        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            lineHeight: 1.02,
            marginTop: 36,
            letterSpacing: -2,
            textTransform: "uppercase",
          }}
        >
          {t.landing.titleTop}
        </div>
        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            lineHeight: 1.02,
            color: "#9aa4ff",
            letterSpacing: -2,
            textTransform: "uppercase",
          }}
        >
          {t.landing.titleBottom}
        </div>
        <div style={{ fontSize: 28, color: "#a3a3ad", marginTop: 40, maxWidth: 900, lineHeight: 1.4 }}>
          {t.landing.subtitle}
        </div>
      </div>
    ),
    size,
  );
}
