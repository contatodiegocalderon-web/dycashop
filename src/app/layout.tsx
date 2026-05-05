import type { Metadata } from "next";
import localFont from "next/font/local";
import { CartProvider } from "@/providers/cart-provider";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "DYCASHOP",
  description: "Catálogo conectado ao Google Drive",
  appleWebApp: {
    capable: true,
    title: "DYCASHOP",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
  themeColor: "#0f0f11",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="bg-[#0f0f11]">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen min-h-[100dvh] bg-[#0f0f11] font-sans antialiased text-stone-100`}
      >
        <CartProvider>
          <SiteHeader />
          <main className="min-page">{children}</main>
        </CartProvider>
      </body>
    </html>
  );
}
