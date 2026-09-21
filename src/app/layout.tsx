import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import { cookies } from "next/headers";
import { I18nProvider } from "@/i18n/provider";
import { siteUrl } from "@/lib/site";
import { getDictionary, getLocale } from "@/i18n/server";
import "./globals.css";
import { isTheme, THEME_COOKIE } from "./theme";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Police variable : sa largeur (wdth) sert aux titres larges (font-wide).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const title = `TwinPost — ${t.landing.eyebrow}`;
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

// Barre d'état du téléphone assortie au thème, et zoom laissé libre.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fc" },
    { media: "(prefers-color-scheme: dark)", color: "#05060f" },
  ],
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  // Thème choisi (sinon celui de l'appareil, en CSS). ThemeToggle modifie
  // data-theme côté client, d'où suppressHydrationWarning.
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <html
      lang={locale}
      data-theme={isTheme(theme) ? theme : undefined}
      suppressHydrationWarning
      className={`${inter.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
