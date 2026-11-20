import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Archivo, Instrument_Serif, Inter } from "next/font/google";
import { cookies } from "next/headers";
import { I18nProvider } from "@/i18n/provider";
import { siteUrl } from "@/lib/site";
import { getDictionary, getLocale } from "@/i18n/server";
import "./globals.css";
import { OFFER_BAR_COOKIE, OfferBar } from "./offer-bar";
import { offerBarFor } from "./offers";
import { STILL_MODE_SCRIPT } from "./still-mode";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Police variable : sa largeur (wdth) sert au logo élargi (font-wide) et aux
// titres condensés (font-headline).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

// Italique des titres (« Dans la vidéo. ») : seconde ligne des accroches.
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const title = `TwinPost — ${t.meta.title}`;
  return {
    // Base des liens absolus : vignette de partage, sitemap, adresse canonique.
    metadataBase: new URL(siteUrl()),
    title: { default: title, template: "%s" },
    description: t.meta.description,
    applicationName: "TwinPost",
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: "TwinPost",
      locale,
      title,
      description: t.meta.description,
      url: "/",
    },
    twitter: { card: "summary_large_image", title, description: t.meta.description },
    robots: { index: true, follow: true },
    // Installation sur l'écran d'accueil (voir manifest.ts).
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "TwinPost", statusBarStyle: "black-translucent" },
    icons: { apple: "/apple-icon.png" },
  };
}

// Barre d'état du téléphone sombre, comme tout le site, et zoom laissé libre.
export const viewport: Viewport = {
  themeColor: "#08080b",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, t, jar] = await Promise.all([getLocale(), getDictionary(), cookies()]);
  // Connecté ? (cookie de session Supabase) : le bandeau mène aux crédits
  // ou à la connexion.
  const loggedIn = jar.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  const showBar = !jar.get(OFFER_BAR_COOKIE);
  return (
    <html
      lang={locale}
      data-theme="dark"
      // data-still : posé avant l'hydratation dans le navigateur de TikTok.
      suppressHydrationWarning
      className={`${inter.variable} ${archivo.variable} ${instrument.variable} h-full antialiased`}
    >
      <head>
        {/* Lien TikTok : aucune vidéo ne démarre seule (voir still-mode.ts). */}
        <script dangerouslySetInnerHTML={{ __html: STILL_MODE_SCRIPT }} />
      </head>
      {/* Site toujours sombre, au style de la landing (voir .video-page). */}
      <body className="video-page flex min-h-full flex-col bg-bg font-sans">
        <I18nProvider locale={locale}>
          {showBar && <OfferBar {...offerBarFor(t, loggedIn)} />}
          {children}
        </I18nProvider>
        {/* Vercel Web Analytics : visites, provenance (référents, utm_source
            des liens de bio), sans cookie. */}
        <Analytics />
      </body>
    </html>
  );
}
