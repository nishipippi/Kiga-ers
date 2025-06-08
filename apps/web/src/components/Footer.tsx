// apps/web/src/components/Footer.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation'; // 現在のパスを取得するために使用
import styles from './Footer.module.css';
import { HomeIcon, BookmarkIcon } from '@heroicons/react/24/solid'; // Solidアイコンを使用 (アクティブ状態が分かりやすいため)

export default function Footer() {
  const pathname = usePathname(); // 現在のパスを取得

  return (
    <footer className={styles.footer}>
      <nav className={styles.nav}>
        <Link href="/" className={`${styles.navLink} ${pathname === '/' ? styles.active : ''}`}>
          <HomeIcon className={styles.icon} />
          <span className={styles.navText}>ホーム</span>
        </Link>
        <Link href="/library" className={`${styles.navLink} ${pathname === '/library' || pathname?.startsWith('/library/') ? styles.active : ''}`}>
          <BookmarkIcon className={styles.icon} />
          <span className={styles.navText}>ライブラリ</span>
        </Link>
      </nav>
    </footer>
  );
}
