import type { Metadata } from "next";
import localFont from "next/font/local";
import { CartProvider } from "@/providers/cart-provider";
import { ShopChrome } from "@/components/shop-chrome";
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
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen min-h-[100dvh] flex-col bg-[#0f0f11] font-sans antialiased text-stone-100`}
      >
        <CartProvider>
          <ShopChrome>{children}</ShopChrome>
        </CartProvider>
      </body>
    </html>
  );
}
