// apps/web/src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LikedPapersProvider } from "@/contexts/LikedPapersContext";
import Footer from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: 'swap',
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Kiga-ers - 論文スワイプアプリ",
  description: "arXivの論文をスワイプして発見し、AI要約やいいね機能で効率的に情報収集。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body suppressHydrationWarning={true}>
        <LikedPapersProvider>
          <div className="app-container">
            <main className="main-content-wrapper">
              {children}
            </main>
            <Footer />
          </div>
        </LikedPapersProvider>
      </body>
    </html>
  );
}
