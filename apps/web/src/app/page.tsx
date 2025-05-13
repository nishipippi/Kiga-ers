// apps/web/src/app/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import FormattedTextRenderer from '@/components/FormattedTextRenderer'; // 作成したコンポーネントをインポート

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

export default function HomePage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [currentPaperIndex, setCurrentPaperIndex] = useState(0);
  const [likedPapers, setLikedPapers] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>('論文を読み込み中...');
  const [isLoading, setIsLoading] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);

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

  const handleLike = () => {
    if (!currentPaper) return;
    console.log(`いいね: ${currentPaper.title} (ID: ${currentPaper.id})`);
    setLikedPapers(prev => {
      if (!prev.includes(currentPaper.id)) {
        return [...prev, currentPaper.id];
      }
      return prev;
    });
    goToNextPaper();
  };

  const handleDislike = () => {
    if (!currentPaper) return;
    console.log(`興味なし: ${currentPaper.title} (ID: ${currentPaper.id})`);
    goToNextPaper();
  };

  const goToNextPaper = () => {
    const nextIndex = currentPaperIndex + 1;
    if (nextIndex < papers.length) {
      setCurrentPaperIndex(nextIndex);
    } else {
      setMessage('表示できる論文は以上です。');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 p-4 font-sans">
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
      ) : message ? (
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
        <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl text-left transform transition-all duration-300 ease-in-out border border-gray-100">
          {/* ★★★ タイトル表示を FormattedTextRenderer に変更 ★★★ */}
          <h2 className="text-xl lg:text-2xl font-semibold mb-3 text-gray-900 leading-tight">
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
                  onClick={() => generateAiSummary(currentPaper.id, currentPaper.summary)}
                  className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1 px-3 rounded-full transition-all duration-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transform hover:scale-105"
                >
                  生成する
                </button>
              )}
            </h3>
            {isSummarizing && currentPaper.id === papers[currentPaperIndex]?.id ? (
              <p className="text-sm text-blue-700 italic animate-pulse">要約を生成中...</p>
            ) : currentPaper.aiSummary ? (
              // ★★★ AI要約表示も FormattedTextRenderer に変更 ★★★
              <p className="text-sm text-blue-900 leading-relaxed">
                <FormattedTextRenderer text={currentPaper.aiSummary} />
              </p>
            ) : (
              <p className="text-sm text-gray-500 italic">（「生成する」ボタンを押してAI要約を表示）</p>
            )}
          </div>

          <details className="mb-5 group">
            <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-800 list-none flex items-center">
              <span className="group-open:rotate-90 transform transition-transform duration-200 mr-1">▶</span>
              元の要約 (Abstract) を表示
            </summary>
            {/* ★★★ 元の要約表示も FormattedTextRenderer に変更 ★★★ */}
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

          <div className="flex flex-col sm:flex-row justify-between items-center mt-8 pt-6 border-t border-gray-200">
             {currentPaper.pdfLink ? (
                <a
                  href={currentPaper.pdfLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center bg-gray-700 hover:bg-gray-800 text-white text-sm font-bold py-2 px-4 rounded-full transition-all duration-200 shadow-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-75 mb-4 sm:mb-0 transform hover:scale-105"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  PDFを開く
                </a>
             ) : (
                <div className="w-full sm:w-auto mb-4 sm:mb-0"></div>
             )}
            <div className="flex justify-center space-x-4">
              <button
                onClick={handleDislike}
                className="bg-gradient-to-br from-red-400 to-pink-500 hover:from-red-500 hover:to-pink-600 text-white font-bold py-3 px-8 rounded-full transition-all transform hover:scale-105 duration-200 shadow-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75 flex items-center"
                aria-label="興味なし"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                興味なし
              </button>
              <button
                onClick={handleLike}
                className="bg-gradient-to-br from-green-400 to-blue-500 hover:from-green-500 hover:to-blue-600 text-white font-bold py-3 px-8 rounded-full transition-all transform hover:scale-105 duration-200 shadow-lg focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75 flex items-center"
                aria-label="興味あり"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                </svg>
                興味あり
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
