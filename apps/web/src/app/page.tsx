// apps/web/src/app/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import FormattedTextRenderer from '@/components/FormattedTextRenderer';
import styles from './page.module.css';
import { SparklesIcon, ChevronRightIcon, ArrowDownTrayIcon, MagnifyingGlassIcon, HandThumbUpIcon, HandThumbDownIcon } from '@heroicons/react/24/outline';

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
const MAX_RESULTS_PER_FETCH = 10;

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
    isSwiping: boolean;
    cardTransform: string;
    feedbackColor: string;
    flyingDirection: 'left' | 'right' | null;
  }>({ isSwiping: false, cardTransform: '', feedbackColor: '', flyingDirection: null });

  const topCardRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const fetchPapers = useCallback(async (isInitialOrNewSearch = false, termToSearch = '') => {
    const effectiveSearchTerm = termToSearch.trim();
    let currentOffset = 0;
    if (!isInitialOrNewSearch && papers.length > 0) {
        currentOffset = papers.length;
    }
    console.log(`fetchPapers: Called (isInitialOrNewSearch: ${isInitialOrNewSearch}, term: "${effectiveSearchTerm}", offset: ${currentOffset})`);
    if (!isInitialOrNewSearch && isLoading) {
        console.log('fetchPapers: Already loading (additional fetch), skipping.');
        return;
    }
    if (!isInitialOrNewSearch && !hasMorePapers && currentSearchTerm === effectiveSearchTerm) {
        console.log('fetchPapers: No more papers indicated for this term, skipping fetch.');
        setIsLoading(false);
        return;
    }
    setIsLoading(true);
    if (isInitialOrNewSearch) {
      if (effectiveSearchTerm) {
        setMessage(`「${effectiveSearchTerm}」の論文を検索中...`);
      } else {
        setMessage('Kiga-ers へようこそ！論文を探しています...');
      }
      setPapers([]);
      setCurrentPaperIndex(0);
      setHasMorePapers(true);
    } else {
      setMessage('新しい論文を探しています...');
    }
    setInteractionState(prev => ({ ...prev, cardTransform: '', feedbackColor: '', flyingDirection: null }));
    try {
      let apiUrl = effectiveSearchTerm ? `/api/papers?query=${encodeURIComponent(effectiveSearchTerm)}` : '/api/papers';
      apiUrl += `${apiUrl.includes('?') ? '&' : '?'}start=${currentOffset}`;
      const response = await fetch(apiUrl);
      console.log('fetchPapers: Response status', response.status, 'for URL:', apiUrl);
      if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(`論文データの取得に失敗しました。 Status: ${response.status}. ${errorData.error || ''}`); }
      const data: Paper[] = await response.json();
      console.log('fetchPapers: Data received, length:', data.length);
      if (data && data.length > 0) {
        setPapers(prevPapers => {
          const newPapers = isInitialOrNewSearch ? data : data.filter(p => !prevPapers.some(pp => pp.id === p.id));
          if (newPapers.length > 0) {
            setHasMorePapers(data.length === MAX_RESULTS_PER_FETCH);
            return isInitialOrNewSearch ? newPapers : [...prevPapers, ...newPapers];
          } else {
            if (!isInitialOrNewSearch) setHasMorePapers(false);
            return prevPapers;
          }
        });
        setMessage(null);
      } else {
        setHasMorePapers(false);
        if (isInitialOrNewSearch) { setMessage(effectiveSearchTerm ? `「${effectiveSearchTerm}」に一致する論文は見つかりませんでした。` : '表示できる論文が見つかりませんでした。'); }
        else { console.log('fetchPapers: API returned 0 papers for additional load.'); }
      }
    } catch (error) {
      console.error('fetchPapers: CATCH Error', error);
      setHasMorePapers(false);
      if (isInitialOrNewSearch) { setPapers([]); setMessage(`論文の読み込みエラー: ${error instanceof Error ? error.message : '不明なエラー'}`); }
      else { console.warn('Error fetching additional papers, keeping existing ones.'); }
    } finally {
      console.log('fetchPapers: FINALLY');
      setIsLoading(false);
    }
  }, [isLoading, currentSearchTerm, papers.length, hasMorePapers, setIsLoading, setPapers, setCurrentPaperIndex, setMessage, setHasMorePapers, setInteractionState]);

  const handleSearchInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setSearchQuery(event.target.value); };
  const handleSearchSubmit = (event?: React.FormEvent<HTMLFormElement>) => { if (event) event.preventDefault(); const term = searchQuery.trim(); console.log('Search submitted with query:', term); setCurrentSearchTerm(term); fetchPapers(true, term); };

  useEffect(() => { console.log('useEffect (Mount): currentSearchTerm:', currentSearchTerm, "papers.length:", papers.length); if (currentSearchTerm === '' && papers.length === 0 && hasMorePapers) { console.log('useEffect (Mount): Calling initial fetchPapers for default content.'); fetchPapers(true, ''); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { console.log('useEffect (Index/Papers Change Check): papers.length:', papers.length, 'currentPaperIndex:', currentPaperIndex, 'isLoading:', isLoading, 'currentSearchTerm:', currentSearchTerm, 'hasMorePapers:', hasMorePapers); const thresholdIndex = papers.length > VISIBLE_CARDS_IN_STACK ? papers.length - VISIBLE_CARDS_IN_STACK : papers.length > 0 ? papers.length -1 : 0; const needsMoreFetch = papers.length > 0 && currentPaperIndex >= thresholdIndex; if (needsMoreFetch && !isLoading && hasMorePapers) { console.log('useEffect (Index/Papers Change Check): Condition met for fetching more papers for term:', currentSearchTerm); fetchPapers(false, currentSearchTerm); } else if (isLoading && needsMoreFetch) { console.log('useEffect (Index/Papers Change Check): Needs more, but currently loading.'); } else if (!hasMorePapers && needsMoreFetch) { console.log('useEffect (Index/Papers Change Check): Needs more, but no more papers indicated.'); } else { console.log('useEffect (Index/Papers Change Check): Conditions not met for fetching more.'); }
  }, [currentPaperIndex, papers.length, isLoading, fetchPapers, currentSearchTerm, hasMorePapers]);

  const generateAiSummary = useCallback(async (paperId: string, textToSummarize: string) => { if (!textToSummarize || isSummarizing) return; setIsSummarizing(true); try { const response = await fetch('/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ textToSummarize }), }); if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(`要約の生成に失敗しました。 Status: ${response.status}. ${errorData.error || ''}`); } const data = await response.json(); setPapers(prevPapers => prevPapers.map(p => p.id === paperId ? { ...p, aiSummary: data.summary } : p)); } catch (error) { console.error('Failed to generate summary:', error); alert(`要約生成エラー: ${error instanceof Error ? error.message : '不明なエラー'}`); } finally { setIsSummarizing(false); } }, [isSummarizing]);
  
  const resetCardInteraction = () => {
    console.log('resetCardInteraction called');
    setInteractionState({
        isSwiping: false,
        cardTransform: '',
        feedbackColor: '',
        flyingDirection: null,
    });
    touchStartX.current = null;
    touchCurrentX.current = null;
    touchStartY.current = null;
  };

  const goToNextPaper = useCallback(() => {
    console.log('goToNextPaper called, resetting interaction state for next card');
    setInteractionState(prev => ({
        ...prev,
        cardTransform: '',
        feedbackColor: '',
        flyingDirection: null,
    }));
    setCurrentPaperIndex(prevIndex => prevIndex + 1);
  }, []);

  const handleSwipeAction = useCallback((direction: 'left' | 'right') => { const paperToRate = papers[currentPaperIndex]; if (!paperToRate) return; if (direction === 'right') { setLikedPapers(prev => prev.includes(paperToRate.id) ? prev : [...prev, paperToRate.id]); setInteractionState(prev => ({ ...prev, isSwiping:false, flyingDirection: 'right', feedbackColor: styles.feedbackPink })); } else { setInteractionState(prev => ({ ...prev, isSwiping: false, flyingDirection: 'left', feedbackColor: styles.feedbackLime })); } setTimeout(() => { goToNextPaper(); }, 600); }, [papers, currentPaperIndex, goToNextPaper]);
  const handleLike = useCallback(() => { if (!papers[currentPaperIndex]) return; handleSwipeAction('right'); }, [papers, currentPaperIndex, handleSwipeAction]);
  const handleDislike = useCallback(() => { if (!papers[currentPaperIndex]) return; handleSwipeAction('left'); }, [papers, currentPaperIndex, handleSwipeAction]);
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => { if (!e.touches[0] || interactionState.flyingDirection) return; resetCardInteraction(); touchStartX.current = e.touches[0].clientX; touchCurrentX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; setInteractionState(prev => ({...prev, isSwiping: true, cardTransform: '', feedbackColor: '' })); }; // transformとfeedbackColorもリセット
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => { if (touchStartX.current === null || !e.touches[0] || touchStartY.current === null || !topCardRef.current || interactionState.flyingDirection) return; const currentX = e.touches[0].clientX; const currentY = e.touches[0].clientY; touchCurrentX.current = currentX; const diffX = currentX - touchStartX.current; const diffY = Math.abs(currentY - touchStartY.current); if (diffY > Math.abs(diffX) * 1.8 && diffY > 15) { if(interactionState.isSwiping) resetCardInteraction(); return; } const rotation = (diffX / topCardRef.current.offsetWidth) * SWIPE_MAX_ROTATION; const translateX = diffX * SWIPE_TRANSLATE_X_SCALE; setInteractionState(prev => ({ ...prev, cardTransform: `translateX(${translateX}px) rotate(${rotation}deg)`, feedbackColor: Math.abs(diffX) > SWIPE_THRESHOLD / 2 ? (diffX > 0 ? styles.feedbackPink : styles.feedbackLime) : '' })); };
  const handleTouchEnd = () => { if (touchStartX.current === null || touchCurrentX.current === null || !interactionState.isSwiping || interactionState.flyingDirection) { if (interactionState.isSwiping && !interactionState.flyingDirection) resetCardInteraction(); return; } const diffX = touchCurrentX.current - touchStartX.current; if (Math.abs(diffX) > SWIPE_THRESHOLD) { handleSwipeAction(diffX > 0 ? 'right' : 'left'); } else { resetCardInteraction(); } /* setIsSwiping(false) は handleSwipeAction または resetCardInteraction で行われる */ };

  const papersInStack = papers.slice(currentPaperIndex, currentPaperIndex + VISIBLE_CARDS_IN_STACK);
  console.log('Render - isLoading:', isLoading, 'papers.length:', papers.length, 'papersInStack.length:', papersInStack.length, 'currentPaperIndex:', currentPaperIndex, 'message:', message, 'currentSearchTerm:', currentSearchTerm);

  const renderStatusDisplay = () => { if (papers.length > 0) return null; if (isLoading) { return ( <div className={styles.loadingStateContainer} style={{flexGrow: 1, justifyContent: 'center'}}> <div className={styles.loadingStateBox}> <h1 className={`${styles.loadingStateTitle} pop-title`}>{message}</h1> <div className={styles.loadingSpinner}></div> </div> </div> ); } return ( <div className={styles.loadingStateContainer} style={{flexGrow: 1, justifyContent: 'center'}}> <div className={styles.loadingStateBox}> <h1 className={`${styles.loadingStateTitle} pop-title`}>{message || "表示できる論文がありません。"}</h1> <button onClick={() => fetchPapers(true, currentSearchTerm)} className={styles.reloadButton}> 再読み込み </button> </div> </div> ); };
  
  return (
    <div className={styles.pageContainer}>
      <header className={styles.header}> <h1 className={`${styles.title} pop-title`}>Kiga-ers</h1> <form onSubmit={handleSearchSubmit} className={styles.searchForm}> <div className={styles.searchBarContainer}> <MagnifyingGlassIcon className={styles.searchIcon} /> <input type="search" placeholder="論文を検索 (例: machine learning)" value={searchQuery} onChange={handleSearchInputChange} className={styles.searchInput} /> </div> <button type="submit" className={styles.searchButton}>検索</button> </form> <p className={styles.subtitle}> いいねした論文: {likedPapers.length}件 {currentSearchTerm && ` / 検索結果: "${currentSearchTerm}"`} </p> </header>
      {renderStatusDisplay()}
      {papers.length > 0 && (
        <main className={styles.mainContentArea}>
          {papersInStack.length > 0 ? (
              papersInStack.slice().reverse().map((paper, indexInVisibleStack_reversed) => {
              const indexInStack = (VISIBLE_CARDS_IN_STACK - 1) - indexInVisibleStack_reversed;
              const isTopCard = indexInStack === 0;
              const isOnlyCardCurrentlyVisible = papersInStack.length === 1;

              const cardDynamicStyles: React.CSSProperties = {};
              let animationClass = '';

              if (isTopCard) {
                cardDynamicStyles.transform = interactionState.cardTransform;
                if (interactionState.flyingDirection === 'left') animationClass = styles.animateFlyOutLeft || '';
                if (interactionState.flyingDirection === 'right') animationClass = styles.animateFlyOutRight || '';
              } else if (!isOnlyCardCurrentlyVisible) { // 唯一表示されるカードではない場合のみ、スタックスタイルを適用
                if (!interactionState.flyingDirection) {
                    cardDynamicStyles.transform = `scale(${1 - (indexInStack * 0.04)}) translateY(${indexInStack * 8}px) rotate(${indexInStack * (indexInStack % 2 === 0 ? -1:1) * 1}deg)`;
                    cardDynamicStyles.opacity = 1 - (indexInStack * 0.4);
                } else if (indexInStack === 1) {
                    animationClass = styles.animateNextCardEnter || '';
                }
              }
              
              let cardClasses = styles.card;
              if (isTopCard && interactionState.isSwiping && !interactionState.flyingDirection) { // flyingDirectionがないスワイプ中のみ
                cardClasses += ` ${styles.activeGrab} ${styles.isSwiping}`;
              } else if (isTopCard && interactionState.isSwiping) { // flyingDirectionがあるスワイプ中（ほぼアニメーション開始直後）
                cardClasses += ` ${styles.activeGrab}`;
              }
              if (animationClass) cardClasses += ` ${animationClass}`;
              
              return ( <div key={paper.id + '-card-' + indexInStack} ref={isTopCard ? topCardRef : null} className={cardClasses} style={{ zIndex: VISIBLE_CARDS_IN_STACK - indexInStack, touchAction: isTopCard ? 'none' : 'auto', ...cardDynamicStyles }} onTouchStart={isTopCard ? handleTouchStart : undefined} onTouchMove={isTopCard ? handleTouchMove : undefined} onTouchEnd={isTopCard ? handleTouchEnd : undefined} onTouchCancel={isTopCard ? handleTouchEnd : undefined} > {isTopCard && interactionState.isSwiping && interactionState.feedbackColor && !interactionState.flyingDirection && ( <div className={`${styles.swipeFeedbackOverlay} ${interactionState.feedbackColor}`}></div> )} <div className={`${styles.cardScrollableContent} thin-scrollbar`}> <h2 className={styles.cardTitle}><FormattedTextRenderer text={paper.title} /></h2> <p className={styles.cardAuthors}>Authors: {paper.authors.join(', ')}</p> <div className={styles.cardDates}> <span>Published: {new Date(paper.published).toLocaleDateString()}</span> <span>Updated: {new Date(paper.updated).toLocaleDateString()}</span> </div> <div className={styles.aiSummarySection}> <h3 className={styles.aiSummaryHeader}> <span className={styles.aiSummaryHeaderText}><SparklesIcon />AIによる要約</span> {!paper.aiSummary && !isSummarizing && ( <button onClick={(e) => { e.stopPropagation(); generateAiSummary(paper.id, paper.summary); }} className={styles.generateButton}>生成</button> )} </h3> {isSummarizing && currentPaperIndex < papers.length && papers[currentPaperIndex]?.id === paper.id ? ( <p className={styles.aiSummaryLoading}>AIが要約を生成中です...</p> ) : paper.aiSummary ? ( <p className={styles.aiSummaryText}><FormattedTextRenderer text={paper.aiSummary} /></p> ) : ( <p className={styles.aiSummaryPlaceholder}>（AI要約を生成しますか？）</p> )} </div> <details className={styles.abstractSection} onClick={(e) => e.stopPropagation()}> <summary className={styles.abstractSummary}><ChevronRightIcon />元のAbstractを見る</summary> <div className={styles.abstractContent}><FormattedTextRenderer text={paper.summary} /></div> </details> <div className={styles.categoriesContainer}> {paper.categories.map(category => (<span key={category} className={styles.categoryTag}>{category}</span>))} </div> </div> <div className={`${styles.pdfButtonArea} ${styles.actionButtonsContainer}`}> <button onClick={(e) => { e.stopPropagation(); handleDislike(); }} className={`${styles.pcActionButton} ${styles.pcDislikeButton}`} aria-label="興味なし"> <HandThumbDownIcon className={styles.pcActionButtonIcon} /><span className={styles.pcActionButtonText}>興味なし</span> </button> <div className={styles.pdfButtonWrapper}> {paper.pdfLink ? ( <a href={paper.pdfLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={styles.pdfButton}><ArrowDownTrayIcon />PDFを開く</a> ) : <div className={styles.pdfPlaceholder}></div>} </div> <button onClick={(e) => { e.stopPropagation(); handleLike(); }} className={`${styles.pcActionButton} ${styles.pcLikeButton}`} aria-label="興味あり"> <HandThumbUpIcon className={styles.pcActionButtonIcon} /><span className={styles.pcActionButtonText}>興味あり</span> </button> </div> </div> );
              })
          ) : !isLoading && papers.length > 0 && currentPaperIndex >= papers.length ? (
            <div className={styles.loadingStateContainer} style={{ minHeight: 'auto', padding: '2rem', flexGrow: 0 }}>
              <div className={styles.loadingStateBox}>
                <h1 className={`${styles.loadingStateTitle} pop-title`}>
                  {currentSearchTerm ? `「${currentSearchTerm}」の検索結果は以上です。` : "全ての論文を見終わりました。"}
                </h1>
                {hasMorePapers && ( <button onClick={() => fetchPapers(false, currentSearchTerm)} className={styles.reloadButton}> さらに読み込む </button> )}
                {currentSearchTerm && ( <button onClick={() => { setCurrentSearchTerm(''); setSearchQuery(''); setPapers([]); setCurrentPaperIndex(0); fetchPapers(true, ''); }} className={`${styles.reloadButton} ${styles.clearSearchButton}`} > 検索をクリア </button> )}
              </div>
            </div>
          ) : null
        }
        </main>
      )}
      {isLoading && papers.length > 0 && ( <div className={styles.loadingMoreIndicator}> Loading more... </div> )}
    </div>
  );
}