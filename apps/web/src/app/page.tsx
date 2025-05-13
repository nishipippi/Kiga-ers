// apps/web/src/app/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import FormattedTextRenderer from '@/components/FormattedTextRenderer';

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

const SWIPE_THRESHOLD = 80;
const SWIPE_MAX_ROTATION = 15;
const SWIPE_TRANSLATE_X_SCALE = 1.2;
const SWIPE_FEEDBACK_OPACITY = 'opacity-40';

// カードスタックで表示する枚数 (トップ + 背景に見えるもの)
const VISIBLE_CARDS_IN_STACK = 2; // トップカードと次のカード1枚

export default function HomePage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [currentPaperIndex, setCurrentPaperIndex] = useState(0);
  const [likedPapers, setLikedPapers] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>('Kiga-ers へようこそ！論文を探しています...');
  const [isLoading, setIsLoading] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // スワイプアニメーション用
  const [interactionState, setInteractionState] = useState<{
    isSwiping: boolean;
    cardTransform: string;
    feedbackColor: string;
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
        setPapers(prevPapers => [...prevPapers, ...data.filter(p => !prevPapers.some(pp => pp.id === p.id))]); // 新しい論文を既存リストに追加（重複排除）
        // setPapers(data); // 毎回新しいリストにする場合
        if (currentPaperIndex >= papers.length && data.length > 0) { // もし現在のインデックスが範囲外ならリセット
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
  }, [currentPaperIndex, papers.length]); // papers.length を依存配列に追加

  useEffect(() => {
    // 初回ロードまたは論文が少なくなったら追加ロード
    if (papers.length === 0 || currentPaperIndex >= papers.length - VISIBLE_CARDS_IN_STACK) {
        fetchPapers();
    }
  }, [fetchPapers, currentPaperIndex, papers.length]);


  const generateAiSummary = useCallback(async (paperId: string, textToSummarize: string) => {
    // (generateAiSummary の中身は変更なし)
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
    setInteractionState(prev => ({
        ...prev,
        isSwiping: false,
        cardTransform: '',
        feedbackColor: '',
    }));
    touchStartX.current = null;
    touchCurrentX.current = null;
    touchStartY.current = null;
  };

  const goToNextPaper = useCallback(() => {
    setCurrentPaperIndex(prevIndex => prevIndex + 1);
    // アニメーション終了後に flyingDirection をリセット
    // fetchPapers は useEffect で currentPaperIndex の変更を検知して呼ばれる
    setTimeout(() => {
        setInteractionState(prev => ({ ...prev, flyingDirection: null, cardTransform: '' }));
    }, 100); // アニメーションクラスが外れる猶予
  }, []);


  const handleSwipeAction = useCallback((direction: 'left' | 'right') => {
    const paperToRate = papers[currentPaperIndex];
    if (!paperToRate) return;

    if (direction === 'right') {
      console.log(`いいね: ${paperToRate.title} (ID: ${paperToRate.id})`);
      setLikedPapers(prev => prev.includes(paperToRate.id) ? prev : [...prev, paperToRate.id]);
      setInteractionState(prev => ({ ...prev, flyingDirection: 'right', feedbackColor: 'bg-brand-accent-pink' }));
    } else {
      console.log(`興味なし: ${paperToRate.title} (ID: ${paperToRate.id})`);
      setInteractionState(prev => ({ ...prev, flyingDirection: 'left', feedbackColor: 'bg-brand-accent-lime' }));
    }

    // アニメーションの時間はCSSで定義 (0.6s)
    setTimeout(() => {
        goToNextPaper();
    }, 600);
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
        feedbackColor: Math.abs(diffX) > SWIPE_THRESHOLD / 3 
                        ? (diffX > 0 ? 'bg-brand-accent-pink' : 'bg-brand-accent-lime') 
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

  // 表示する論文のリストを準備 (スタック用)
  const papersInStack = papers.slice(currentPaperIndex, currentPaperIndex + VISIBLE_CARDS_IN_STACK);
  if (isLoading && papersInStack.length === 0 && papers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-pop-lg">
          <h1 className="text-3xl md:text-4xl pop-title mb-3 text-brand-primary">{message || "読み込み中..."}</h1>
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-brand-primary mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!isLoading && papersInStack.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-pop-lg">
          <h1 className="text-3xl md:text-4xl pop-title mb-3 text-brand-primary">{message || "表示できる論文がありません。"}</h1>
          <button
            onClick={fetchPapers}
            className="mt-6 bg-brand-primary hover:bg-opacity-80 text-white font-semibold py-3 px-8 rounded-full transition-all duration-200 shadow-pop-md focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-opacity-50 transform hover:scale-105"
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 overflow-hidden select-none" style={{ touchAction: 'pan-y' }}>
      <header className="my-6 text-center">
        <h1 className="text-4xl md:text-5xl pop-title text-brand-primary drop-shadow-sm">
          Kiga-ers
        </h1>
        <p className="text-sm text-brand-primary/80 mt-1">
          気になる論文をスワイプ！ いいねした論文: {likedPapers.length}件
        </p>
      </header>

      <main className="relative w-full max-w-xl h-[70vh] flex items-center justify-center">
        {papersInStack.reverse().map((paper, indexInVisibleStack_reversed) => {
          const indexInStack = (VISIBLE_CARDS_IN_STACK - 1) - indexInVisibleStack_reversed; // 0がトップ、1が次
          const isTopCard = indexInStack === 0;

          let cardDynamicStyle: React.CSSProperties = {};
          let animationClass = '';

          if (isTopCard) {
            cardDynamicStyle.transform = interactionState.cardTransform;
            if (interactionState.flyingDirection === 'left') animationClass = 'animate-flyOutLeft';
            if (interactionState.flyingDirection === 'right') animationClass = 'animate-flyOutRight';
          } else { // 次のカードのスタイル (トップカードが飛んでいない時)
            if (!interactionState.flyingDirection) {
                cardDynamicStyle.transform = `scale(${1 - (indexInStack * 0.05)}) translateY(${indexInStack * 10}px) rotate(${indexInStack * (indexInStack % 2 === 0 ? -1:1) * 1.5}deg)`;
                cardDynamicStyle.opacity = 1 - (indexInStack * 0.3);
            } else if (indexInStack === 1) { // トップが飛んでいて、このカードが次のトップになる場合
                animationClass = 'animate-nextCardEnter';
            }
          }
          
          return (
            <div
              key={paper.id + (isTopCard ? '-top' : '-next')}
              ref={isTopCard ? topCardRef : null}
              className={`absolute bg-brand-card-bg rounded-2xl shadow-pop-lg p-6 w-full text-left border border-brand-primary/10 h-full flex flex-col
                          cursor-grab ${isTopCard && interactionState.isSwiping ? 'active:cursor-grabbing' : ''}
                          ${animationClass}
                          transition-transform duration-300 ease-out ${interactionState.isSwiping && isTopCard ? '!duration-[0s]' : ''}
                        `}
              style={{
                zIndex: VISIBLE_CARDS_IN_STACK - indexInStack,
                touchAction: isTopCard ? 'none' : 'auto', // トップカードのみスワイプ操作をハンドル
                ...cardDynamicStyle,
              }}
              onTouchStart={isTopCard ? handleTouchStart : undefined}
              onTouchMove={isTopCard ? handleTouchMove : undefined}
              onTouchEnd={isTopCard ? handleTouchEnd : undefined}
              onTouchCancel={isTopCard ? handleTouchEnd : undefined}
            >
              {/* スワイプ時の色フィードバック用オーバーレイ */}
              {isTopCard && interactionState.isSwiping && interactionState.feedbackColor && (
                <div className={`absolute inset-0 rounded-2xl ${interactionState.feedbackColor} ${SWIPE_FEEDBACK_OPACITY} z-0`}></div>
              )}

              <div className="relative z-10 flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-brand-primary/30 scrollbar-track-transparent" style={{ touchAction: 'pan-y' }}>
                <h2 className="text-xl lg:text-2xl font-semibold mb-3 text-brand-primary leading-tight sticky top-0 bg-brand-card-bg/80 backdrop-blur-sm pt-2 pb-1 z-20">
                  <FormattedTextRenderer text={paper.title} />
                </h2>
                <p className="text-sm text-brand-primary/70 mb-3 italic">
                  Authors: {paper.authors.join(', ')}
                </p>
                <div className="text-xs text-brand-primary/50 mb-4 space-x-2">
                  <span>Published: {new Date(paper.published).toLocaleDateString()}</span> /
                  <span>Updated: {new Date(paper.updated).toLocaleDateString()}</span>
                </div>

                {/* AI Summary Section */}
                <div className="mb-5 p-4 bg-brand-primary/5 rounded-lg border border-brand-primary/10">
                  <h3 className="font-semibold text-brand-primary mb-2 flex items-center justify-between">
                    <span className="flex items-center">
                      <SparklesIcon className="h-5 w-5 mr-1.5 text-brand-accent-pink" />
                      AIによる要約
                    </span>
                    {!paper.aiSummary && !isSummarizing && (
                      <button
                        onClick={(e) => { e.stopPropagation(); generateAiSummary(paper.id, paper.summary); }}
                        className="bg-brand-accent-pink hover:bg-opacity-80 text-white text-xs font-bold py-1 px-3 rounded-full shadow-sm focus:outline-none focus:ring-2 ring-brand-accent-pink ring-opacity-50 transform hover:scale-105"
                      >
                        生成
                      </button>
                    )}
                  </h3>
                  {isSummarizing && papers[currentPaperIndex]?.id === paper.id ? (
                    <p className="text-sm text-brand-primary/70 italic animate-pulse">AIが要約を生成中です...</p>
                  ) : paper.aiSummary ? (
                    <p className="text-sm text-brand-primary leading-relaxed"><FormattedTextRenderer text={paper.aiSummary} /></p>
                  ) : (
                    <p className="text-sm text-brand-primary/50 italic">（AI要約を生成しますか？）</p>
                  )}
                </div>

                {/* Original Abstract Section */}
                <details className="mb-5 group" onClick={(e) => e.stopPropagation()}>
                  <summary className="cursor-pointer text-sm font-medium text-brand-primary/80 hover:text-brand-primary list-none flex items-center">
                    <ChevronRightIcon className="h-4 w-4 group-open:rotate-90 transform transition-transform duration-200 mr-1" />
                    元のAbstractを見る
                  </summary>
                  <div className="text-brand-primary/90 mt-2 text-sm bg-brand-primary/5 p-3 rounded-md border border-brand-primary/10 leading-relaxed">
                    <FormattedTextRenderer text={paper.summary} />
                  </div>
                </details>

                <div className="flex flex-wrap gap-2 mb-6">
                  {paper.categories.map(category => (
                    <span key={category} className="bg-brand-primary/10 text-brand-primary/80 text-xs font-medium px-3 py-1 rounded-full shadow-sm">
                      {category}
                    </span>
                  ))}
                </div>
              </div> {/* End scrollable content */}

              {/* PDF Link - カード下部に配置 */}
              <div className="sticky bottom-0 bg-brand-card-bg/80 backdrop-blur-sm pt-3 pb-1 mt-auto z-20 border-t border-brand-primary/10">
                <div className="flex justify-center">
                  {paper.pdfLink ? (
                    <a
                      href={paper.pdfLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center bg-brand-primary hover:bg-opacity-80 text-white text-sm font-semibold py-2 px-5 rounded-full shadow-pop-md focus:outline-none focus:ring-2 ring-brand-primary ring-opacity-50 transform hover:scale-105"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4 mr-1.5" />
                      PDFを開く
                    </a>
                  ) : <div className="h-9"></div> /* 高さを合わせるためのプレースホルダー */}
                </div>
              </div>
            </div>
          );
        })}
      </main>
      {/* ローディングインジケータ (スワイプ中など軽微なもの) */}
      {isLoading && papersInStack.length > 0 && (
          <div className="fixed bottom-5 right-5 bg-brand-primary/80 text-white text-xs px-3 py-1 rounded-full shadow-md animate-pulse">
              Loading more...
          </div>
      )}
    </div>
  );
}

// アイコンコンポーネントの例 (heroiconsなどからインポート)
// npm install @heroicons/react または yarn add @heroicons/react
// import { SparklesIcon, ChevronRightIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'; // or solid
const SparklesIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L1.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.25 12L17 14.25l-1.25-2.25L13.75 12l2.008-.75L17 9.75l1.25 1.5L20.25 12l-2.008.75z" /></svg>
);
const ChevronRightIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
);
const ArrowDownTrayIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
);