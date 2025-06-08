// apps/web/src/app/library/page.tsx
'use client';

import React, { useState, useCallback } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLikedPapers } from '@/contexts/LikedPapersContext';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import FormattedTextRenderer from '@/components/FormattedTextRenderer';
import PaperCard from '@/components/PaperCard';
import styles from './library.module.css';
import paperCardStyles from '@/components/PaperCard.module.css'; // PaperCardのスタイルをインポート
import { BookmarkSlashIcon } from '@heroicons/react/24/outline'; // ライブラリが空の場合のアイコン例

export default function LibraryPage() {
  // ★★★ 修正点: isPaperLiked を削除 ★★★
  const { likedPapers, removeLikedPaper, updateLikedPaperSummary, isLoadingPersistence } = useLikedPapers();
  const [isSummarizing, setIsSummarizing] = useState<string | null>(null);
  const router = useRouter();

  const handleRemoveFromLibrary = (paperId: string, paperTitle: string) => {
    if (confirm(`「${paperTitle}」をライブラリから削除しますか？`)) {
      removeLikedPaper(paperId);
    }
  };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleGenerateSummary = useCallback(async (paperId: string, pdfUrl: string, paperTitle: string) => {
    if (isSummarizing === paperId || !pdfUrl) return;

    setIsSummarizing(paperId);
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl, paperTitle }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `要約の生成に失敗しました (Status: ${response.status})`);
      }
      const data = await response.json();
      updateLikedPaperSummary(paperId, data.summary);
    } catch (error) {
      console.error('Failed to generate summary in library:', error);
      alert(`要約生成エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsSummarizing(null);
    }
  }, [isSummarizing, updateLikedPaperSummary]);

  const handleViewDetails = (paperId: string) => {
    router.push(`/library/${paperId}`);
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
          <PaperCard
            key={paper.id}
            paper={paper}
            // isSummarizing={false} // ライブラリページでは要約生成中の状態は通常不要
            // onGenerateAiSummary={undefined} // ライブラリページでは要約生成は行わない想定
            onRemoveFromLibrary={(paperId) => handleRemoveFromLibrary(paperId, paper.title)} // ライブラリから削除する関数を渡す
            showSwipeButtons={false} // ライブラリページではスワイプボタンは不要
            isLiked={likedPapers.some(p => p.id === paper.id)} // いいね状態を表示
            onViewDetails={handleViewDetails} // 詳細ページへの遷移関数を渡す
            className={`${paperCardStyles.card} ${paperCardStyles.static} ${styles.libraryCard}`} // 3つのクラスを結合
          />
        ))}
      </ul>
    </div>
  );
}
