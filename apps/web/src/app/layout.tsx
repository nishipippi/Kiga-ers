// apps/web/src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google"; // next/font/googleからインポート
import "./globals.css";
import { LikedPapersProvider } from "@/contexts/LikedPapersContext"; // 作成したContext Providerをインポート
import Footer from "@/components/Footer"; // 作成したFooterコンポーネントをインポート

const geistSans = Geist({ // GeistSansではなくGeist
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: 'swap', // フォント読み込み戦略
});
const geistMono = Geist_Mono({ // GeistMonoではなくGeist_Mono
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: 'swap', // フォント読み込み戦略
});

export const metadata: Metadata = {
  title: "Kiga-ers - 論文スワイプアプリ",
  description: "arXivの論文をスワイプして発見し、AI要約やいいね機能で効率的に情報収集。",
  // viewport: "width=device-width, initial-scale=1", // Next.jsが自動で追加することが多い
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
