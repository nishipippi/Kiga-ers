// apps/web/src/components/PaperCard.tsx
'use client';

import React from 'react';
import FormattedTextRenderer from '@/components/FormattedTextRenderer';
import styles from './PaperCard.module.css'; // CSS Modules を作成
import { SparklesIcon, ChevronRightIcon, ArrowDownTrayIcon, HandThumbUpIcon, HandThumbDownIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { Paper } from '@/contexts/LikedPapersContext'; // LikedPapersContextからPaper型をインポート (または共通の型定義から)

interface PaperCardProps {
  paper: Paper;
  isSummarizing?: boolean; // AI要約生成中かどうか
  onGenerateAiSummary?: (paperId: string, pdfUrl: string, paperTitle: string) => void; // AI要約生成関数
  onLike?: (paper: Paper) => void; // いいね関数 (Paperオブジェクト全体を渡すように変更も検討)
  onDislike?: () => void; // ★★★ paperId を受け取らないように変更 ★★★
  onRemoveFromLibrary?: (paperId: string) => void; // ライブラリから削除する関数 (ライブラリページ用)
  showSwipeButtons?: boolean; // ホームページのようにスワイプ操作を示唆するボタンを表示するか
  isLiked?: boolean; // この論文がいいねされているか (UI表示用)
  cardRef?: React.RefObject<HTMLDivElement | null> | undefined; // スワイプアニメーション用
  cardStyle?: React.CSSProperties; // スワイプアニメーション用
  onTouchStart?: (e: React.TouchEvent<HTMLDivElement>) => void; // スワイプ用
  onTouchMove?: (e: React.TouchEvent<HTMLDivElement>) => void; // スワイプ用
  onTouchEnd?: (e: React.TouchEvent<HTMLDivElement>) => void; // スワイプ用
  onTouchCancel?: (e: React.TouchEvent<HTMLDivElement>) => void; // スワイプ用
  className?: string; // 追加のクラス名
  isTopCard?: boolean; // スワイプインタラクションを有効にするかどうかの判断材料
  interactionState?: { // ホームページから渡されるスワイプインタラクションの状態
    isSwiping: boolean;
    feedbackColor: string;
    flyingDirection: 'left' | 'right' | null;
  };
  onViewDetails?: (paperId: string) => void; // 詳細表示への遷移関数 (ライブラリ一覧ページ用)
}

export default function PaperCard({
  paper,
  isSummarizing,
  onGenerateAiSummary,
  onLike,
  onDislike,
  onRemoveFromLibrary,
  showSwipeButtons = true, // デフォルトは表示
  isLiked = false, // デフォルトはいいねされていない
  cardRef,
  cardStyle,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
  className = '',
  isTopCard = false,
  interactionState,
  onViewDetails,
}: PaperCardProps) {

  const handleGenerateSummaryClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // 親要素へのイベント伝播を停止
    if (onGenerateAiSummary && paper.pdfLink) {
      onGenerateAiSummary(paper.id, paper.pdfLink, paper.title);
    }
  };

  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onLike) {
      onLike(paper);
    }
  };

const handleDislikeClick = (e: React.MouseEvent) => {
  e.stopPropagation();
  if (onDislike) {
    onDislike(); // ★★★ 引数なしで呼び出す ★★★
  }
};

  const handleRemoveFromLibraryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemoveFromLibrary) {
      onRemoveFromLibrary(paper.id);
    }
  };

  const handleCardClick = () => {
    if (onViewDetails) {
      onViewDetails(paper.id);
    }
  };

  // エンドオブフィードカードのレンダリング
  if (paper.isEndOfFeedCard) {
    return (
      <div
        ref={cardRef}
        className={`${styles.card} ${styles.endOfFeedCard} ${className}`}
        style={{ ...cardStyle, touchAction: isTopCard ? 'pan-y' : 'auto' }} // スワイプを許可しつつ縦スクロールも考慮
        onTouchStart={isTopCard ? onTouchStart : undefined}
        onTouchMove={isTopCard ? onTouchMove : undefined}
        onTouchEnd={isTopCard ? onTouchEnd : undefined}
        onTouchCancel={isTopCard ? onTouchCancel : undefined}
      >
        <div className={styles.endOfFeedContent}>
          <h2 className={`${styles.cardTitle} ${styles.endOfFeedTitle}`}>{paper.title}</h2>
          <p className={styles.endOfFeedMessage}>{paper.endOfFeedMessage}</p>
          {/* 「さらに試す」や「検索クリア」ボタンはpage.tsx側で条件分岐して表示した方が汎用性が高いかも */}
        </div>
      </div>
    );
  }

  // 通常の論文カード
  return (
    <div
      ref={cardRef}
      className={`${styles.card} ${className} ${isTopCard && interactionState?.isSwiping ? styles.activeGrab : ''}`}
      style={{ ...cardStyle, touchAction: isTopCard ? 'none' : 'auto' }} // トップカードでスワイプ中は縦スクロール無効
      onTouchStart={isTopCard ? onTouchStart : undefined}
      onTouchMove={isTopCard ? onTouchMove : undefined}
      onTouchEnd={isTopCard ? onTouchEnd : undefined}
      onTouchCancel={isTopCard ? onTouchCancel : undefined}
      onClick={onViewDetails ? handleCardClick : undefined} // 詳細表示関数があればクリックイベントを設定
      role={onViewDetails ? "button" : undefined}
      tabIndex={onViewDetails ? 0 : undefined}
      onKeyDown={onViewDetails ? (e) => e.key === 'Enter' && handleCardClick() : undefined}

    >
      {isTopCard && interactionState?.isSwiping && interactionState.feedbackColor && !interactionState.flyingDirection && (
        <div className={`${styles.swipeFeedbackOverlay} ${interactionState.feedbackColor}`}></div>
      )}
      <div className={`${styles.cardScrollableContent} thin-scrollbar`}>
        <h2 className={styles.cardTitle}>
          <FormattedTextRenderer text={paper.title} />
        </h2>
        <p className={styles.cardAuthors}>Authors: {paper.authors.join(', ')}</p>
        <div className={styles.cardDates}>
          <span>Published: {new Date(paper.published).toLocaleDateString()}</span>
          <span>Updated: {new Date(paper.updated).toLocaleDateString()}</span>
        </div>

        <div className={styles.aiSummarySection}>
          <h3 className={styles.aiSummaryHeader}>
            <span className={styles.aiSummaryHeaderText}>
              <SparklesIcon />
              AIによる要約
            </span>
            {!paper.aiSummary && !isSummarizing && onGenerateAiSummary && (
              <button onClick={handleGenerateSummaryClick} className={styles.generateButton}>
                生成
              </button>
            )}
          </h3>
          {isSummarizing && !paper.aiSummary ? ( // paper.aiSummaryがまだない場合のみローディング表示
            <p className={styles.aiSummaryLoading}>AIが要約を生成中です...</p>
          ) : paper.aiSummary ? (
            <p className={styles.aiSummaryText}>
              <FormattedTextRenderer text={paper.aiSummary} />
            </p>
          ) : (
            <p className={styles.aiSummaryPlaceholder}>（AI要約を生成しますか？）</p>
          )}
        </div>

        <details className={styles.abstractSection} onClick={(e) => e.stopPropagation()}>
          <summary className={styles.abstractSummary}>
            <ChevronRightIcon />
            元のAbstractを見る
          </summary>
          <div className={styles.abstractContent}>
            <FormattedTextRenderer text={paper.summary} />
          </div>
        </details>

        <div className={styles.categoriesContainer}>
          {paper.categories.map((category) => (
            <span key={category} className={styles.categoryTag}>
              {category}
            </span>
          ))}
        </div>
      </div>

      {/* アクションボタンエリア */}
      <div className={`${styles.actionButtonsContainer} ${styles.pdfButtonArea}`}>
        {showSwipeButtons && onDislike && (
          <button
            onClick={handleDislikeClick}
            className={`${styles.pcActionButton} ${styles.pcDislikeButton}`}
            aria-label="興味なし"
          >
            <HandThumbDownIcon className={styles.pcActionButtonIcon} />
            <span className={styles.pcActionButtonText}>興味なし</span>
          </button>
        )}

        {paper.pdfLink && (
           <div className={styles.pdfButtonWrapper}>
            <a
                href={paper.pdfLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={styles.pdfButton}
            >
                <ArrowDownTrayIcon />
                PDFを開く
            </a>
           </div>
        )}
        {!paper.pdfLink && <div className={styles.pdfPlaceholder}></div>}


        {showSwipeButtons && onLike && (
          <button
            onClick={handleLikeClick}
            className={`${styles.pcActionButton} ${styles.pcLikeButton} ${isLiked ? styles.liked : ''}`}
            aria-label={isLiked ? "いいね済み" : "興味あり"}
          >
            <HandThumbUpIcon className={styles.pcActionButtonIcon} />
            <span className={styles.pcActionButtonText}>{isLiked ? "いいね済み" : "興味あり"}</span>
          </button>
        )}

        {onRemoveFromLibrary && ( // ライブラリからの削除ボタン
          <button
            onClick={handleRemoveFromLibraryClick}
            className={`${styles.pcActionButton} ${styles.pcRemoveButton}`}
            aria-label="ライブラリから削除"
          >
            <TrashIcon className={styles.pcActionButtonIcon} />
            <span className={styles.pcActionButtonText}>削除</span>
          </button>
        )}
      </div>
    </div>
  );
}