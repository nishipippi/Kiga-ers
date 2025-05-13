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
    isSwiping: boolean; // タッチ操作中かどうか
    cardTransform: string; // タッチ操作による変形スタイル
    feedbackColor: string; // タッチ操作によるフィードバック色クラス名
    flyingDirection: 'left' | 'right' | null; // スワイプ完了して飛んでいく方向
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
    // フェッチ開始前にインタラクション状態をリセット（特に flyingDirection を null に）
    setInteractionState({ isSwiping: false, cardTransform: '', feedbackColor: '', flyingDirection: null });
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
             // APIが返す件数がMAX_RESULTS未満なら、これが最後のバッチである可能性が高い
             setHasMorePapers(data.length === MAX_RESULTS_PER_FETCH);
             return isInitialOrNewSearch ? newPapers : [...prevPapers, ...newPapers];
          } else {
             // 新しいユニークな論文がなかった場合
             if (!isInitialOrNewSearch) setHasMorePapers(false); // 追加ロードで新しいものがなければ、もうないと判断
             // APIからデータが0件だった場合も setHasMorePapers(false) は別途行われる
             return prevPapers; // 論文リストは更新しない
          }
        });
        setMessage(null); // データ取得成功時はメッセージクリア
      } else { // APIからデータが0件だった場合
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
  }, [isLoading, currentSearchTerm, papers.length, hasMorePapers, setIsLoading, setPapers, setCurrentPaperIndex, setMessage, setHasMorePapers, setInteractionState]); // 依存配列

  const handleSearchInputChange = (event: React.ChangeEvent<HTMLInputElement>) => { setSearchQuery(event.target.value); };
  const handleSearchSubmit = (event?: React.FormEvent<HTMLFormElement>) => { if (event) event.preventDefault(); const term = searchQuery.trim(); console.log('Search submitted with query:', term); setCurrentSearchTerm(term); fetchPapers(true, term); };

  useEffect(() => { console.log('useEffect (Mount): currentSearchTerm:', currentSearchTerm, "papers.length:", papers.length); if (currentSearchTerm === '' && papers.length === 0 && hasMorePapers) { console.log('useEffect (Mount): Calling initial fetchPapers for default content.'); fetchPapers(true, ''); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { console.log('useEffect (Index/Papers Change Check): papers.length:', papers.length, 'currentPaperIndex:', currentPaperIndex, 'isLoading:', isLoading, 'currentSearchTerm:', currentSearchTerm, 'hasMorePapers:', hasMorePapers); const thresholdIndex = papers.length > VISIBLE_CARDS_IN_STACK ? papers.length - VISIBLE_CARDS_IN_STACK : papers.length > 0 ? papers.length -1 : 0; const needsMoreFetch = papers.length > 0 && currentPaperIndex >= thresholdIndex; if (needsMoreFetch && !isLoading && hasMorePapers) { console.log('useEffect (Index/Papers Change Check): Condition met for fetching more papers for term:', currentSearchTerm); fetchPapers(false, currentSearchTerm); } else if (isLoading && needsMoreFetch) { console.log('useEffect (Index/Papers Change Check): Needs more, but currently loading.'); } else if (!hasMorePapers && needsMoreFetch) { console.log('useEffect (Index/Papers Change Check): Needs more, but no more papers indicated.'); } else { console.log('useEffect (Index/Papers Change Check): Conditions not met for fetching more.'); }
  }, [currentPaperIndex, papers.length, isLoading, fetchPapers, currentSearchTerm, hasMorePapers]);

  const generateAiSummary = useCallback(async (paperId: string, textToSummarize: string) => { if (!textToSummarize || isSummarizing) return; setIsSummarizing(true); try { const response = await fetch('/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ textToSummarize }), }); if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(`要約の生成に失敗しました。 Status: ${response.status}. ${errorData.error || ''}`); } const data = await response.json(); setPapers(prevPapers => prevPapers.map(p => p.id === paperId ? { ...p, aiSummary: data.summary } : p)); } catch (error) { console.error('Failed to generate summary:', error); alert(`要約生成エラー: ${error instanceof Error ? error.message : '不明なエラー'}`); } finally { setIsSummarizing(false); } }, [isSummarizing]);
  
  const resetCardInteraction = useCallback(() => { // useCallback でメモ化
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
  }, [setInteractionState]); // setInteractionState は安定しているが依存配列に含める

  const goToNextPaper = useCallback(() => {
    console.log('goToNextPaper called, resetting interaction state for next card');
    // 次のカードに遷移する前に、インタラクション状態をリセット
    setInteractionState({
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
    const paperToRate = papers[currentPaperIndex];
    // if (!paperToRate || interactionState.flyingDirection) { // Guard against multiple actions
    //     console.log('handleSwipeAction: Skipped, no paper or already flying.');
    //     return;
    // }
     // paperToRate は必ず存在するという前提（JSXの条件でチェック）
     // interactionState.flyingDirection は touchEnd や button click 時点では null になっているはず（リセットロジックによる）

    console.log(`handleSwipeAction: ${direction}`);
    // isSwiping を false にセットし、flyingDirection と feedbackColor を設定
    setInteractionState(prev => ({ ...prev, isSwiping: false, flyingDirection: direction, feedbackColor: direction === 'right' ? styles.feedbackPink : styles.feedbackLime, cardTransform: '' }));

    // アニメーション時間はCSSで0.6sなので、その後にgoToNextPaper
    setTimeout(() => {
      goToNextPaper();
    }, 600); // Animation duration
  }, [papers, currentPaperIndex, goToNextPaper]); // interactionState.flyingDirection は依存配列から削除

  const handleLike = useCallback(() => { if (!papers[currentPaperIndex]) return; console.log('handleLike (button) called'); handleSwipeAction('right'); }, [papers, currentPaperIndex, handleSwipeAction]);
  const handleDislike = useCallback(() => { if (!papers[currentPaperIndex]) return; console.log('handleDislike (button) called'); handleSwipeAction('left'); }, [papers, currentPaperIndex, handleSwipeAction]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // カードが飛んでいくアニメーション中なら、新しいスワイプは開始しない
    if (!e.touches[0] || interactionState.flyingDirection) {
      console.log('handleTouchStart: Skipped due to flyingDirection or no touches.');
      return;
    }
    console.log('handleTouchStart: Initiating swipe');
    // スワイプ開始時に、前回のスワイプ試行の状態をリセット
    setInteractionState(prev => ({
        ...prev,
        isSwiping: true,
        cardTransform: '', // 開始時は変形なし
        feedbackColor: '', // 開始時はフィードバック色なし
    }));
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    // isSwipingがfalseになった後やflyingDirection中は処理しない
    if (touchStartX.current === null || !e.touches[0] || touchStartY.current === null || !topCardRef.current || interactionState.flyingDirection || !interactionState.isSwiping) {
      return;
    }
    const currentX = e.touches[0].clientX; const currentY = e.touches[0].clientY; touchCurrentX.current = currentX; const diffX = currentX - touchStartX.current; const diffY = Math.abs(currentY - touchStartY.current);
    // 縦スクロールが優勢な場合、スワイプをリセット
    if (diffY > Math.abs(diffX) * 1.8 && diffY > 15) { if(interactionState.isSwiping) { console.log("TouchMove: Vertical scroll detected, resetting card."); resetCardInteraction();} return; }
    
    const rotation = (diffX / topCardRef.current.offsetWidth) * SWIPE_MAX_ROTATION; const translateX = diffX * SWIPE_TRANSLATE_X_SCALE;
    setInteractionState(prev => ({
      ...prev,
      cardTransform: `translateX(${translateX}px) rotate(${rotation}deg)`,
      feedbackColor: Math.abs(diffX) > SWIPE_THRESHOLD / 2 ? (diffX > 0 ? styles.feedbackPink : styles.feedbackLime) : ''
    }));
  };

  const handleTouchEnd = () => {
    // スワイプ中でない、または既に飛ぶ処理が始まっていたら何もしない
    if (!interactionState.isSwiping || interactionState.flyingDirection) {
      console.log("TouchEnd: Skipped, not swiping or already flying.");
      // スワイプ操作が意図せず終了した場合に state を確実にリセット
      if (interactionState.isSwiping && !interactionState.flyingDirection) { // Swiped but threshold not met, or cancelled
           resetCardInteraction();
      }
      return;
    }
    // touchStartX や touchCurrentX が null の場合（非常に稀だが念のため）
    if (touchStartX.current === null || touchCurrentX.current === null ) {
      console.log("TouchEnd: Resetting due to null touch refs.");
      resetCardInteraction();
      return;
    }

    const diffX = touchCurrentX.current - touchStartX.current;
    if (Math.abs(diffX) > SWIPE_THRESHOLD) {
      console.log("TouchEnd: Swipe threshold met, performing action.");
      // アクションを呼び出す -> handleSwipeAction内で isSwiping は false になる
      handleSwipeAction(diffX > 0 ? 'right' : 'left');
    } else {
      console.log("TouchEnd: Swipe threshold NOT met, resetting card.");
      // 閾値未満ならカードを元の位置に -> resetCardInteraction内で isSwiping は false になる
      resetCardInteraction();
    }
    // isSwiping state は handleSwipeAction または resetCardInteraction の中で false にセットされる
    // ここでは明示的に setIsSwiping(false) を呼ばない
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
                // トップカードはスワイプ中のインタラクションと飛んでいくアニメーションをハンドル
                cardDynamicStyles.transform = interactionState.cardTransform;
                // 飛んでいく方向が設定されていればアニメーションクラスを設定
                if (interactionState.flyingDirection === 'left') animationClass = styles.animateFlyOutLeft || '';
                if (interactionState.flyingDirection === 'right') animationClass = styles.animateFlyOutRight || '';
              } else if (!isOnlyCardCurrentlyVisible) { // 唯一表示されるカードではない場合のみ、スタックのスタイルを適用
                // スタックの後ろのカードのスタイル
                if (!interactionState.flyingDirection) { // トップカードが飛んでいない時
                    cardDynamicStyles.transform = `scale(${1 - (indexInStack * 0.04)}) translateY(${indexInStack * 8}px) rotate(${indexInStack * (indexInStack % 2 === 0 ? -1:1) * 1}deg)`;
                    cardDynamicStyles.opacity = 1 - (indexInStack * 0.4);
                } else if (indexInStack === 1) { // トップが飛んでいて、このカードが次のトップになる場合
                    animationClass = styles.animateNextCardEnter || '';
                }
              }
              // isOnlyCard が true の場合、cardDynamicStyles は {} のまま (変形なし)

              let cardClasses = styles.card;
              // スワイプ中のスタイルクラス (draggedなど、CSSで別途定義)
              // isTopCard && interactionState.isSwiping && !interactionState.flyingDirection は TouchMove でのインタラクション中
              if (isTopCard && interactionState.isSwiping && !interactionState.flyingDirection) {
                   cardClasses += ` ${styles.isSwiping}`; // スワイプ中のスタイル（カーソル変更など）
              }

              // アニメーションクラスは flyingDirection が設定された時に適用
              if (animationClass) {
                 cardClasses += ` ${animationClass}`;
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