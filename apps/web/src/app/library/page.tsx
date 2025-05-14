// apps/web/src/app/library/page.tsx
'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { useLikedPapers } from '@/contexts/LikedPapersContext';
import FormattedTextRenderer from '@/components/FormattedTextRenderer';
import styles from './library.module.css';
import { BookmarkSlashIcon, TrashIcon, SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function LibraryPage() {
  // ★★★ 修正点: isPaperLiked を削除 ★★★
  const { likedPapers, removeLikedPaper, updateLikedPaperSummary, isLoadingPersistence } = useLikedPapers();
  const [isSummarizing, setIsSummarizing] = useState<string | null>(null);

  const handleRemoveFromLibrary = (paperId: string, paperTitle: string) => {
    if (confirm(`「${paperTitle}」をライブラリから削除しますか？`)) {
      removeLikedPaper(paperId);
    }
  };

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
            <div className={styles.paperInfo}>
              <Link href={`/library/${paper.id}`} className={styles.paperTitleLink}>
                <span className={styles.paperTitleText}>{paper.title}</span>
              </Link>
              {paper.aiSummary ? (
                <p className={styles.aiSummaryText}>
                  <FormattedTextRenderer text={paper.aiSummary} />
                </p>
              ) : (
                <div className={styles.summaryActions}>
                  {isSummarizing === paper.id ? (
                    <div className={styles.summarizingIndicator}>
                      <ArrowPathIcon className={styles.summarizingIcon} />
                      <span>要約を生成中...</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleGenerateSummary(paper.id, paper.pdfLink, paper.title)}
                      className={styles.generateSummaryButton}
                      disabled={!paper.pdfLink}
                    >
                      <SparklesIcon className={styles.generateSummaryIcon} />
                      AI要約を生成
                    </button>
                  )}
                   {!paper.pdfLink && <small className={styles.noPdfLinkWarning}> (PDFリンクが無いため要約できません)</small>}
                </div>
              )}
            </div>
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