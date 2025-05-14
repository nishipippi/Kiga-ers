// apps/web/src/app/library/page.tsx
'use client';

import React from 'react';
import Link from 'next/link';
// import { useRouter } from 'next/navigation'; // ★★★ 修正点: この行を削除 ★★★
import { useLikedPapers } from '@/contexts/LikedPapersContext';
import styles from './library.module.css';
import { BookmarkSlashIcon, TrashIcon } from '@heroicons/react/24/outline';

export default function LibraryPage() {
  const { likedPapers, removeLikedPaper, isLoadingPersistence } = useLikedPapers();
  // const router = useRouter(); // ★★★ 修正点: この行を削除 ★★★

  const handleRemoveFromLibrary = (paperId: string, paperTitle: string) => {
    if (confirm(`「${paperTitle}」をライブラリから削除しますか？`)) {
      removeLikedPaper(paperId);
      // 削除後に特定のページに遷移させたい場合はここで router.push() を使うが、
      // 現在はリストから要素が消えるだけなので router は不要。
    }
  };

  if (isLoadingPersistence) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>ライブラリを読み込み中...</p>
      </div>
    );
  }

  if (likedPapers.length === 0) {
    return (
      <div className={styles.emptyLibraryContainer}>
        <BookmarkSlashIcon className={styles.emptyIcon} />
        <h2 className={styles.emptyTitle}>ライブラリは空です</h2>
        <p className={styles.emptyText}>
          ホームページで論文をスワイプして、
          <br />
          興味のある論文をいいねに追加しましょう。
        </p>
      </div>
    );
  }

  return (
    <div className={styles.libraryPageContainer}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>いいねした論文ライブラリ</h1>
        <p className={styles.pageSubtitle}>{likedPapers.length} 件の論文があります</p>
      </header>
      <ul className={styles.paperList}>
        {likedPapers.map((paper) => (
          <li key={paper.id} className={styles.paperListItem}>
            <Link href={`/library/${paper.id}`} className={styles.paperTitleLink}>
              <span className={styles.paperTitleText}>{paper.title}</span>
            </Link>
            <button
              onClick={() => handleRemoveFromLibrary(paper.id, paper.title)}
              className={styles.removeButton}
              aria-label={`「${paper.title}」をライブラリから削除`}
            >
              <TrashIcon className={styles.removeButtonIcon} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}