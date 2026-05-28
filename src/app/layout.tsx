import type { Metadata } from "next";
import { Inter, Syne } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-syne",
});

export const metadata: Metadata = {
  title: "Sistema de Monitoreo Integral",
  description: "Plataforma de gestión, monitoreo y análisis de datos en tiempo real.",
  robots: "noindex, nofollow",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${syne.variable}`}>
        {children}
      </body>
    </html>
  );
}
