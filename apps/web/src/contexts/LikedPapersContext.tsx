// apps/web/src/contexts/LikedPapersContext.tsx
'use client';

import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';

// Paper型をインポート (実際のパスに合わせてください)
// 例: import type { Paper } from '@/app/page';
// もしPaper型がpage.tsx内で定義されている場合、それをエクスポートするか、
// 共通の型定義ファイルに移動する必要があります。
// ここでは仮の型定義を置いておきます。実際のプロジェクトに合わせてください。
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
  isEndOfFeedCard?: boolean; // ライブラリでは通常不要だが、元の型に合わせる
  endOfFeedMessage?: string; // 同上
}


interface LikedPapersContextType {
  likedPapers: Paper[];
  addLikedPaper: (paper: Paper) => void;
  removeLikedPaper: (paperId: string) => void;
  isPaperLiked: (paperId: string) => boolean;
  clearLikedPapers: () => void; // オプション: ライブラリ全削除機能
}

const LikedPapersContext = createContext<LikedPapersContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'kigaers_likedPapers';

export const LikedPapersProvider = ({ children }: { children: ReactNode }) => {
  const [likedPapers, setLikedPapers] = useState<Paper[]>(() => {
    // クライアントサイドでのみ localStorage から読み込む
    if (typeof window !== 'undefined') {
      try {
        const savedPapers = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedPapers) {
          const parsedPapers = JSON.parse(savedPapers);
          // 簡単な型チェック (より厳密なチェックも可能)
          if (Array.isArray(parsedPapers) && parsedPapers.every(p => typeof p.id === 'string')) {
            return parsedPapers;
          }
        }
      } catch (error) {
        console.error("Failed to load liked papers from localStorage:", error);
      }
    }
    return [];
  });

  // likedPapers が変更されたら localStorage に保存 (クライアントサイドでのみ)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(likedPapers));
      } catch (error) {
        console.error("Failed to save liked papers to localStorage:", error);
      }
    }
  }, [likedPapers]);

  const addLikedPaper = useCallback((paper: Paper) => {
    setLikedPapers((prevPapers) => {
      if (!prevPapers.find(p => p.id === paper.id)) {
        return [...prevPapers, paper];
      }
      return prevPapers; // 既に存在する場合は変更しない
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
    <LikedPapersContext.Provider value={{ likedPapers, addLikedPaper, removeLikedPaper, isPaperLiked, clearLikedPapers }}>
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