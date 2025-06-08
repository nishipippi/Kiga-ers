// apps/web/src/app/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import PaperCard from '@/components/PaperCard';
import { useLikedPapers, type Paper } from '@/contexts/LikedPapersContext';
import styles from './page.module.css';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

const END_OF_FEED_CARD_ID_PAGE = "___END_OF_FEED___";
const SWIPE_THRESHOLD_PAGE = 70;
const SWIPE_MAX_ROTATION_PAGE = 12;
const SWIPE_TRANSLATE_X_SCALE_PAGE = 1.1;
const VISIBLE_CARDS_IN_STACK_PAGE = 2;
const MAX_RESULTS_PER_FETCH_PAGE = 10;


export default function HomePage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [currentPaperIndex, setCurrentPaperIndex] = useState(0);
  const { likedPapers, addLikedPaper, isPaperLiked } = useLikedPapers();
  const [message, setMessage] = useState<string | null>('Kiga-ers へようこそ！論文を探しています...');
  const [isLoading, setIsLoading] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSearchTerm, setCurrentSearchTerm] = useState('');
  const [hasMorePapers, setHasMorePapers] = useState(true);

  const [interactionState, setInteractionState] = useState<{
    isSwiping: boolean; cardTransform: string; feedbackColor: string; flyingDirection: 'left' | 'right' | null;
  }>({ isSwiping: false, cardTransform: '', feedbackColor: '', flyingDirection: null });

  const topCardRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const canFetchMoreRef = useRef(true);


  const fetchPapers = useCallback(async (isInitialOrNewSearch = false, termToSearchForFetch = '', offsetForFetch = 0) => {
    const effectiveSearchTermForFetch = termToSearchForFetch.trim();
    console.log(
      `fetchPapers: Called (isInitial: ${isInitialOrNewSearch}, term: "${effectiveSearchTermForFetch}", offset: ${offsetForFetch}), isLoading: ${isLoading}, hasMore: ${hasMorePapers}`
    );

    if (!isInitialOrNewSearch) {
      if (isLoading) {
        console.log('fetchPapers (additional): Already loading, skipping.');
        return;
      }
      if (!hasMorePapers) {
        console.log('fetchPapers (additional): No more papers indicated by state, skipping.');
        return;
      }
      if (!canFetchMoreRef.current) {
        console.log('fetchPapers (additional): Fetch is temporarily blocked, skipping.');
        return;
      }
    }

    setIsLoading(true);
    canFetchMoreRef.current = false;

    if (isInitialOrNewSearch) {
      if (effectiveSearchTermForFetch) { setMessage(`「${effectiveSearchTermForFetch}」の論文を検索中...`); }
      else { setMessage('Kiga-ers へようこそ！論文を探しています...'); }
      setPapers([]);
      setCurrentPaperIndex(0);
      setHasMorePapers(true);
    } else {
      setMessage('新しい論文を探しています...');
    }
    setInteractionState({ isSwiping: false, cardTransform: '', feedbackColor: '', flyingDirection: null });

    try {
      let apiUrl = effectiveSearchTermForFetch ? `/api/papers?query=${encodeURIComponent(effectiveSearchTermForFetch)}` : '/api/papers';
      apiUrl += `${apiUrl.includes('?') ? '&' : '?'}start=${offsetForFetch}&max_results=${MAX_RESULTS_PER_FETCH_PAGE}`;
      const response = await fetch(apiUrl);
      if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(`論文データの取得に失敗しました。 Status: ${response.status}. ${errorData.error || ''}`); }
      const data: Paper[] = await response.json();
      console.log('fetchPapers: Data received, length:', data.length);

      const morePapersPotentiallyAvailableBasedOnAPI = data.length === MAX_RESULTS_PER_FETCH_PAGE;

      setPapers(prevPapers => {
        const currentRealPapers = prevPapers.filter(p => !p.isEndOfFeedCard);
        let updatedPapersArray: Paper[];
        if (isInitialOrNewSearch) {
          updatedPapersArray = data;
        } else {
          const existingIds = new Set(currentRealPapers.map(p => p.id));
          const newUniquePapers = data.filter(p => !existingIds.has(p.id));
          updatedPapersArray = [...currentRealPapers, ...newUniquePapers];
        }
        if (!morePapersPotentiallyAvailableBasedOnAPI && updatedPapersArray.length > 0 && !updatedPapersArray.some(p => p.id === END_OF_FEED_CARD_ID_PAGE)) {
          const endMsg = currentSearchTerm ? `「${currentSearchTerm}」の検索結果は以上です。` : "全ての論文を見終わりました。";
          updatedPapersArray.push({ id: END_OF_FEED_CARD_ID_PAGE, title: "お知らせ", summary: endMsg, authors: [], published: '', updated: '', pdfLink: '', categories: [], isEndOfFeedCard: true, endOfFeedMessage: endMsg });
        }
        return updatedPapersArray;
      });
      setHasMorePapers(morePapersPotentiallyAvailableBasedOnAPI);
      if (data.length > 0 || (isInitialOrNewSearch && data.length ===0) ) setMessage(null);

    } catch (error) {
      console.error('fetchPapers: CATCH Error', error);
      setHasMorePapers(false);
      if (isInitialOrNewSearch) { setPapers([]); setMessage(`論文の読み込みエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);}
    } finally {
      setIsLoading(false);
      setTimeout(() => { canFetchMoreRef.current = true; }, 300);
    }
  }, [currentSearchTerm, isLoading, hasMorePapers, setIsLoading, setPapers, setCurrentPaperIndex, setMessage, setHasMorePapers, setInteractionState]);

  const handleSearchInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setSearchQuery(event.target.value); };
  const handleSearchSubmit = (event?: React.FormEvent<HTMLFormElement>) => { if (event) event.preventDefault(); const term = searchQuery.trim(); setCurrentSearchTerm(term); fetchPapers(true, term, 0); };

  useEffect(() => {
    if (papers.length === 0 && currentSearchTerm === '' && !isLoading && hasMorePapers) {
        console.log('useEffect (Mount): Calling initial fetchPapers.');
        fetchPapers(true, '', 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papers.length, currentSearchTerm, isLoading, hasMorePapers]);

  useEffect(() => {
    const actualPapersLength = papers.filter(p => !p.isEndOfFeedCard).length;
    const thresholdIndex = actualPapersLength > VISIBLE_CARDS_IN_STACK_PAGE ? actualPapersLength - VISIBLE_CARDS_IN_STACK_PAGE : (actualPapersLength > 0 ? actualPapersLength - 1 : 0);
    const needsMoreFetch = actualPapersLength > 0 && currentPaperIndex >= thresholdIndex;
    const alreadyHasEndOfFeedCard = papers.some(p => p.id === END_OF_FEED_CARD_ID_PAGE);

    if (needsMoreFetch && !isLoading && hasMorePapers && !alreadyHasEndOfFeedCard && canFetchMoreRef.current) {
      fetchPapers(false, currentSearchTerm, actualPapersLength);
    }
  }, [currentPaperIndex, papers, currentSearchTerm, isLoading, hasMorePapers, fetchPapers]);


  const generateAiSummary = useCallback(async (paperId: string, pdfUrl: string, paperTitle: string) => {
    if (isSummarizing || !pdfUrl) return;
    const paperToUpdate = papers.find(p => p.id === paperId);
    if (paperToUpdate?.aiSummary) return;

    setIsSummarizing(paperId);
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl, paperTitle }),
      });
      if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(`要約の生成に失敗しました: ${errorData.error || response.status}`); }
      const data = await response.json();
      setPapers(prevPapers => prevPapers.map(p => p.id === paperId ? { ...p, aiSummary: data.summary } : p));
    } catch (error) { console.error('Failed to generate summary:', error); alert(`要約生成エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally { setIsSummarizing(null); }
  }, [isSummarizing, papers, setPapers]);

  const resetCardInteraction = () => { setInteractionState({ isSwiping: false, cardTransform: '', feedbackColor: '', flyingDirection: null }); touchStartX.current = null; touchCurrentX.current = null; touchStartY.current = null; };
  
  const goToNextPaper = useCallback(() => {
    resetCardInteraction();
    setCurrentPaperIndex(prevIndex => Math.min(prevIndex + 1, papers.length));
  }, [papers.length]);

  const handleLike = useCallback((paper: Paper) => {
    addLikedPaper(paper);
    setInteractionState(prev => ({ ...prev, isSwiping: false, flyingDirection: 'right', feedbackColor: styles.feedbackPinkLike || '', cardTransform: '' }));
    setTimeout(() => goToNextPaper(), 600);
  }, [addLikedPaper, goToNextPaper]);

  const handleDislike = useCallback(() => {
    setInteractionState(prev => ({ ...prev, isSwiping: false, flyingDirection: 'left', feedbackColor: styles.feedbackLimeDislike || '', cardTransform: '' }));
    setTimeout(() => goToNextPaper(), 600);
  }, [goToNextPaper]);


  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => { if (!e.touches[0] || interactionState.flyingDirection) return; setInteractionState(prev => ({ ...prev, isSwiping: true, cardTransform: '', feedbackColor: '' })); touchStartX.current = e.touches[0].clientX; touchCurrentX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; };
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => { if (touchStartX.current === null || !e.touches[0] || touchStartY.current === null || !topCardRef.current || interactionState.flyingDirection || !interactionState.isSwiping) return; const currentX = e.touches[0].clientX; const currentY = e.touches[0].clientY; touchCurrentX.current = currentX; const diffX = currentX - touchStartX.current; const diffY = Math.abs(currentY - touchStartY.current); if (diffY > Math.abs(diffX) * 1.8 && diffY > 15) { if(interactionState.isSwiping) resetCardInteraction(); return; } const rotation = (diffX / topCardRef.current.offsetWidth) * SWIPE_MAX_ROTATION_PAGE; const translateX = diffX * SWIPE_TRANSLATE_X_SCALE_PAGE; setInteractionState(prev => ({ ...prev, cardTransform: `translateX(${translateX}px) rotate(${rotation}deg)`, feedbackColor: Math.abs(diffX) > SWIPE_THRESHOLD_PAGE / 2 ? (diffX > 0 ? (styles.feedbackPinkLike || '') : (styles.feedbackLimeDislike || '')) : '' })); };
  const handleTouchEnd = () => { if (!interactionState.isSwiping && !interactionState.flyingDirection) return; if (interactionState.flyingDirection) return; if (touchStartX.current === null || touchCurrentX.current === null ) { resetCardInteraction(); return; } const diffX = touchCurrentX.current - touchStartX.current; const currentPaper = papers[currentPaperIndex]; if (!currentPaper) { resetCardInteraction(); return; } if (Math.abs(diffX) > SWIPE_THRESHOLD_PAGE) { if (diffX > 0) { handleLike(currentPaper); } else { handleDislike(); } } else { resetCardInteraction(); } };

  const papersInStack = papers.slice(currentPaperIndex, currentPaperIndex + VISIBLE_CARDS_IN_STACK_PAGE);

  const renderStatusDisplay = () => {
    if (papers.length > 0 && !(papers.length === 1 && papers[0].isEndOfFeedCard) ) return null;
    if (isLoading && papers.filter(p=>!p.isEndOfFeedCard).length === 0) {
      return ( <div className={styles.loadingStateContainer}><div className={styles.loadingStateBox}><h1 className={`${styles.loadingStateTitle} pop-title`}>{message || '論文を探しています...'}</h1><div className={styles.loadingSpinner}></div></div></div> );
    }
    if(!isLoading && papers.filter(p=>!p.isEndOfFeedCard).length === 0 && !papers.find(p=>p.id === END_OF_FEED_CARD_ID_PAGE)) {
      return ( <div className={styles.loadingStateContainer}><div className={styles.loadingStateBox}><h1 className={`${styles.loadingStateTitle} pop-title`}>{message || "表示できる論文がありません。"}</h1><button onClick={() => fetchPapers(true, currentSearchTerm, 0)} className={styles.reloadButton}>再読み込み</button></div></div> );
    }
    return null;
  };
  
  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}>
        {/* 左側の要素 */}
        <div className="flex-grow">
          <h1 className={`${styles.title} pop-title`}>Kiga-ers</h1>
          <form onSubmit={handleSearchSubmit} className={styles.searchForm}>
            <div className={styles.searchBarContainer}><MagnifyingGlassIcon className={styles.searchIcon} /><input type="search" placeholder="論文を検索 (例: machine learning)" value={searchQuery} onChange={handleSearchInputChange} className={styles.searchInput} /></div>
            <button type="submit" className={styles.searchButton}>検索</button>
          </form>
          <p className={styles.subtitle}>いいねした論文: {likedPapers.length}件 {currentSearchTerm && ` / 検索結果: "${currentSearchTerm}"`} </p>
        </div>

        {/* 右側の要素 */}
        <div className={styles.headerLinksContainer}>
          {/* GitHub Icon */}
          <a 
            href="https://github.com/nishipippi/KigaIrs" 
            target="_blank" 
            rel="noopener noreferrer" 
            className={styles.iconLinkButton}
            aria-label="Githubはこちら"
            title="Githubはこちら"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </a>
          {/* Portfolio Link */}
          <a 
            href="https://nishipippi.github.io/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className={styles.textLinkButton}
          >
            作者のポートフォリオはこちら
          </a>
        </div>
      </header>
      {renderStatusDisplay()}
      {papers.length > 0 && (
        <main className={styles.mainContentArea}>
          {papersInStack.length > 0 ? (
            papersInStack.slice().reverse().map((paper, indexInVisibleStack_reversed) => {
              const indexInStack = (VISIBLE_CARDS_IN_STACK_PAGE - 1) - indexInVisibleStack_reversed;
              const isTopCard = indexInStack === 0;
              const cardDynamicStyles: React.CSSProperties = {}; // ★★★ const に変更 ★★★
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
              
              return (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  isSummarizing={isSummarizing === paper.id}
                  onGenerateAiSummary={generateAiSummary}
                  onLike={handleLike}
                  onDislike={handleDislike}
                  isLiked={isPaperLiked(paper.id)}
                  cardRef={isTopCard ? topCardRef : undefined}
                  cardStyle={{ ...cardDynamicStyles, zIndex: VISIBLE_CARDS_IN_STACK_PAGE - indexInStack }}
                  onTouchStart={isTopCard ? handleTouchStart : undefined}
                  onTouchMove={isTopCard ? handleTouchMove : undefined}
                  onTouchEnd={isTopCard ? handleTouchEnd : undefined}
                  onTouchCancel={isTopCard ? handleTouchEnd : undefined}
                  className={animationClass}
                  isTopCard={isTopCard}
                  interactionState={isTopCard ? interactionState : undefined}
                  showSwipeButtons={true}
                />
              );
            })
          ) : (
            !isLoading && papers.length > 0 && currentPaperIndex >= papers.filter(p=>!p.isEndOfFeedCard).length && !papers.find(p=>p.id === END_OF_FEED_CARD_ID_PAGE) &&
            <div className={styles.loadingStateContainer}><div className={styles.loadingStateBox}><h1 className={`${styles.loadingStateTitle} pop-title`}>次の論文を準備中...</h1></div></div>
          )}
        </main>
      )}
      {isLoading && papers.filter(p=>!p.isEndOfFeedCard).length > 0 && ( <div className={styles.loadingMoreIndicator}> Loading more... </div> )}
    </div>
  );
}
