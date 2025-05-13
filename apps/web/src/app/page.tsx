// apps/web/src/app/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import FormattedTextRenderer from '@/components/FormattedTextRenderer'; // Ensure this path is correct

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

// スワイプの閾値 (px)
const SWIPE_THRESHOLD = 70; // 少し大きめに
// スワイプ中のカードの動きの最大角度 (度)
const SWIPE_MAX_ROTATION = 20;
// スワイプ中のカードの横移動のスケール
const SWIPE_TRANSLATE_X_SCALE = 1.3;
// スワイプフィードバックの不透明度
const SWIPE_FEEDBACK_OPACITY = 'opacity-30';


export default function HomePage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [currentPaperIndex, setCurrentPaperIndex] = useState(0);
  const [likedPapers, setLikedPapers] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>('論文を読み込み中...');
  const [isLoading, setIsLoading] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchCurrentX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [cardTransform, setCardTransform] = useState('');
  const [cardFeedbackColor, setCardFeedbackColor] = useState(''); // スワイプ中の背景色クラス
  const [isSwiping, setIsSwiping] = useState(false);


  const fetchPapers = useCallback(async () => {
    setIsLoading(true);
    setMessage('論文を読み込み中...');
    try {
      const response = await fetch('/api/papers');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`論文データの取得に失敗しました。 Status: ${response.status}. ${errorData.error || ''}`);
      }
      const data: Paper[] = await response.json();
      if (data && data.length > 0) {
        setPapers(data);
        setCurrentPaperIndex(0);
        setMessage(null);
      } else {
        setPapers([]);
        setMessage('表示できる論文が見つかりませんでした。');
      }
    } catch (error) {
      console.error('Failed to fetch papers:', error);
      setMessage(`論文の読み込み中にエラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
      setPapers([]);
    } finally {
      setIsLoading(false);
      setCardTransform('');
      setCardFeedbackColor('');
    }
  }, []);

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers]);

  const currentPaper = papers[currentPaperIndex];

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

  const resetCardState = () => {
    setCardTransform('');
    setCardFeedbackColor('');
    touchStartX.current = null;
    touchCurrentX.current = null;
    touchStartY.current = null;
    setIsSwiping(false);
  };

  const goToNextPaper = useCallback(() => {
    resetCardState();
    const nextIndex = currentPaperIndex + 1;
    if (nextIndex < papers.length) {
      setCurrentPaperIndex(nextIndex);
    } else {
      setMessage('表示できる論文は以上です。');
    }
  }, [currentPaperIndex, papers.length]);


  const handleLike = useCallback(() => {
    if (!currentPaper) return;
    console.log(`いいね: ${currentPaper.title} (ID: ${currentPaper.id})`);
    setLikedPapers(prev => {
      if (!prev.includes(currentPaper.id)) {
        return [...prev, currentPaper.id];
      }
      return prev;
    });
    // 右スワイプ（興味あり）の演出
    setCardFeedbackColor('bg-pink-500'); // 飛んでいくときの色: ピンク系
    setCardTransform('translateX(100vw) rotate(30deg)');
    setTimeout(() => {
        goToNextPaper();
    }, 300); // アニメーション時間
  }, [currentPaper, goToNextPaper]);

  const handleDislike = useCallback(() => {
    if (!currentPaper) return;
    console.log(`興味なし: ${currentPaper.title} (ID: ${currentPaper.id})`);
    // 左スワイプ（興味なし）の演出
    setCardFeedbackColor('bg-lime-500'); // 飛んでいくときの色: 黄緑系
    setCardTransform('translateX(-100vw) rotate(-30deg)');
    setTimeout(() => {
        goToNextPaper();
    }, 300); // アニメーション時間
  }, [currentPaper, goToNextPaper]);


  // --- スワイプ処理 ---
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!e.touches[0]) return;
    resetCardState(); // 念のためリセット
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null || !e.touches[0] || touchStartY.current === null || !cardRef.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    touchCurrentX.current = currentX;

    const diffX = currentX - touchStartX.current;
    const diffY = currentY - touchStartY.current;

    // 縦スクロールを優先させるための条件（カード内コンテンツのスクロールを許可）
    // スワイプ開始時からのY軸の移動量がX軸の移動量より大きい場合、かつY軸の移動が一定以上ある場合は、
    // 横スワイプのアニメーションを中断し、カードを元の状態に戻すことで、親要素のスクロールを優先させる。
    // ただし、カード自体に overflow-y: auto と touchAction: 'pan-y' (カードのコンテンツエリアで) が設定されていれば、
    // このロジックは不要になるか、より洗練させる必要がある。
    // 今回はカード全体で touchAction: 'none' を指定しているので、この縦方向判定は維持する。
    if (Math.abs(diffY) > Math.abs(diffX) * 1.5 && Math.abs(diffY) > 20) { // Y軸の動きが支配的で、20px以上動いたら
        if(isSwiping) { // 既に横スワイプアニメーションが始まっていたらリセット
            resetCardState();
        }
        // このリセットにより、ブラウザのデフォルトの縦スクロールが（もしあれば）機能する余地が生まれる。
        // ただし、カード自体に `touch-action: none` がかかっているため、
        // カード内コンテンツのスクロールは別の要素で行う必要がある。
        return;
    }
    
    // 横スワイプの処理を継続
    const rotation = (diffX / cardRef.current.offsetWidth) * SWIPE_MAX_ROTATION * 1.5;
    const translateX = diffX * SWIPE_TRANSLATE_X_SCALE;
    setCardTransform(`translateX(${translateX}px) rotate(${rotation}deg)`);

    // スワイプ方向に応じてフィードバック色を設定
    if (Math.abs(diffX) > SWIPE_THRESHOLD / 3) { // 少し動いたら色を変える
      if (diffX > 0) { // 右スワイプ（興味あり）
        setCardFeedbackColor('bg-pink-300');
      } else { // 左スワイプ（興味なし）
        setCardFeedbackColor('bg-lime-300');
      }
    } else {
      setCardFeedbackColor('');
    }
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchCurrentX.current === null || !isSwiping) {
      if (isSwiping) resetCardState();
      return;
    }
    
    const diffX = touchCurrentX.current - touchStartX.current;

    if (Math.abs(diffX) > SWIPE_THRESHOLD) {
      if (diffX > 0) { // 右スワイプ
        handleLike();
      } else { // 左スワイプ
        handleDislike();
      }
    } else {
      resetCardState(); // 閾値未満ならカードを元の位置に
    }
    setIsSwiping(false); // どの道スワイプは終了
  };


  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 p-4 font-sans select-none overflow-hidden"
      // bodyでoverflow:hiddenしているので、ここでのtouchActionは影響度が低いが、意図を明確にする
      style={{ touchAction: 'pan-y' }} // 画面全体の縦スクロールは許可する (カード以外)
    >
      <h1 className="text-3xl md:text-4xl font-bold mb-2 text-gray-800 tracking-tight">
        論文を見つけよう
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        いいねした論文数: {likedPapers.length}
      </p>

      {isLoading ? (
        <div className="text-center p-6 bg-white rounded-lg shadow-md w-full max-w-md">
          <p className="text-xl text-gray-700 mb-4">{message}</p>
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      ) : message && !currentPaper ? (
        <div className="text-center p-6 bg-white rounded-lg shadow-md w-full max-w-md">
          <p className="text-xl text-gray-700 mb-4">{message}</p>
          <button
            onClick={fetchPapers}
            className="mt-4 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-5 rounded-full transition-all duration-200 shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transform hover:scale-105"
          >
            再読み込み
          </button>
        </div>
      ) : currentPaper ? (
        <div className="relative w-full max-w-2xl h-[70vh] flex items-center justify-center">
          <div
            ref={cardRef}
            className={`absolute bg-white rounded-xl shadow-xl p-6 w-full text-left border border-gray-100 cursor-grab active:cursor-grabbing overflow-y-auto h-full flex flex-col`}
            style={{
              transform: cardTransform,
              transition: isSwiping ? 'none' : 'transform 0.3s ease-out, background-color 0.2s linear',
              touchAction: 'none', // カード自体はスワイプで動かすので、ブラウザのパン操作は無効化
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd} // キャンセル時も終了処理を呼ぶ
          >
            {/* スワイプ時の色フィードバック用オーバーレイ */}
            {isSwiping && cardFeedbackColor && (
              <div className={`absolute inset-0 rounded-xl ${cardFeedbackColor} ${SWIPE_FEEDBACK_OPACITY} z-0`}></div>
            )}

            {/* カードの内容 (オーバーレイの上に表示されるように z-10 を追加) */}
            {/* 内容部分をスクロール可能にするために、このdivに touchAction: 'pan-y' を設定 */}
            <div className="relative z-10 flex-grow overflow-y-auto" style={{ touchAction: 'pan-y' }}>
                <h2 className="text-xl lg:text-2xl font-semibold mb-3 text-gray-900 leading-tight sticky top-0 bg-white pt-2 pb-1 z-20">
                  <FormattedTextRenderer text={currentPaper.title} />
                </h2>

                <p className="text-sm text-gray-500 mb-3 italic">
                  Authors: {currentPaper.authors.join(', ')}
                </p>

                <div className="text-xs text-gray-400 mb-4 space-x-2">
                  <span>Published: {new Date(currentPaper.published).toLocaleDateString()}</span>
                  <span>/</span>
                  <span>Updated: {new Date(currentPaper.updated).toLocaleDateString()}</span>
                </div>

                <div className="mb-5 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-semibold text-blue-800 mb-2 flex items-center justify-between">
                    <span className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1.5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v2.586l1.707-1.707a1 1 0 111.414 1.414L12.414 8H15a1 1 0 110 2h-2.586l1.707 1.707a1 1 0 11-1.414 1.414L11 10.414V13a1 1 0 11-2 0v-2.586l-1.707 1.707a1 1 0 11-1.414-1.414L7.586 9H5a1 1 0 110-2h2.586l-1.707-1.707a1 1 0 011.414-1.414L9 5.586V3a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      AIによる要約
                    </span>
                    {!currentPaper.aiSummary && !isSummarizing && (
                      <button
                        onClick={(e) => { e.stopPropagation(); generateAiSummary(currentPaper.id, currentPaper.summary); }}
                        className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1 px-3 rounded-full transition-all duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transform hover:scale-105"
                      >
                        生成する
                      </button>
                    )}
                  </h3>
                  {isSummarizing && currentPaper.id === papers[currentPaperIndex]?.id ? (
                    <p className="text-sm text-blue-700 italic animate-pulse">要約を生成中...</p>
                  ) : currentPaper.aiSummary ? (
                    <p className="text-sm text-blue-900 leading-relaxed">
                      <FormattedTextRenderer text={currentPaper.aiSummary} />
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 italic">（「生成する」ボタンを押してAI要約を表示）</p>
                  )}
                </div>

                <details className="mb-5 group" onClick={(e) => e.stopPropagation()}>
                  <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-800 list-none flex items-center">
                    <span className="group-open:rotate-90 transform transition-transform duration-200 mr-1">▶</span>
                    元の要約 (Abstract) を表示
                  </summary>
                  <div className="text-gray-700 mt-2 text-sm bg-gray-50 p-4 rounded-md border border-gray-200 leading-relaxed">
                    <FormattedTextRenderer text={currentPaper.summary} />
                  </div>
                </details>

                <div className="flex flex-wrap gap-2 mb-6">
                  {currentPaper.categories.map(category => (
                    <span key={category} className="bg-gray-200 text-gray-800 text-xs font-medium px-3 py-1 rounded-full shadow-sm">
                      {category}
                    </span>
                  ))}
                </div>
            </div> {/* End of scrollable content area */}

            {/* ボタンエリアの修正: PDFボタンのみ表示 */}
            <div className="sticky bottom-0 bg-white pt-4 pb-1 mt-auto z-20">
                <div className="flex justify-center sm:justify-start items-center pt-4 border-t border-gray-200"> {/* 修正: justify-center or justify-start */}
                   {currentPaper.pdfLink ? (
                      <a
                        href={currentPaper.pdfLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()} // スワイプイベントを発火させない
                        className="inline-flex items-center bg-gray-700 hover:bg-gray-800 text-white text-sm font-bold py-2 px-4 rounded-full transition-all duration-200 shadow-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-75 transform hover:scale-105"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        PDFを開く
                      </a>
                   ) : (
                      <div className="h-9"></div> // PDFボタンがない場合に高さを維持するためのプレースホルダー (ボタンの高さに合わせる)
                   )}
                  {/* 「興味なし」「興味あり」ボタンは削除 */}
                </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}