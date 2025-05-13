// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'brand-bg': '#A9CADB',        // ロゴの背景色
        'brand-primary': '#2A3F54',   // ロゴの濃い紺色 (テキストやアクセント)
        'brand-accent-pink': '#EC4899', // 興味あり (ピンク系)
        'brand-accent-lime': '#84CC16', // 興味なし (黄緑系)
        'brand-card-bg': '#FFFFFF',   // カード背景
      },
      fontFamily: {
        // Geistをメインとしつつ、ポップな見出し用フォントを追加することも可能
        // sans: ['var(--font-geist-sans)'], // layout.tsxで設定済み
        // mono: ['var(--font-geist-mono)'],  // layout.tsxで設定済み
      },
      boxShadow: {
        'pop-md': '0px 5px 15px rgba(42, 63, 84, 0.15), 0px 2px 5px rgba(42, 63, 84, 0.1)',
        'pop-lg': '0px 10px 30px rgba(42, 63, 84, 0.2), 0px 5px 10px rgba(42, 63, 84, 0.15)',
        'inner-highlight': 'inset 0 1px 2px rgba(255, 255, 255, 0.5)',
      },
      keyframes: {
        flyOutLeft: {
          '0%': { transform: 'translateX(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateX(-120vw) translateY(-10vh) rotate(-35deg)', opacity: '0' },
        },
        flyOutRight: {
          '0%': { transform: 'translateX(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateX(120vw) translateY(-10vh) rotate(35deg)', opacity: '0' },
        },
        nextCardEnter: {
          '0%': { transform: 'scale(0.9) translateY(20px) rotate(0deg)', opacity: '0.7' },
          '100%': { transform: 'scale(1) translateY(0) rotate(0deg)', opacity: '1' },
        },
      },
      animation: {
        flyOutLeft: 'flyOutLeft 0.6s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards',
        flyOutRight: 'flyOutRight 0.6s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards',
        nextCardEnter: 'nextCardEnter 0.4s ease-out forwards',
      },
    },
  },
  plugins: [],
};
export default config;