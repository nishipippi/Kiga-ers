// apps/web/src/app/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import FormattedTextRenderer from '@/components/FormattedTextRenderer';
import styles from './page.module.css'; // CSS Modules をインポート
import { SparklesIcon, ChevronRightIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';

interface Paper {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  updated: string;
  pdfLink: string;
  categories: string[];
  aiSummary?: string;
}

const SWIPE_THRESHOLD = 70;
const SWIPE_MAX_ROTATION = 12;
const SWIPE_TRANSLATE_X_SCALE = 1.1;
// const SWIPE_FEEDBACK_OPACITY = 'opacity-40'; // CSS Modulesで定義するため不要
const VISIBLE_CARDS_IN_STACK = 2;

export default function HomePage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [currentPaperIndex, setCurrentPaperIndex] = useState(0);
  const [likedPapers, setLikedPapers] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>('Kiga-ers へようこそ！論文を探しています...');
  const [isLoading, setIsLoading] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const [interactionState, setInteractionState] = useState<{
    isSwiping: boolean;
    cardTransform: string;
    feedbackColor: string; // 'feedbackPink' or 'feedbackLime' (CSS Module class name)
    flyingDirection: 'left' | 'right' | null;
  }>({
    isSwiping: false,
    cardTransform: '',
    feedbackColor: '',
    flyingDirection: null,
  });

  const topCardRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const fetchPapers = useCallback(async () => {
    setIsLoading(true);
    setMessage('新しい論文を探しています...');
    setInteractionState(prev => ({ ...prev, cardTransform: '', feedbackColor: '', flyingDirection: null }));
    try {
      const response = await fetch('/api/papers');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`論文データの取得に失敗しました。 Status: ${response.status}. ${errorData.error || ''}`);
      }
      const data: Paper[] = await response.json();
      if (data && data.length > 0) {
        setPapers(prevPapers => {
            const newPapers = data.filter(p => !prevPapers.some(pp => pp.id === p.id));
            return [...prevPapers, ...newPapers];
        });
        // setCurrentPaperIndex は初回ロード時や論文が枯渇した際に調整
        if (currentPaperIndex >= papers.length + (data.filter(p => !papers.some(pp => pp.id === p.id)).length) && data.length > 0 && papers.length === 0) {
             setCurrentPaperIndex(0);
        }
        setMessage(null);
      } else if (papers.length === 0) { // 初回ロードで何も取得できなかった場合
        setPapers([]);
        setMessage('表示できる論文が見つかりませんでした。後ほど再読み込みしてください。');
      }
    } catch (error) {
      console.error('Failed to fetch papers:', error);
      setMessage(`論文の読み込みエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
      if (papers.length === 0) setPapers([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPaperIndex, papers]); // papers を依存配列に追加

  useEffect(() => {
    if (papers.length === 0 || currentPaperIndex >= papers.length - VISIBLE_CARDS_IN_STACK +1 ) { // +1して早めにfetch
        if (!isLoading) { // fetchPapersが連続で呼ばれないように
            fetchPapers();
        }
    }
  }, [fetchPapers, currentPaperIndex, papers.length, isLoading]);


  const generateAiSummary = useCallback(async (paperId: string, textToSummarize: string) => {
    if (!textToSummarize || isSummarizing) return;
    setIsSummarizing(true);
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textToSummarize }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`要約の生成に失敗しました。 Status: ${response.status}. ${errorData.error || ''}`);
      }
      const data = await response.json();
      setPapers(prevPapers =>
        prevPapers.map(paper =>
          paper.id === paperId ? { ...paper, aiSummary: data.summary } : paper
        )
      );
    } catch (error) {
      console.error('Failed to generate summary:', error);
      alert(`要約生成エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      setIsSummarizing(false);
    }
  }, [isSummarizing]);

  const resetCardInteraction = () => {
    setInteractionState(prev => ({ ...prev, isSwiping: false, cardTransform: '', feedbackColor: '' }));
    touchStartX.current = null;
    touchCurrentX.current = null;
    touchStartY.current = null;
  };

  const goToNextPaper = useCallback(() => {
    setCurrentPaperIndex(prevIndex => prevIndex + 1);
    setTimeout(() => {
        setInteractionState(prev => ({ ...prev, flyingDirection: null, cardTransform: '' }));
    }, 100);
  }, []);

  const handleSwipeAction = useCallback((direction: 'left' | 'right') => {
    const paperToRate = papers[currentPaperIndex];
    if (!paperToRate) return;
    if (direction === 'right') {
      console.log(`いいね: ${paperToRate.title} (ID: ${paperToRate.id})`);
      setLikedPapers(prev => prev.includes(paperToRate.id) ? prev : [...prev, paperToRate.id]);
      setInteractionState(prev => ({ ...prev, flyingDirection: 'right', feedbackColor: styles.feedbackPink }));
    } else {
      console.log(`興味なし: ${paperToRate.title} (ID: ${paperToRate.id})`);
      setInteractionState(prev => ({ ...prev, flyingDirection: 'left', feedbackColor: styles.feedbackLime }));
    }
    setTimeout(() => { goToNextPaper(); }, 600);
  }, [papers, currentPaperIndex, goToNextPaper]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!e.touches[0] || interactionState.flyingDirection) return;
    resetCardInteraction();
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setInteractionState(prev => ({...prev, isSwiping: true }));
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null || !e.touches[0] || touchStartY.current === null || !topCardRef.current || interactionState.flyingDirection) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    touchCurrentX.current = currentX;
    const diffX = currentX - touchStartX.current;
    const diffY = Math.abs(currentY - touchStartY.current);

    if (diffY > Math.abs(diffX) * 1.8 && diffY > 15) {
        if(interactionState.isSwiping) resetCardInteraction();
        return;
    }
    const rotation = (diffX / topCardRef.current.offsetWidth) * SWIPE_MAX_ROTATION;
    const translateX = diffX * SWIPE_TRANSLATE_X_SCALE;
    setInteractionState(prev => ({
        ...prev,
        cardTransform: `translateX(${translateX}px) rotate(${rotation}deg)`,
        feedbackColor: Math.abs(diffX) > SWIPE_THRESHOLD / 2
                        ? (diffX > 0 ? styles.feedbackPink : styles.feedbackLime)
                        : ''
    }));
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchCurrentX.current === null || !interactionState.isSwiping || interactionState.flyingDirection) {
      if (interactionState.isSwiping && !interactionState.flyingDirection) resetCardInteraction();
      return;
    }
    const diffX = touchCurrentX.current - touchStartX.current;
    if (Math.abs(diffX) > SWIPE_THRESHOLD) {
      handleSwipeAction(diffX > 0 ? 'right' : 'left');
    } else {
      resetCardInteraction();
    }
    setInteractionState(prev => ({...prev, isSwiping: false }));
  };

  // papersInStack をJSXの条件分岐の前に計算
  const papersInStack = papers.slice(currentPaperIndex, currentPaperIndex + VISIBLE_CARDS_IN_STACK);

  if (isLoading && papersInStack.length === 0 && papers.length === 0) {
    return (
      <div className={styles.loadingStateContainer}>
        <div className={styles.loadingStateBox}>
          <h1 className={`${styles.loadingStateTitle} pop-title`}>{message || "読み込み中..."}</h1>
          <div className={styles.loadingSpinner}></div>
        </div>
      </div>
    );
  }

  if (!isLoading && papersInStack.length === 0) { // papers.length === 0 もしくは表示できるものがない場合
    return (
      <div className={styles.loadingStateContainer}>
        <div className={styles.loadingStateBox}>
          <h1 className={`${styles.loadingStateTitle} pop-title`}>{message || "表示できる論文がありません。"}</h1>
          <button
            onClick={fetchPapers}
            className={styles.reloadButton}
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <h1 className={`${styles.title} pop-title`}>
          Kiga-ers
        </h1>
        <p className={styles.subtitle}>
          いいねした論文: {likedPapers.length}件
        </p>
      </header>

      <main className={styles.mainContentArea}>
        {papersInStack.slice().reverse().map((paper, indexInVisibleStack_reversed) => { // .slice()でコピーしてからreverse
          const indexInStack = (VISIBLE_CARDS_IN_STACK - 1) - indexInVisibleStack_reversed;
          const isTopCard = indexInStack === 0;

          const cardDynamicStyles: React.CSSProperties = {};
          let animationClass = ''; // This will be a string of CSS module class names or empty

          if (isTopCard) {
            cardDynamicStyles.transform = interactionState.cardTransform;
            if (interactionState.flyingDirection === 'left') animationClass = styles.animateFlyOutLeft || '';
            if (interactionState.flyingDirection === 'right') animationClass = styles.animateFlyOutRight || '';
          } else {
            if (!interactionState.flyingDirection) {
                cardDynamicStyles.transform = `scale(${1 - (indexInStack * 0.04)}) translateY(${indexInStack * 8}px) rotate(${indexInStack * (indexInStack % 2 === 0 ? -1:1) * 1}deg)`;
                cardDynamicStyles.opacity = 1 - (indexInStack * 0.4);
            } else if (indexInStack === 1) {
                animationClass = styles.animateNextCardEnter || '';
            }
          }
          
          let cardClasses = styles.card;
          if (isTopCard && interactionState.isSwiping) cardClasses += ` ${styles.activeGrab}`;
          if (animationClass) cardClasses += ` ${animationClass}`; // Add animation class if present
          if (interactionState.isSwiping && isTopCard) cardClasses += ` ${styles.isSwiping}`;

          return (
            <div
              key={paper.id + (isTopCard ? '-top' : '-next')}
              ref={isTopCard ? topCardRef : null}
              className={cardClasses}
              style={{
                zIndex: VISIBLE_CARDS_IN_STACK - indexInStack,
                touchAction: isTopCard ? 'none' : 'auto',
                ...cardDynamicStyles,
              }}
              onTouchStart={isTopCard ? handleTouchStart : undefined}
              onTouchMove={isTopCard ? handleTouchMove : undefined}
              onTouchEnd={isTopCard ? handleTouchEnd : undefined}
              onTouchCancel={isTopCard ? handleTouchEnd : undefined}
            >
              {isTopCard && interactionState.isSwiping && interactionState.feedbackColor && (
                <div 
                  className={`${styles.swipeFeedbackOverlay} ${interactionState.feedbackColor}`}
                ></div>
              )}

              <div className={`${styles.cardScrollableContent} thin-scrollbar`}>
                <h2 className={styles.cardTitle}>
                  <FormattedTextRenderer text={paper.title} />
                </h2>
                <p className={styles.cardAuthors}>
                  Authors: {paper.authors.join(', ')}
                </p>
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
                    {!paper.aiSummary && !isSummarizing && (
                      <button
                        onClick={(e) => { e.stopPropagation(); generateAiSummary(paper.id, paper.summary); }}
                        className={styles.generateButton}
                      >
                        生成
                      </button>
                    )}
                  </h3>
                  {isSummarizing && currentPaperIndex < papers.length && papers[currentPaperIndex]?.id === paper.id ? (
                    <p className={styles.aiSummaryLoading}>AIが要約を生成中です...</p>
                  ) : paper.aiSummary ? (
                    <p className={styles.aiSummaryText}><FormattedTextRenderer text={paper.aiSummary} /></p>
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
                  {paper.categories.map(category => (
                    <span key={category} className={styles.categoryTag}>
                      {category}
                    </span>
                  ))}
                </div>
              </div>

              <div className={styles.pdfButtonArea}>
                <div className={styles.pdfButtonContainer}>
                  {paper.pdfLink ? (
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
                  ) : <div className={styles.pdfPlaceholder}></div>}
                </div>
              </div>
            </div>
          );
        })}
      </main>
      {isLoading && papersInStack.length > 0 && ( // isLoading中でも、既に表示できる論文があればローディングインジケータを出す
          <div className={styles.loadingMoreIndicator}>
              Loading more...
          </div>
      )}
    </div>
  );
}