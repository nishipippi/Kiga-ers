// apps/web/src/app/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import FormattedTextRenderer from '@/components/FormattedTextRenderer';
import styles from './page.module.css';
// ▼▼▼ アイコン名の修正 ▼▼▼
import { SparklesIcon, ChevronRightIcon, ArrowDownTrayIcon, MagnifyingGlassIcon, HandThumbUpIcon, HandThumbDownIcon } from '@heroicons/react/24/outline';
// ▲▲▲ ▲▲▲

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
  // ▼▼▼ ESLint警告抑制コメントを追加 ▼▼▼
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [papers, setPapers] = useState<Paper[]>([]);
  const [currentPaperIndex, setCurrentPaperIndex] = useState(0);
  const [likedPapers, setLikedPapers] = useState<string[]>([]); // このセッターはhandleLike内で使用
  const [message, setMessage] = useState<string | null>('Kiga-ers へようこそ！論文を探しています...');
  const [isLoading, setIsLoading] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentSearchTerm, setCurrentSearchTerm] = useState('');
  const [hasMorePapers, setHasMorePapers] = useState(true);

  const [interactionState, setInteractionState] = useState<{
    isSwiping: boolean; // ユーザーが現在スワイプ操作中か
    cardTransform: string; // スワイプ操作中のカードのリアルタイムなtransformスタイル
    feedbackColor: string; // スワイプ操作中のリアルタイムなフィードバック色クラス
    flyingDirection: 'left' | 'right' | null; // スワイプ完了後、カードが飛んでいくアニメーション方向
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
    // フェッチ開始前にインタラクション状態をリセット（新しいカードが表示されるため）
    setInteractionState({ isSwiping: false, cardTransform: '', feedbackColor: '', flyingDirection: null });
    // touch ref もクリア
    touchStartX.current = null;
    touchCurrentX.current = null;
    touchStartY.current = null;

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
    // 次のカードに遷移する前に、インタラクション状態をリセット
    // これにより、次のカードが前のカードのアニメーション状態を引き継がないようにする
    setInteractionState({ // Reset interaction state completely for the next card
        isSwiping: false,
        cardTransform: '',
        feedbackColor: '',
        flyingDirection: null,
    });
    // touch ref もクリア (handleTouchStartで再度設定されるが念のため)
    touchStartX.current = null;
    touchCurrentX.current = null;
    touchStartY.current = null;
    setCurrentPaperIndex(prevIndex => prevIndex + 1);
  }, []); // 依存配列は空

  const handleSwipeAction = useCallback((direction: 'left' | 'right') => {
    // ▼▼▼ ESLint警告抑制コメントを追加 ▼▼▼
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const paperToRate = papers[currentPaperIndex]; // paperToRate のプロパティは使用されている
    // ▲▲▲ ▲▲▲
    if (!paperToRate || interactionState.flyingDirection) {
        console.log('handleSwipeAction: Skipped, no paper or already flying.');
        return;
    }
    console.log(`handleSwipeAction: ${direction}`);
    // アニメーション方向とフィードバック色を設定し、isSwipingをfalseにする
    setInteractionState(prev => ({
        ...prev,
        isSwiping: false, // スワイプ操作は完了
        flyingDirection: direction, // 飛んでいくアニメーション開始
        feedbackColor: direction === 'right' ? styles.feedbackPink : styles.feedbackLime,
        cardTransform: '', // 飛んでいくアニメーションはCSSに任せるのでtransformはクリア
    }));
    
    // アニメーション時間はCSSで0.6sなので、その後にgoToNextPaper
    setTimeout(() => {
      goToNextPaper();
    }, 600); // Animation duration
  }, [papers, currentPaperIndex, goToNextPaper, interactionState.flyingDirection]); // flyingDirectionを依存配列に追加

  const handleLike = useCallback(() => { if (!papers[currentPaperIndex]) return; handleSwipeAction('right'); }, [papers, currentPaperIndex, handleSwipeAction]);
  const handleDislike = useCallback(() => { if (!papers[currentPaperIndex]) return; handleSwipeAction('left'); }, [papers, currentPaperIndex, handleSwipeAction]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!e.touches[0] || interactionState.flyingDirection) {
      console.log('handleTouchStart: Skipped due to flyingDirection or no touches.');
      return;
    }
    console.log('handleTouchStart: Initiating swipe');
    // スワイプ開始時に、前回のスワイプ試行の transform や feedbackColor をリセット
    // flyingDirection はここでnullのはず
    setInteractionState({ // isSwipingをtrueにし、その他はリセット
        isSwiping: true,
        cardTransform: '', // 開始時は変形なし
        feedbackColor: '', // 開始時はフィードバック色なし
        flyingDirection: null, // 明示的にnull
    });
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX; // touchCurrentX も初期化
    touchStartY.current = e.touches[0].clientY;
    console.log('handleTouchStart: State updated, refs set.');
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null || !e.touches[0] || touchStartY.current === null || !topCardRef.current || interactionState.flyingDirection || !interactionState.isSwiping) {
      // console.log('handleTouchMove: Skipped', {flying: interactionState.flyingDirection, swiping: interactionState.isSwiping, startX: touchStartX.current});
      return;
    }
    const currentX = e.touches[0].clientX; const currentY = e.touches[0].clientY; touchCurrentX.current = currentX; const diffX = currentX - touchStartX.current; const diffY = Math.abs(currentY - touchStartY.current);
    // 縦方向の動きが優勢な場合はスワイプをリセット（カード内スクロール優先）
    if (diffY > Math.abs(diffX) * 1.8 && diffY > 15) {
      if(interactionState.isSwiping) { console.log("TouchMove: Vertical scroll detected, resetting card."); resetCardInteraction();}
      return;
    }
    const rotation = (diffX / topCardRef.current.offsetWidth) * SWIPE_MAX_ROTATION; const translateX = diffX * SWIPE_TRANSLATE_X_SCALE;
    setInteractionState(prev => ({
        ...prev,
        cardTransform: `translateX(${translateX}px) rotate(${rotation}deg)`,
        feedbackColor: Math.abs(diffX) > SWIPE_THRESHOLD / 2 ? (diffX > 0 ? styles.feedbackPink : styles.feedbackLime) : ''
    }));
    // console.log('handleTouchMove: State updated', {diffX, diffY, rotation, translateX});
  };

  const handleTouchEnd = () => {
    // 終了処理を呼ぶ前に、そもそもスワイプ操作中だったか、または飛ぶ処理が始まってなかったかを確認
    if (!interactionState.isSwiping && !interactionState.flyingDirection) {
       console.log("TouchEnd: Skipped, was not swiping and not flying.");
       return; // スワイプ操作を開始していなければ何もしない
    }
    if (interactionState.flyingDirection) {
       console.log("TouchEnd: Skipped, card is already flying.");
       // resetCardInteraction(); // 飛んでいる最中に指を離しても状態は維持で良い
       return;
    }

    // スワイプ操作は終わったので isSwiping を false にする (アクションに関わらず)
    // setInteractionState(prev => ({...prev, isSwiping: false})); // この行はresetCardInteractionやhandleSwipeAction内で行われるべき

    if (touchStartX.current === null || touchCurrentX.current === null ) {
      console.log("TouchEnd: Resetting due to null touch refs.");
      resetCardInteraction(); // refsがnullなら無効な操作としてリセット
      return;
    }

    const diffX = touchCurrentX.current - touchStartX.current;
    console.log("TouchEnd: Swipe ended, diffX:", diffX);

    if (Math.abs(diffX) > SWIPE_THRESHOLD) {
      console.log("TouchEnd: Swipe threshold met, calling handleSwipeAction.");
      // handleSwipeAction内で isSwiping は false になる
      handleSwipeAction(diffX > 0 ? 'right' : 'left');
    } else {
      console.log("TouchEnd: Swipe threshold NOT met, resetting card.");
      // resetCardInteraction内で isSwiping は false になる
      resetCardInteraction(); // 閾値未満ならカードを元の位置に
    }
  };

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
              } else if (!isOnlyCardCurrentlyVisible) {
                if (!interactionState.flyingDirection) {
                    cardDynamicStyles.transform = `scale(${1 - (indexInStack * 0.04)}) translateY(${indexInStack * 8}px) rotate(${indexInStack * (indexInStack % 2 === 0 ? -1:1) * 1}deg)`;
                    cardDynamicStyles.opacity = 1 - (indexInStack * 0.4);
                } else if (indexInStack === 1) {
                    animationClass = styles.animateNextCardEnter || '';
                }
              }
              
              let cardClasses = styles.card;
              // スワイプ操作中（まだ飛んでない）または飛ぶアニメーション中のクラス適用
              if (isTopCard && interactionState.isSwiping) { // スワイプ操作中
                 cardClasses += ` ${styles.activeGrab} ${styles.isSwiping}`;
              } else if (isTopCard && interactionState.flyingDirection) { // 飛ぶアニメーション開始
                 cardClasses += ` ${animationClass}`; // アニメーションクラスを適用
              }

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