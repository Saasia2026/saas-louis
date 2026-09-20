import { ImageResponse } from "next/og";
import { getDictionary } from "@/i18n/server";

// Vignette affichée quand le site est partagé (réseaux sociaux, messageries)
// et reprise par Google. Dessinée à la volée, dans la langue du visiteur.
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
          padding: "90px",
          background: "linear-gradient(135deg, #05070f 0%, #101a45 55%, #1b1247 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 6, color: "#8fa4ff", textTransform: "uppercase" }}>
          TwinPost
        </div>
        <div style={{ fontSize: 86, fontWeight: 700, lineHeight: 1.05, marginTop: 28 }}>
          {t.landing.titleTop}
        </div>
        <div style={{ fontSize: 86, fontWeight: 700, lineHeight: 1.05, color: "#5b7cff" }}>
          {t.landing.titleBottom}
        </div>
        <div style={{ fontSize: 30, color: "#b9c2de", marginTop: 34, maxWidth: 940 }}>
          {t.landing.subtitle}
        </div>
      </div>
    ),
    size,
  );
}
