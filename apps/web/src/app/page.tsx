// apps/web/src/app/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import FormattedTextRenderer from '@/components/FormattedTextRenderer';
import styles from './page.module.css';
import { SparklesIcon, ChevronRightIcon, ArrowDownTrayIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

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
const VISIBLE_CARDS_IN_STACK = 2;

export default function HomePage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [currentPaperIndex, setCurrentPaperIndex] = useState(0);
  const [likedPapers, setLikedPapers] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>('Kiga-ers へようこそ！論文を探しています...');
  const [isLoading, setIsLoading] = useState(true); // 初期表示時はローディング中
  const [isSummarizing, setIsSummarizing] = useState(false);

  const [searchQuery, setSearchQuery] = useState(''); // 検索バーの入力値
  const [currentSearchTerm, setCurrentSearchTerm] = useState(''); // 実際にAPIに渡した検索語

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

  const fetchPapers = useCallback(async (isNewSearch = false, termToSearch = '') => {
    const effectiveSearchTerm = isNewSearch ? termToSearch : currentSearchTerm;
    console.log(`fetchPapers: Called (isNewSearch: ${isNewSearch}, term: "${effectiveSearchTerm}")`);

    // 既に同じ条件でローディング中、または新しい検索でないのにローディング中なら重複実行を避ける
    if (isLoading && (!isNewSearch || effectiveSearchTerm === currentSearchTerm)) {
        console.log('fetchPapers: Already loading or same search, skipping.');
        return;
    }

    setIsLoading(true);
    if (isNewSearch && effectiveSearchTerm) {
        setMessage(`「${effectiveSearchTerm}」の論文を検索中...`);
    } else if (isNewSearch) { // 初回デフォルトロード
        setMessage('Kiga-ers へようこそ！論文を探しています...');
    } else { // 追加ロード (検索語なしの場合)
        setMessage('新しい論文を読み込んでいます...');
    }
    setInteractionState(prev => ({ ...prev, cardTransform: '', feedbackColor: '', flyingDirection: null }));

    try {
      const apiUrl = effectiveSearchTerm ? `/api/papers?query=${encodeURIComponent(effectiveSearchTerm)}` : '/api/papers';
      const response = await fetch(apiUrl);
      console.log('fetchPapers: Response status', response.status, 'for URL:', apiUrl);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`論文データの取得に失敗しました。 Status: ${response.status}. ${errorData.error || ''}`);
      }
      const data: Paper[] = await response.json();
      console.log('fetchPapers: Data received, length:', data.length);

      if (isNewSearch) { // 新しい検索の場合、既存の論文を完全に置き換える
        setPapers(data || []); // データがnullやundefinedの場合も考慮
        setCurrentPaperIndex(0); // インデックスをリセット
        if (data && data.length > 0) {
            setMessage(null);
        } else {
            setMessage(effectiveSearchTerm ? `「${effectiveSearchTerm}」に一致する論文は見つかりませんでした。` : '表示できる論文が見つかりませんでした。');
        }
      } else { // 追加ロードの場合 (現在の検索語は維持)
        if (data && data.length > 0) {
            setPapers(prevPapers => {
                const existingIds = new Set(prevPapers.map(p => p.id));
                const newUniquePapers = data.filter(p => !existingIds.has(p.id));
                return [...prevPapers, ...newUniquePapers];
            });
            setMessage(null);
        } else {
            // 追加ロードでデータが0件だった場合、特にメッセージは変更しない (既に表示中の論文があるため)
            // ただし、もし全ての論文を見終わった後の追加ロードで0件なら、「以上です」のようなメッセージは出せる
            console.log('fetchPapers: No new papers found for additional load.');
        }
      }
    } catch (error) {
      console.error('fetchPapers: CATCH Error', error);
      setMessage(`論文の読み込みエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
      if (isNewSearch) setPapers([]); // エラー時は結果を空にする
    } finally {
      console.log('fetchPapers: FINALLY');
      setIsLoading(false);
    }
  }, [isLoading, currentSearchTerm]); // isLoadingとcurrentSearchTermに依存

  // 初回マウント時にデフォルトの論文をフェッチ
  useEffect(() => {
    console.log('useEffect (Mount): Calling initial fetchPapers for default content.');
    fetchPapers(true, ''); // isNewSearch=true, 検索語なしで初回ロード
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // マウント時に一度だけ実行

  // 論文が少なくなった時の追加ロード (現在の検索語がない場合のみ)
  useEffect(() => {
    console.log('useEffect (Index Change Check): papers.length:', papers.length, 'currentPaperIndex:', currentPaperIndex, 'isLoading:', isLoading, 'currentSearchTerm:', currentSearchTerm);
    if (!currentSearchTerm && papers.length > 0 && currentPaperIndex >= papers.length - VISIBLE_CARDS_IN_STACK && !isLoading) {
      console.log('useEffect (Index Change): Condition met for fetching more (non-search) papers.');
      fetchPapers(false, ''); // isNewSearch=false, 検索語なしで追加ロード
    }
  }, [currentPaperIndex, papers.length, isLoading, fetchPapers, currentSearchTerm]);


  const handleSearchInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handleSearchSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
    if (event) event.preventDefault();
    const term = searchQuery.trim();
    // 既に同じ検索語で検索済みか、またはローディング中でなければ検索実行
    if (term === currentSearchTerm && papers.length > 0 && !isLoading) {
        console.log('Search: Same term and results exist, not re-searching.');
        return;
    }
    if (isLoading && term === currentSearchTerm) {
        console.log('Search: Already loading for this term.');
        return;
    }

    console.log('Search submitted with new query:', term);
    setCurrentSearchTerm(term); // これが fetchPapers の依存配列に入っているので、再生成される
    fetchPapers(true, term);    // isNewSearch=true で新しい検索を実行
  };


  const generateAiSummary = useCallback(async (paperId: string, textToSummarize: string) => {
    if (!textToSummarize || isSummarizing) return;
    setIsSummarizing(true);
    try {
      const response = await fetch('/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ textToSummarize }), });
      if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(`要約の生成に失敗しました。 Status: ${response.status}. ${errorData.error || ''}`); }
      const data = await response.json();
      setPapers(prevPapers => prevPapers.map(p => p.id === paperId ? { ...p, aiSummary: data.summary } : p));
    } catch (error) { console.error('Failed to generate summary:', error); alert(`要約生成エラー: ${error instanceof Error ? error.message : '不明なエラー'}`); }
    finally { setIsSummarizing(false); }
  }, [isSummarizing]);

  const resetCardInteraction = () => { setInteractionState(prev => ({ ...prev, isSwiping: false, cardTransform: '', feedbackColor: '' })); touchStartX.current = null; touchCurrentX.current = null; touchStartY.current = null; };
  const goToNextPaper = useCallback(() => { setCurrentPaperIndex(prevIndex => prevIndex + 1); setTimeout(() => { setInteractionState(prev => ({ ...prev, flyingDirection: null, cardTransform: '' })); }, 100); }, []);
  const handleSwipeAction = useCallback((direction: 'left' | 'right') => { const paperToRate = papers[currentPaperIndex]; if (!paperToRate) return; if (direction === 'right') { setLikedPapers(prev => prev.includes(paperToRate.id) ? prev : [...prev, paperToRate.id]); setInteractionState(prev => ({ ...prev, flyingDirection: 'right', feedbackColor: styles.feedbackPink })); } else { setInteractionState(prev => ({ ...prev, flyingDirection: 'left', feedbackColor: styles.feedbackLime })); } setTimeout(() => { goToNextPaper(); }, 600); }, [papers, currentPaperIndex, goToNextPaper]);
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => { if (!e.touches[0] || interactionState.flyingDirection) return; resetCardInteraction(); touchStartX.current = e.touches[0].clientX; touchCurrentX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; setInteractionState(prev => ({...prev, isSwiping: true })); };
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => { if (touchStartX.current === null || !e.touches[0] || touchStartY.current === null || !topCardRef.current || interactionState.flyingDirection) return; const currentX = e.touches[0].clientX; const currentY = e.touches[0].clientY; touchCurrentX.current = currentX; const diffX = currentX - touchStartX.current; const diffY = Math.abs(currentY - touchStartY.current); if (diffY > Math.abs(diffX) * 1.8 && diffY > 15) { if(interactionState.isSwiping) resetCardInteraction(); return; } const rotation = (diffX / topCardRef.current.offsetWidth) * SWIPE_MAX_ROTATION; const translateX = diffX * SWIPE_TRANSLATE_X_SCALE; setInteractionState(prev => ({ ...prev, cardTransform: `translateX(${translateX}px) rotate(${rotation}deg)`, feedbackColor: Math.abs(diffX) > SWIPE_THRESHOLD / 2 ? (diffX > 0 ? styles.feedbackPink : styles.feedbackLime) : '' })); };
  const handleTouchEnd = () => { if (touchStartX.current === null || touchCurrentX.current === null || !interactionState.isSwiping || interactionState.flyingDirection) { if (interactionState.isSwiping && !interactionState.flyingDirection) resetCardInteraction(); return; } const diffX = touchCurrentX.current - touchStartX.current; if (Math.abs(diffX) > SWIPE_THRESHOLD) { handleSwipeAction(diffX > 0 ? 'right' : 'left'); } else { resetCardInteraction(); } setInteractionState(prev => ({...prev, isSwiping: false })); };

  const papersInStack = papers.slice(currentPaperIndex, currentPaperIndex + VISIBLE_CARDS_IN_STACK);
  console.log('Render - isLoading:', isLoading, 'papers.length:', papers.length, 'papersInStack.length:', papersInStack.length, 'currentPaperIndex:', currentPaperIndex, 'message:', message, 'searchTerm:', currentSearchTerm);

  // --- ローディング/メッセージ表示 ---
  if (isLoading && papers.length === 0) { // 初回検索中 or 新規検索でまだ結果がない
    return (
      <div className={styles.loadingStateContainer}>
        <div className={styles.loadingStateBox}>
          <h1 className={`${styles.loadingStateTitle} pop-title`}>{message}</h1>
          <div className={styles.loadingSpinner}></div>
        </div>
      </div>
    );
  }

  if (!isLoading && papers.length === 0) { // 検索後結果0件 or 初回ロードで結果0件
    return (
      <div className={styles.loadingStateContainer}>
        <div className={styles.loadingStateBox}>
          <h1 className={`${styles.loadingStateTitle} pop-title`}>{message || (currentSearchTerm ? `「${currentSearchTerm}」に一致する論文はありません。` : "表示できる論文がありません。")}</h1>
          <button onClick={() => fetchPapers(true, currentSearchTerm || '')} className={styles.reloadButton}>
            {currentSearchTerm ? "再検索" : "再読み込み"}
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        <h1 className={`${styles.title} pop-title`}>Kiga-ers</h1>
        <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
          <div className={styles.searchBarContainer}>
            <MagnifyingGlassIcon className={styles.searchIcon} />
            <input
              type="search"
              placeholder="論文を検索 (例: machine learning)"
              value={searchQuery}
              onChange={handleSearchInputChange}
              className={styles.searchInput}
            />
          </div>
          <button type="submit" className={styles.searchButton}>検索</button>
        </form>
        <p className={styles.subtitle}>
          いいねした論文: {likedPapers.length}件
          {currentSearchTerm && ` / 検索語: "${currentSearchTerm}"`}
        </p>
      </header>

      <main className={styles.mainContentArea}>
        {papersInStack.length > 0 ? (
            papersInStack.slice().reverse().map((paper, indexInVisibleStack_reversed) => {
            const indexInStack = (VISIBLE_CARDS_IN_STACK - 1) - indexInVisibleStack_reversed;
            const isTopCard = indexInStack === 0;
            const cardDynamicStyles: React.CSSProperties = {};
            let animationClass = '';
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
            if (animationClass) cardClasses += ` ${animationClass}`;
            if (interactionState.isSwiping && isTopCard) cardClasses += ` ${styles.isSwiping}`;

            return (
                <div key={paper.id + (isTopCard ? '-top' : '-next')} ref={isTopCard ? topCardRef : null} className={cardClasses}
                    style={{ zIndex: VISIBLE_CARDS_IN_STACK - indexInStack, touchAction: isTopCard ? 'none' : 'auto', ...cardDynamicStyles }}
                    onTouchStart={isTopCard ? handleTouchStart : undefined} onTouchMove={isTopCard ? handleTouchMove : undefined}
                    onTouchEnd={isTopCard ? handleTouchEnd : undefined} onTouchCancel={isTopCard ? handleTouchEnd : undefined}
                >
                    {isTopCard && interactionState.isSwiping && interactionState.feedbackColor && (
                        <div className={`${styles.swipeFeedbackOverlay} ${interactionState.feedbackColor}`}></div>
                    )}
                    <div className={`${styles.cardScrollableContent} thin-scrollbar`}>
                        <h2 className={styles.cardTitle}><FormattedTextRenderer text={paper.title} /></h2>
                        <p className={styles.cardAuthors}>Authors: {paper.authors.join(', ')}</p>
                        <div className={styles.cardDates}>
                            <span>Published: {new Date(paper.published).toLocaleDateString()}</span>
                            <span>Updated: {new Date(paper.updated).toLocaleDateString()}</span>
                        </div>
                        <div className={styles.aiSummarySection}>
                            <h3 className={styles.aiSummaryHeader}>
                                <span className={styles.aiSummaryHeaderText}><SparklesIcon />AIによる要約</span>
                                {!paper.aiSummary && !isSummarizing && (
                                    <button onClick={(e) => { e.stopPropagation(); generateAiSummary(paper.id, paper.summary); }} className={styles.generateButton}>生成</button>
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
                            <summary className={styles.abstractSummary}><ChevronRightIcon />元のAbstractを見る</summary>
                            <div className={styles.abstractContent}><FormattedTextRenderer text={paper.summary} /></div>
                        </details>
                        <div className={styles.categoriesContainer}>
                            {paper.categories.map(category => (<span key={category} className={styles.categoryTag}>{category}</span>))}
                        </div>
                    </div>
                    <div className={styles.pdfButtonArea}>
                        <div className={styles.pdfButtonContainer}>
                            {paper.pdfLink ? (
                                <a href={paper.pdfLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={styles.pdfButton}><ArrowDownTrayIcon />PDFを開く</a>
                            ) : <div className={styles.pdfPlaceholder}></div>}
                        </div>
                    </div>
                </div>
            );
            })
        ) : ( // papersInStackが空だが、まだローディング中でない、かつpapersに何かデータがある場合 (＝全て見終わった)
          !isLoading && papers.length > 0 && <div className={styles.loadingStateContainer}><div className={styles.loadingStateBox}><h1 className={`${styles.loadingStateTitle} pop-title`}>{currentSearchTerm ? `「${currentSearchTerm}」の検索結果は以上です。` : "全ての論文を見終わりました。"}</h1><button onClick={() => fetchPapers(true, currentSearchTerm || '')} className={styles.reloadButton}>{currentSearchTerm ? "再検索" : "再読み込み"}</button></div></div>
        )}
      </main>
      {isLoading && papers.length > 0 && (
          <div className={styles.loadingMoreIndicator}>
              Loading more...
          </div>
      )}
    </div>
  );
}