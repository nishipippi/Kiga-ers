// apps/web/src/contexts/LikedPapersContext.tsx
'use client';

import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';

export interface Paper {
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

interface LikedPapersContextType {
  likedPapers: Paper[];
  addLikedPaper: (paper: Paper) => void;
  removeLikedPaper: (paperId: string) => void;
  isPaperLiked: (paperId: string) => boolean;
  clearLikedPapers: () => void;
  isLoadingPersistence: boolean; // ローカルストレージ読み込み中フラグ
}

const LikedPapersContext = createContext<LikedPapersContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'kigaers_likedPapers';

export const LikedPapersProvider = ({ children }: { children: ReactNode }) => {
  const [likedPapers, setLikedPapers] = useState<Paper[]>([]); // 初期値は必ず空配列
  const [isLoadingPersistence, setIsLoadingPersistence] = useState(true); // ★★★ 追加: ローカルストレージ読み込み中フラグ ★★★

  // ★★★ 修正点: localStorageからの読み込みをuseEffectに移動 ★★★
  useEffect(() => {
    // クライアントサイドでのみ実行
    if (typeof window !== 'undefined') {
      try {
        const savedPapers = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedPapers) {
          const parsedPapers = JSON.parse(savedPapers);
          if (Array.isArray(parsedPapers) && parsedPapers.every(p => typeof p.id === 'string')) {
            setLikedPapers(parsedPapers);
          }
        }
      } catch (error) {
        console.error("Failed to load liked papers from localStorage:", error);
      } finally {
        setIsLoadingPersistence(false); // 読み込み完了（成功・失敗問わず）
      }
    } else {
        setIsLoadingPersistence(false); // サーバーサイドでは即座に読み込み完了扱い
    }
  }, []); // マウント時に一度だけ実行

  useEffect(() => {
    // likedPapers が変更されたら localStorage に保存 (クライアントサイドでのみ)
    // ただし、初期のisLoadingPersistenceがtrueの間は書き込まないようにする
    if (typeof window !== 'undefined' && !isLoadingPersistence) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(likedPapers));
      } catch (error) {
        console.error("Failed to save liked papers to localStorage:", error);
      }
    }
  }, [likedPapers, isLoadingPersistence]); // isLoadingPersistenceも依存配列に追加

  const addLikedPaper = useCallback((paper: Paper) => {
    setLikedPapers((prevPapers) => {
      if (!prevPapers.find(p => p.id === paper.id)) {
        return [...prevPapers, paper];
      }
      return prevPapers;
    });
  }, []);

  const removeLikedPaper = useCallback((paperId: string) => {
    setLikedPapers((prevPapers) => prevPapers.filter((p) => p.id !== paperId));
  }, []);

  const isPaperLiked = useCallback((paperId: string) => {
    return likedPapers.some(p => p.id === paperId);
  }, [likedPapers]);

  const clearLikedPapers = useCallback(() => {
    setLikedPapers([]);
  }, []);

  return (
    <LikedPapersContext.Provider value={{ likedPapers, addLikedPaper, removeLikedPaper, isPaperLiked, clearLikedPapers, isLoadingPersistence }}>
      {children}
    </LikedPapersContext.Provider>
  );
};

export const useLikedPapers = () => {
  const context = useContext(LikedPapersContext);
  if (context === undefined) {
    throw new Error('useLikedPapers must be used within a LikedPapersProvider');
  }
  return context;
};