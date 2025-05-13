// apps/web/src/app/library/[paperId]/page.tsx
'use client';

import React, { useState, useEffect, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation'; // useParamsでURLパラメータを取得
import { useLikedPapers, type Paper } from '@/contexts/LikedPapersContext';
import FormattedTextRenderer from '@/components/FormattedTextRenderer';
import styles from './detailPage.module.css'; // CSS Modules ファイル名に合わせて変更
import { ArrowLeftIcon, ChatBubbleLeftEllipsisIcon, PaperAirplaneIcon, SparklesIcon, TrashIcon } from '@heroicons/react/24/outline';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

export default function PaperDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { likedPapers, removeLikedPaper } = useLikedPapers();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [showFullAbstract, setShowFullAbstract] = useState(false);
  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isAskingAi, setIsAskingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const paperId = typeof params.paperId === 'string' ? params.paperId : undefined;

  useEffect(() => {
    if (paperId) {
      const foundPaper = likedPapers.find((p) => p.id === paperId);
      if (foundPaper) {
        setPaper(foundPaper);
      } else {
        // 論文が見つからない場合はライブラリトップに戻るか、エラー表示
        console.warn(`Paper with id ${paperId} not found in liked papers.`);
        router.replace('/library');
      }
    }
  }, [paperId, likedPapers, router]);

  const handleRemoveFromLibrary = () => {
    if (paper) {
      // 確認ダイアログを挟むのが親切
      if (confirm(`「${paper.title}」をライブラリから削除しますか？`)) {
        removeLikedPaper(paper.id);
        router.push('/library'); // 削除後はライブラリ一覧に戻る
      }
    }
  };

  const handleAskAi = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !paper || !paper.pdfLink || isAskingAi) return;

    setIsAskingAi(true);
    setAiError(null);
    const userMessage: ChatMessage = { role: 'user', content: question };
    setChatHistory((prev) => [...prev, userMessage]);
    setQuestion(''); // 入力欄をクリア

    try {
      const response = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMessage.content,
          pdfUrl: paper.pdfLink,
          paperTitle: paper.title,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `AIへの質問に失敗しました (Status: ${response.status})`);
      }

      const data = await response.json();
      const aiMessage: ChatMessage = { role: 'ai', content: data.answer };
      setChatHistory((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error asking AI:", error);
      const errorMessage = error instanceof Error ? error.message : "不明なエラーが発生しました。";
      setAiError(`AIへの質問中にエラーが発生しました: ${errorMessage}`);
      // エラーメッセージをチャット履歴に追加することも検討
      setChatHistory((prev) => [...prev, { role: 'ai', content: `エラー: ${errorMessage}` }]);
    } finally {
      setIsAskingAi(false);
    }
  };


  if (!paper) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>論文情報を読み込み中...</p>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      <button onClick={() => router.back()} className={styles.backButton}>
        <ArrowLeftIcon className={styles.backIcon} />
        ライブラリに戻る
      </button>

      <article className={styles.paperArticle}>
        <header className={styles.paperHeader}>
          <h1 className={styles.paperTitle}><FormattedTextRenderer text={paper.title} /></h1>
          <p className={styles.paperAuthors}>Authors: {paper.authors.join(', ')}</p>
          <div className={styles.paperMeta}>
            <span>Published: {new Date(paper.published).toLocaleDateString()}</span>
            {paper.updated && paper.published !== paper.updated && (
              <span>Updated: {new Date(paper.updated).toLocaleDateString()}</span>
            )}
            {paper.pdfLink && (
              <a href={paper.pdfLink} target="_blank" rel="noopener noreferrer" className={styles.pdfLink}>
                PDFを開く
              </a>
            )}
          </div>
          <div className={styles.categoriesContainer}>
            {paper.categories.map(category => (
              <span key={category} className={styles.categoryTag}>{category}</span>
            ))}
          </div>
        </header>

        {paper.aiSummary && (
          <section className={styles.summarySection}>
            <h2 className={styles.sectionTitle}><SparklesIcon className={styles.sectionIcon} />AIによる要約</h2>
            <div className={styles.summaryContent}><FormattedTextRenderer text={paper.aiSummary} /></div>
          </section>
        )}

        <section className={styles.abstractSection}>
          <h2 className={styles.sectionTitle}>元のAbstract</h2>
          <div className={`${styles.abstractContent} ${showFullAbstract ? styles.showFull : ''}`}>
            <FormattedTextRenderer text={paper.summary} />
          </div>
          {paper.summary.length > 300 && ( // 例えば300文字以上なら「もっと見る」ボタンを表示
            <button onClick={() => setShowFullAbstract(!showFullAbstract)} className={styles.toggleAbstractButton}>
              {showFullAbstract ? '少なく表示' : 'もっと見る'}
            </button>
          )}
        </section>

        <button onClick={handleRemoveFromLibrary} className={styles.removeButton}>
          <TrashIcon className={styles.removeIcon} />
          ライブラリから削除
        </button>
      </article>

      <section className={styles.aiChatSection}>
        <h2 className={styles.sectionTitle}><ChatBubbleLeftEllipsisIcon className={styles.sectionIcon} />AIに質問する</h2>
        <div className={styles.chatHistory} id="chat-history">
          {chatHistory.map((msg, index) => (
            <div key={index} className={`${styles.chatMessage} ${styles[msg.role]}`}>
              <span className={styles.messageRole}>{msg.role === 'user' ? 'あなた' : 'AI'}</span>
              <div className={styles.messageContent}><FormattedTextRenderer text={msg.content} /></div>
            </div>
          ))}
          {isAskingAi && (
            <div className={`${styles.chatMessage} ${styles.ai}`}>
              <span className={styles.messageRole}>AI</span>
              <div className={styles.messageContent}>
                <div className={styles.typingIndicator}>
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}
        </div>
        {aiError && <p className={styles.aiError}>{aiError}</p>}
        <form onSubmit={handleAskAi} className={styles.chatForm}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="論文についてAIに質問を入力してください..."
            className={styles.chatInput}
            rows={3}
            disabled={isAskingAi}
          />
          <button type="submit" className={styles.chatSubmitButton} disabled={isAskingAi || !question.trim()}>
            {isAskingAi ? '送信中...' : <PaperAirplaneIcon className={styles.sendIcon} />}
          </button>
        </form>
      </section>
    </div>
  );
}