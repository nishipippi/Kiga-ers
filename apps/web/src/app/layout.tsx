// apps/web/src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google"; // 既存のフォント
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  // weight: ['300', '400', '500', '700'] // 必要に応じてウェイトを追加
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kiga-ers - 論文を見つけよう",
  description: "スワイプ操作で興味のある論文を簡単に見つけられるアプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      {/* <head> は Next.js が自動で管理するので、通常ここに直接書く必要はありません。
          もし書いている場合は、その内容と <body> の間に空白がないか確認してください。
          <title> や <meta> は `metadata` オブジェクトで設定します。
      */}
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans`}>{/* bodyタグの開始とclassNameの間に改行や空白を入れない */}
        {children}
      </body>
    </html>
  );
}