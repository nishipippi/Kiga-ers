// apps/web/src/contexts/LikedPapersContext.tsx
'use client';

import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';

export interface Paper {
  id: string;
  title: string;
  summary: string; // 元のAbstract
  authors: string[];
  published: string;
  updated: string;
  pdfLink: string;
  categories: string[];
  aiSummary?: string; // AIによる日本語要約
  isEndOfFeedCard?: boolean;
  endOfFeedMessage?: string;
}

interface LikedPapersContextType {
  likedPapers: Paper[];
  addLikedPaper: (paper: Paper) => void;
  removeLikedPaper: (paperId: string) => void;
  isPaperLiked: (paperId: string) => boolean;
  updateLikedPaperSummary: (paperId: string, aiSummary: string) => void; // ★★★ 追加 ★★★
  clearLikedPapers: () => void;
  isLoadingPersistence: boolean;
}

const LikedPapersContext = createContext<LikedPapersContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'kigaers_likedPapers';

export const LikedPapersProvider = ({ children }: { children: ReactNode }) => {
  const [likedPapers, setLikedPapers] = useState<Paper[]>([]);
  const [isLoadingPersistence, setIsLoadingPersistence] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedPapers = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedPapers) {
          const parsedPapers = JSON.parse(savedPapers);
          if (Array.isArray(parsedPapers) && parsedPapers.every(p => typeof p.id === 'string' && typeof p.title === 'string')) {
            setLikedPapers(parsedPapers);
          } else {
            console.warn("LikedPapersContext: Data in localStorage is not in expected format.");
            localStorage.removeItem(LOCAL_STORAGE_KEY);
          }
        }
      } catch (error) {
        console.error("LikedPapersContext: Failed to load liked papers from localStorage:", error);
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } finally {
        setIsLoadingPersistence(false);
      }
    } else {
        setIsLoadingPersistence(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !isLoadingPersistence) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(likedPapers));
      } catch (error) {
        console.error("LikedPapersContext: Failed to save liked papers to localStorage:", error);
      }
    }
  }, [likedPapers, isLoadingPersistence]);

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
    if (isLoadingPersistence) return false;
    return likedPapers.some(p => p.id === paperId);
  }, [likedPapers, isLoadingPersistence]);

  // ★★★ 追加: 特定の論文のAI要約を更新する関数 ★★★
  const updateLikedPaperSummary = useCallback((paperId: string, aiSummary: string) => {
    setLikedPapers((prevPapers) =>
      prevPapers.map((p) =>
        p.id === paperId ? { ...p, aiSummary: aiSummary } : p
      )
    );
  }, []);

  const clearLikedPapers = useCallback(() => {
    setLikedPapers([]);
  }, []);

  return (
    <LikedPapersContext.Provider value={{ likedPapers, addLikedPaper, removeLikedPaper, isPaperLiked, updateLikedPaperSummary, clearLikedPapers, isLoadingPersistence }}>
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