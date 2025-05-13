// Kiga-ers/apps/web/src/app/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import FormattedTextRenderer from '@/components/FormattedTextRenderer';
import styles from './page.module.css';
import { SparklesIcon, ChevronRightIcon, ArrowDownTrayIcon, MagnifyingGlassIcon, HandThumbUpIcon, HandThumbDownIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

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
  isEndOfFeedCard?: boolean;
  endOfFeedMessage?: string;
}

const END_OF_FEED_CARD_ID = "___END_OF_FEED___";
const SWIPE_THRESHOLD = 70;
const SWIPE_MAX_ROTATION = 12;
const SWIPE_TRANSLATE_X_SCALE = 1.1;
const VISIBLE_CARDS_IN_STACK = 2;
const MAX_RESULTS_PER_FETCH = 10; // API側と一致させる

export default function HomePage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [currentPaperIndex, setCurrentPaperIndex] = useState(0);
  const [likedPapers, setLikedPapers] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>('Kiga-ers へようこそ！論文を探しています...');
  const [isLoading, setIsLoading] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSearchTerm, setCurrentSearchTerm] = useState('');
  const [hasMorePapers, setHasMorePapers] = useState(true);

  const [interactionState, setInteractionState] = useState<{
    isSwiping: boolean; cardTransform: string; feedbackColor: string; flyingDirection: 'left' | 'right' | null;
  }>({ isSwiping: false, cardTransform: '', feedbackColor: '', flyingDirection: null });

  const topCardRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null); const touchCurrentX = useRef<number | null>(null); const touchStartY = useRef<number | null>(null);

  // fetchPapers の呼び出しを制御するためのフラグ
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
      // canFetchMoreRef を使用して短期間の連続呼び出しを防ぐ（より堅牢なデバウンス/スロットリングが望ましい場合もある）
      if (!canFetchMoreRef.current) {
        console.log('fetchPapers (additional): Fetch is temporarily blocked by canFetchMoreRef, skipping.');
        return;
      }
    }

    setIsLoading(true);
    canFetchMoreRef.current = false; // フェッチ開始時にフラグをfalseに

    if (isInitialOrNewSearch) {
      if (effectiveSearchTermForFetch) { setMessage(`「${effectiveSearchTermForFetch}」の論文を検索中...`); }
      else { setMessage('Kiga-ers へようこそ！論文を探しています...'); }
      setPapers([]);
      setCurrentPaperIndex(0);
      setHasMorePapers(true); // 新規検索時はリセット
    } else {
      setMessage('新しい論文を探しています...');
    }
    setInteractionState({ isSwiping: false, cardTransform: '', feedbackColor: '', flyingDirection: null });

    try {
      let apiUrl = effectiveSearchTermForFetch ? `/api/papers?query=${encodeURIComponent(effectiveSearchTermForFetch)}` : '/api/papers';
      apiUrl += `${apiUrl.includes('?') ? '&' : '?'}start=${offsetForFetch}&max_results=${MAX_RESULTS_PER_FETCH}`;
      const response = await fetch(apiUrl);
      console.log('fetchPapers: Response status', response.status, 'for URL:', apiUrl);
      if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(`論文データの取得に失敗しました。 Status: ${response.status}. ${errorData.error || ''}`); }
      const data: Paper[] = await response.json();
      console.log('fetchPapers: Data received, length:', data.length);

      const newPapersFetchedCount = data.length;
      const morePapersPotentiallyAvailableBasedOnAPI = newPapersFetchedCount === MAX_RESULTS_PER_FETCH;

      setPapers(prevPapers => {
        const currentRealPapers = prevPapers.filter(p => !p.isEndOfFeedCard);
        let updatedPapersArray: Paper[];

        if (isInitialOrNewSearch) {
          updatedPapersArray = data.map(p => ({...p, isEndOfFeedCard: false}));
        } else {
          const existingIds = new Set(currentRealPapers.map(p => p.id));
          const newUniquePapers = data.filter(p => !existingIds.has(p.id)).map(p => ({...p, isEndOfFeedCard: false}));
          updatedPapersArray = [...currentRealPapers, ...newUniquePapers];
        }

        if (!morePapersPotentiallyAvailableBasedOnAPI && updatedPapersArray.length > 0 && !updatedPapersArray.some(p => p.id === END_OF_FEED_CARD_ID)) {
          console.log("fetchPapers: No more papers potentially available from API or less than max_results received. Adding EndOfFeedCard.");
          const endMsg = currentSearchTerm ? `「${currentSearchTerm}」の検索結果は以上です。` : "全ての論文を見終わりました。";
          updatedPapersArray.push({ id: END_OF_FEED_CARD_ID, title: "お知らせ", summary: endMsg, authors: [], published: '', updated: '', pdfLink: '', categories: [], isEndOfFeedCard: true, endOfFeedMessage: endMsg });
        }
        return updatedPapersArray;
      });
      
      setHasMorePapers(morePapersPotentiallyAvailableBasedOnAPI);
      console.log(`fetchPapers: setHasMorePapers to ${morePapersPotentiallyAvailableBasedOnAPI}`);

      if (newPapersFetchedCount > 0 || (isInitialOrNewSearch && newPapersFetchedCount === 0) ) {
          setMessage(null);
      }

    } catch (error) {
      console.error('fetchPapers: CATCH Error', error);
      setHasMorePapers(false);
      if (isInitialOrNewSearch) {
          setPapers([]);
          setMessage(`論文の読み込みエラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
      }
    } finally {
      console.log('fetchPapers: FINALLY');
      setIsLoading(false);
      // 少し遅れてフラグをtrueに戻すことで、状態更新後の連続呼び出しを緩和
      setTimeout(() => { canFetchMoreRef.current = true; }, 300);
    }
  }, [currentSearchTerm, isLoading, hasMorePapers, setIsLoading, setPapers, setCurrentPaperIndex, setMessage, setHasMorePapers, setInteractionState]); // 依存配列は前回同様


  const handleSearchInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setSearchQuery(event.target.value); };
  const handleSearchSubmit = (event?: React.FormEvent<HTMLFormElement>) => { if (event) event.preventDefault(); const term = searchQuery.trim(); console.log('Search submitted with query:', term); setCurrentSearchTerm(term); fetchPapers(true, term, 0); };

  useEffect(() => {
    console.log('useEffect (Mount - once): Initial state check - papers.length:', papers.length, ', currentSearchTerm:', currentSearchTerm);
    if (papers.length === 0 && currentSearchTerm === '') {
        console.log('useEffect (Mount - once): Calling initial fetchPapers.');
        fetchPapers(true, '', 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const actualPapersLength = papers.filter(p => !p.isEndOfFeedCard).length;
    const thresholdIndex = actualPapersLength > VISIBLE_CARDS_IN_STACK 
        ? actualPapersLength - VISIBLE_CARDS_IN_STACK 
        : actualPapersLength > 0 ? actualPapersLength -1 : 0;

    const needsMoreFetch = actualPapersLength > 0 && currentPaperIndex >= thresholdIndex;
    const alreadyHasEndOfFeedCard = papers.some(p => p.id === END_OF_FEED_CARD_ID);

    console.log(
        'useEffect (Index/State Change):',
        `actualPapersLength: ${actualPapersLength}, currIdx: ${currentPaperIndex}, isLoading: ${isLoading}, hasMore: ${hasMorePapers}, needsFetch: ${needsMoreFetch}, hasEFC: ${alreadyHasEndOfFeedCard}`
    );

    if (needsMoreFetch && !isLoading && hasMorePapers && !alreadyHasEndOfFeedCard && canFetchMoreRef.current) { // canFetchMoreRefもチェック
      console.log('useEffect (Index/State Change): Condition met for fetching more papers. Term:', currentSearchTerm, 'Offset:', actualPapersLength);
      fetchPapers(false, currentSearchTerm, actualPapersLength);
    }
  // fetchPapers を依存配列に含める
  }, [currentPaperIndex, papers, currentSearchTerm, isLoading, hasMorePapers, fetchPapers]);


  const generateAiSummary = useCallback(async (paperId: string, textToSummarize: string) => { if (!textToSummarize || isSummarizing) return; setIsSummarizing(true); try { const response = await fetch('/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ textToSummarize }), }); if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(`要約の生成に失敗しました。 Status: ${response.status}. ${errorData.error || ''}`); } const data = await response.json(); setPapers(prevPapers => prevPapers.map(p => p.id === paperId ? { ...p, aiSummary: data.summary } : p)); } catch (error) { console.error('Failed to generate summary:', error); alert(`要約生成エラー: ${error instanceof Error ? error.message : '不明なエラー'}`); } finally { setIsSummarizing(false); } }, [isSummarizing, setPapers]);
  const resetCardInteraction = () => { console.log('resetCardInteraction called'); setInteractionState({ isSwiping: false, cardTransform: '', feedbackColor: '', flyingDirection: null, }); touchStartX.current = null; touchCurrentX.current = null; touchStartY.current = null; };
  const goToNextPaper = useCallback(() => { console.log('goToNextPaper called'); setInteractionState({ isSwiping: false, cardTransform: '', feedbackColor: '', flyingDirection: null, }); touchStartX.current = null; touchCurrentX.current = null; touchStartY.current = null; setCurrentPaperIndex(prevIndex => { const nextIndex = prevIndex + 1; if (nextIndex < papers.length) { return nextIndex; } console.log("goToNextPaper: Reached end of current papers list or beyond."); return nextIndex; }); }, [papers.length, setCurrentPaperIndex]);
  
  const handleSwipeAction = useCallback((direction: 'left' | 'right') => { const currentCard = papers[currentPaperIndex]; if (!currentCard || interactionState.flyingDirection) { return; } if (currentCard.isEndOfFeedCard) { console.log("Swiped on EndOfFeedCard"); if (direction === 'right') { setInteractionState(prev => ({ ...prev, isSwiping:false, flyingDirection: 'right', feedbackColor: styles.feedbackPink, cardTransform: '' })); setTimeout(() => { goToNextPaper(); if (hasMorePapers && !papers.some(p => p.id === END_OF_FEED_CARD_ID && p.isEndOfFeedCard) && canFetchMoreRef.current) { fetchPapers(false, currentSearchTerm, papers.filter(p=>!p.isEndOfFeedCard).length); } else { console.log("EndOfFeedCard swiped right, no more papers expected or EFC already present or fetch blocked."); } }, 600); } else { setInteractionState(prev => ({ ...prev, isSwiping:false, flyingDirection: 'left', feedbackColor: styles.feedbackLime, cardTransform: '' })); setTimeout(() => goToNextPaper(), 600); } return; } console.log(`handleSwipeAction: ${direction} on paper ${currentCard.id}`); if (direction === 'right') { setLikedPapers(prev => prev.includes(currentCard.id) ? prev : [...prev, currentCard.id]); setInteractionState(prev => ({ ...prev, isSwiping: false, flyingDirection: 'right', feedbackColor: styles.feedbackPink, cardTransform: '' })); } else { setInteractionState(prev => ({ ...prev, isSwiping: false, flyingDirection: 'left', feedbackColor: styles.feedbackLime, cardTransform: '' })); } setTimeout(() => { goToNextPaper(); }, 600); }, [papers, currentPaperIndex, goToNextPaper, interactionState.flyingDirection, setLikedPapers, currentSearchTerm, fetchPapers, hasMorePapers, setInteractionState]);
  
  const handleLike = useCallback(() => { if (!papers[currentPaperIndex]) return; handleSwipeAction('right'); }, [papers, currentPaperIndex, handleSwipeAction]);
  const handleDislike = useCallback(() => { if (!papers[currentPaperIndex]) return; handleSwipeAction('left'); }, [papers, currentPaperIndex, handleSwipeAction]);
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => { if (!e.touches[0] || interactionState.flyingDirection) { console.log('handleTouchStart: Skipped due to flyingDirection or no touches.'); return; } console.log('handleTouchStart: Initiating swipe'); setInteractionState({ isSwiping: true, cardTransform: '', feedbackColor: '', flyingDirection: null, }); touchStartX.current = e.touches[0].clientX; touchCurrentX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; console.log('handleTouchStart: State updated, refs set.'); };
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => { if (touchStartX.current === null || !e.touches[0] || touchStartY.current === null || !topCardRef.current || interactionState.flyingDirection || !interactionState.isSwiping) { return; } const currentX = e.touches[0].clientX; const currentY = e.touches[0].clientY; touchCurrentX.current = currentX; const diffX = currentX - touchStartX.current; const diffY = Math.abs(currentY - touchStartY.current); if (diffY > Math.abs(diffX) * 1.8 && diffY > 15) { if(interactionState.isSwiping) { console.log("TouchMove: Vertical scroll detected, resetting card."); resetCardInteraction();} return; } const rotation = (diffX / topCardRef.current.offsetWidth) * SWIPE_MAX_ROTATION; const translateX = diffX * SWIPE_TRANSLATE_X_SCALE; setInteractionState(prev => ({ ...prev, cardTransform: `translateX(${translateX}px) rotate(${rotation}deg)`, feedbackColor: Math.abs(diffX) > SWIPE_THRESHOLD / 2 ? (diffX > 0 ? styles.feedbackPink : styles.feedbackLime) : '' })); };
  const handleTouchEnd = () => { if (!interactionState.isSwiping && !interactionState.flyingDirection) { console.log("TouchEnd: Skipped, was not swiping and not flying."); return; } if (interactionState.flyingDirection) { console.log("TouchEnd: Skipped, card is already flying."); return; } if (touchStartX.current === null || touchCurrentX.current === null ) { console.log("TouchEnd: Resetting due to null touch refs."); resetCardInteraction(); return; } const diffX = touchCurrentX.current - touchStartX.current; console.log("TouchEnd: Swipe ended, diffX:", diffX); if (Math.abs(diffX) > SWIPE_THRESHOLD) { console.log("TouchEnd: Swipe threshold met, calling handleSwipeAction."); handleSwipeAction(diffX > 0 ? 'right' : 'left'); } else { console.log("TouchEnd: Swipe threshold NOT met, resetting card."); resetCardInteraction(); } };

  const papersInStack = papers.slice(currentPaperIndex, currentPaperIndex + VISIBLE_CARDS_IN_STACK);
  // RenderログからisLoadingとhasMorePapersの(current)を削除し、(state)のみにする
  console.log('Render - isLoading:', isLoading, 'papers.length:', papers.length, 'papersInStack.length:', papersInStack.length, 'currIdx:', currentPaperIndex, 'message:', message, 'searchTerm:', currentSearchTerm, 'hasMore:', hasMorePapers);

  const renderStatusDisplay = () => { if (papers.length > 0 && !(papers.length === 1 && papers[0].isEndOfFeedCard) ) return null; if (isLoading && papers.filter(p=>!p.isEndOfFeedCard).length === 0) { return ( <div className={styles.loadingStateContainer} style={{flexGrow: 1, justifyContent: 'center'}}> <div className={styles.loadingStateBox}> <h1 className={`${styles.loadingStateTitle} pop-title`}>{message}</h1> <div className={styles.loadingSpinner}></div> </div> </div> ); } if(!isLoading && papers.filter(p=>!p.isEndOfFeedCard).length === 0 && !papers.find(p=>p.id === END_OF_FEED_CARD_ID)) { return ( <div className={styles.loadingStateContainer} style={{flexGrow: 1, justifyContent: 'center'}}> <div className={styles.loadingStateBox}> <h1 className={`${styles.loadingStateTitle} pop-title`}>{message || "表示できる論文がありません。"}</h1> <button onClick={() => fetchPapers(true, currentSearchTerm, 0)} className={styles.reloadButton}> 再読み込み </button> </div> </div> ); } return null; };
  
  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}> <h1 className={`${styles.title} pop-title`}>Kiga-ers</h1> <form onSubmit={handleSearchSubmit} className={styles.searchForm}> <div className={styles.searchBarContainer}> <MagnifyingGlassIcon className={styles.searchIcon} /> <input type="search" placeholder="論文を検索 (例: machine learning)" value={searchQuery} onChange={handleSearchInputChange} className={styles.searchInput} /> </div> <button type="submit" className={styles.searchButton}>検索</button> </form> <p className={styles.subtitle}> いいねした論文: {likedPapers.length}件 {currentSearchTerm && ` / 検索結果: "${currentSearchTerm}"`} </p> </header>
      {renderStatusDisplay()}
      {papers.length > 0 && (
        <main className={styles.mainContentArea}>
          {papersInStack.length > 0 ? (
              papersInStack.slice().reverse().map((paper, indexInVisibleStack_reversed) => {
              const indexInStack = (VISIBLE_CARDS_IN_STACK - 1) - indexInVisibleStack_reversed; const isTopCard = indexInStack === 0; const isOnlyCardCurrentlyVisible = papersInStack.length === 1; const cardDynamicStyles: React.CSSProperties = {}; let animationClass = ''; if (isTopCard) { cardDynamicStyles.transform = interactionState.cardTransform; if (interactionState.flyingDirection === 'left') animationClass = styles.animateFlyOutLeft || ''; if (interactionState.flyingDirection === 'right') animationClass = styles.animateFlyOutRight || ''; } else if (!isOnlyCardCurrentlyVisible) { if (!interactionState.flyingDirection) { cardDynamicStyles.transform = `scale(${1 - (indexInStack * 0.04)}) translateY(${indexInStack * 8}px) rotate(${indexInStack * (indexInStack % 2 === 0 ? -1:1) * 1}deg)`; cardDynamicStyles.opacity = 1 - (indexInStack * 0.4); } else if (indexInStack === 1) { animationClass = styles.animateNextCardEnter || ''; } } let cardClasses = styles.card; if (paper.isEndOfFeedCard) cardClasses += ` ${styles.endOfFeedCard}`; if (isTopCard && interactionState.isSwiping && !interactionState.flyingDirection) { cardClasses += ` ${styles.activeGrab} ${styles.isSwiping}`; } else if (isTopCard && interactionState.isSwiping) { cardClasses += ` ${styles.activeGrab}`; } if (animationClass) cardClasses += ` ${animationClass}`;
              if (paper.isEndOfFeedCard && isTopCard) { return ( <div key={paper.id} ref={isTopCard ? topCardRef : null} className={cardClasses} style={{ zIndex: VISIBLE_CARDS_IN_STACK - indexInStack, touchAction: 'pan-y', ...cardDynamicStyles }} onTouchStart={isTopCard ? handleTouchStart : undefined} onTouchMove={isTopCard ? handleTouchMove : undefined} onTouchEnd={isTopCard ? handleTouchEnd : undefined} onTouchCancel={isTopCard ? handleTouchEnd : undefined} > <div className={styles.endOfFeedContent}> <h2 className={`${styles.cardTitle} ${styles.endOfFeedTitle}`}>{paper.title}</h2> <p className={styles.endOfFeedMessage}>{paper.endOfFeedMessage}</p> {/* ここでのfetchPapers呼び出しは、canFetchMoreRef を考慮しない（ユーザーの明示的なアクションのため） */} {hasMorePapers && (<button onClick={() => {canFetchMoreRef.current = true; fetchPapers(false, currentSearchTerm, papers.filter(p=>!p.isEndOfFeedCard).length);}} className={`${styles.reloadButton} ${styles.endOfFeedButton}`}> <ArrowPathIcon className={styles.pcActionButtonIcon} /> さらに試す </button> )} {currentSearchTerm && ( <button onClick={() => { setCurrentSearchTerm(''); setSearchQuery(''); fetchPapers(true, '', 0); }} className={`${styles.reloadButton} ${styles.clearSearchButton} ${styles.endOfFeedButton}`}> 検索をクリア </button> )} </div> </div> ); }
              return ( <div key={paper.id + '-card-' + indexInStack} ref={isTopCard ? topCardRef : null} className={cardClasses} style={{ zIndex: VISIBLE_CARDS_IN_STACK - indexInStack, touchAction: isTopCard ? 'none' : 'auto', ...cardDynamicStyles }} onTouchStart={isTopCard ? handleTouchStart : undefined} onTouchMove={isTopCard ? handleTouchMove : undefined} onTouchEnd={isTopCard ? handleTouchEnd : undefined} onTouchCancel={isTopCard ? handleTouchEnd : undefined} > {isTopCard && interactionState.isSwiping && interactionState.feedbackColor && !interactionState.flyingDirection && ( <div className={`${styles.swipeFeedbackOverlay} ${interactionState.feedbackColor}`}></div> )} <div className={`${styles.cardScrollableContent} thin-scrollbar`}> <h2 className={styles.cardTitle}><FormattedTextRenderer text={paper.title} /></h2> <p className={styles.cardAuthors}>Authors: {paper.authors.join(', ')}</p> <div className={styles.cardDates}> <span>Published: {new Date(paper.published).toLocaleDateString()}</span> <span>Updated: {new Date(paper.updated).toLocaleDateString()}</span> </div> <div className={styles.aiSummarySection}> <h3 className={styles.aiSummaryHeader}> <span className={styles.aiSummaryHeaderText}><SparklesIcon />AIによる要約</span> {!paper.aiSummary && !isSummarizing && ( <button onClick={(e) => { e.stopPropagation(); generateAiSummary(paper.id, paper.summary); }} className={styles.generateButton}>生成</button> )} </h3> {isSummarizing && currentPaperIndex < papers.length && papers[currentPaperIndex]?.id === paper.id ? ( <p className={styles.aiSummaryLoading}>AIが要約を生成中です...</p> ) : paper.aiSummary ? ( <p className={styles.aiSummaryText}><FormattedTextRenderer text={paper.aiSummary} /></p> ) : ( <p className={styles.aiSummaryPlaceholder}>（AI要約を生成しますか？）</p> )} </div> <details className={styles.abstractSection} onClick={(e) => e.stopPropagation()}> <summary className={styles.abstractSummary}><ChevronRightIcon />元のAbstractを見る</summary> <div className={styles.abstractContent}><FormattedTextRenderer text={paper.summary} /></div> </details> <div className={styles.categoriesContainer}> {paper.categories.map(category => (<span key={category} className={styles.categoryTag}>{category}</span>))} </div> </div> <div className={`${styles.pdfButtonArea} ${styles.actionButtonsContainer}`}> <button onClick={(e) => { e.stopPropagation(); handleDislike(); }} className={`${styles.pcActionButton} ${styles.pcDislikeButton}`} aria-label="興味なし"> <HandThumbDownIcon className={styles.pcActionButtonIcon} /><span className={styles.pcActionButtonText}>興味なし</span> </button> <div className={styles.pdfButtonWrapper}> {paper.pdfLink ? ( <a href={paper.pdfLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={styles.pdfButton}><ArrowDownTrayIcon />PDFを開く</a> ) : <div className={styles.pdfPlaceholder}></div>} </div> <button onClick={(e) => { e.stopPropagation(); handleLike(); }} className={`${styles.pcActionButton} ${styles.pcLikeButton}`} aria-label="興味あり"> <HandThumbUpIcon className={styles.pcActionButtonIcon} /><span className={styles.pcActionButtonText}>興味あり</span> </button> </div> </div> );
              })
          ) : !isLoading && papers.length > 0 && currentPaperIndex >= papers.filter(p=>!p.isEndOfFeedCard).length && !papers.find(p=>p.id === END_OF_FEED_CARD_ID) &&
              <div className={styles.loadingStateContainer} style={{flexGrow: 1, justifyContent: 'center'}}><div className={styles.loadingStateBox}><h1 className={`${styles.loadingStateTitle} pop-title`}>次の論文を準備中...</h1></div></div>
        }
        </main>
      )}
      {isLoading && papers.filter(p=>!p.isEndOfFeedCard).length > 0 && ( <div className={styles.loadingMoreIndicator}> Loading more... </div> )}
    </div>
  );
}