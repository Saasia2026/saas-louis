import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import { cookies } from "next/headers";
import { I18nProvider } from "@/i18n/provider";
import { getDictionary, getLocale } from "@/i18n/server";
import "./globals.css";
import { Spotlight } from "./spotlight";
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
  const t = await getDictionary();
  return { title: "TwinPost", description: t.meta.description };
}

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
        <Spotlight />
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
