// apps/web/src/app/library/page.tsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation'; // 詳細ページへの遷移に使用
import { useLikedPapers } from '@/contexts/LikedPapersContext';
import PaperCard from '@/components/PaperCard';
import styles from './library.module.css';
import { BookmarkSlashIcon } from '@heroicons/react/24/outline'; // ライブラリが空の場合のアイコン例

export default function LibraryPage() {
  const { likedPapers, removeLikedPaper, isPaperLiked } = useLikedPapers();
  const router = useRouter();

  const handleViewDetails = (paperId: string) => {
    router.push(`/library/${paperId}`);
  };

  const handleRemoveFromLibrary = (paperId: string) => {
    // 確認ダイアログなどを挟んでも良い
    removeLikedPaper(paperId);
  };

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
      <div className={styles.papersGrid}>
        {likedPapers.map((paper) => (
          <PaperCard
            key={paper.id}
            paper={paper}
            // isSummarizing={false} // ライブラリページでは要約生成中の状態は通常不要
            // onGenerateAiSummary={undefined} // ライブラリページでは要約生成は行わない想定
            onRemoveFromLibrary={handleRemoveFromLibrary} // ライブラリから削除する関数を渡す
            showSwipeButtons={false} // ライブラリページではスワイプボタンは不要
            isLiked={isPaperLiked(paper.id)} // いいね状態を表示
            onViewDetails={handleViewDetails} // 詳細ページへの遷移関数を渡す
            className={styles.libraryCard} // ライブラリ用の追加スタイル
          />
        ))}
      </div>
    </div>
  );
}