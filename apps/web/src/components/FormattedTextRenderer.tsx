// apps/web/src/components/FormattedTextRenderer.tsx
'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css'; // KaTeXのCSSをインポート

interface FormattedTextRendererProps {
  text: string;
}

// LaTeXのデリミタパターン (インラインとディスプレイ)
// $...$, $$...$$, \(...\), \[...\]
// HTMLタグも考慮に入れる
const tokenPattern = /(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|\\\[[\s\S]*?\\\]|\\\(s*[\s\S]*?\\\)|<[^>]+>|[^$<\\\]\[]+)/g;

const FormattedTextRenderer: React.FC<FormattedTextRendererProps> = ({ text }) => {
  const renderedParts = useMemo(() => {
    if (!text) return null;

    const parts = [];
    let match;
    let lastIndex = 0;

    // 正規表現で文字列をトークンに分割
    while ((match = tokenPattern.exec(text)) !== null) {
      const token = match[0];
      const tokenStart = match.index;

      // トークン前のプレーンテキスト部分 (もしあれば)
      if (tokenStart > lastIndex) {
        parts.push(<span key={`text-${lastIndex}`}>{text.substring(lastIndex, tokenStart)}</span>);
      }

      if (token.startsWith('$') && token.endsWith('$')) {
        // インライン LaTeX: $...$ または $$...$$
        const isDisplayMode = token.startsWith('$$');
        const latexContent = token.slice(isDisplayMode ? 2 : 1, isDisplayMode ? -2 : -1);
        try {
          const html = katex.renderToString(latexContent, {
            throwOnError: false, // エラー時に例外を投げない
            displayMode: isDisplayMode,
            // KaTeXのオプション: https://katex.org/docs/options.html
            // 例えば、特定のコマンドを許可/禁止するなど
            // trust: (context) => /^https?:\/\//.test(context.url), // 外部リンクを信頼する場合
          });
          parts.push(
            <span
              key={`latex-${match.index}`}
              dangerouslySetInnerHTML={{ __html: html }}
              className={isDisplayMode ? 'katex-display' : 'katex-inline'}
            />
          );
        } catch (e) {
          console.error('KaTeX rendering error:', e);
          parts.push(<span key={`latex-error-${match.index}`} style={{ color: 'red' }}>{token}</span>); // エラー時は元のテキストを表示
        }
      } else if (token.startsWith('\\(') && token.endsWith('\\)')) {
        // インライン LaTeX: \(...\)
        const latexContent = token.slice(2, -2);
        try {
          const html = katex.renderToString(latexContent, { throwOnError: false, displayMode: false });
          parts.push(<span key={`latex-${match.index}`} dangerouslySetInnerHTML={{ __html: html }} className="katex-inline" />);
        } catch (e) {
          console.error('KaTeX rendering error:', e);
          parts.push(<span key={`latex-error-${match.index}`} style={{ color: 'red' }}>{token}</span>);
        }
      } else if (token.startsWith('\\[') && token.endsWith('\\]')) {
        // ディスプレイ LaTeX: \[...\]
        const latexContent = token.slice(2, -2);
        try {
          const html = katex.renderToString(latexContent, { throwOnError: false, displayMode: true });
          parts.push(<span key={`latex-${match.index}`} dangerouslySetInnerHTML={{ __html: html }} className="katex-display" />);
        } catch (e) {
          console.error('KaTeX rendering error:', e);
          parts.push(<span key={`latex-error-${match.index}`} style={{ color: 'red' }}>{token}</span>);
        }
      } else if (token.startsWith('<') && token.endsWith('>')) {
        // HTMLタグ (例: <b>, <i>, <sup>, <sub>)
        // 注意: この方法はXSS脆弱性のリスクがあるため、信頼できるHTMLのみに使用してください。
        // より安全な方法としては、DOMPurifyのようなサニタイザライブラリと併用することを推奨します。
        // arXivのデータは比較的信頼できると仮定しますが、本番環境では注意が必要です。
        parts.push(<span key={`html-${match.index}`} dangerouslySetInnerHTML={{ __html: token }} />);
      } else {
        // 通常のテキスト
        parts.push(<span key={`text-${match.index}`}>{token}</span>);
      }
      lastIndex = tokenPattern.lastIndex;
    }

    // 最後のトークン以降のプレーンテキスト部分 (もしあれば)
    if (lastIndex < text.length) {
      parts.push(<span key={`text-${lastIndex}-end`}>{text.substring(lastIndex)}</span>);
    }

    return parts;
  }, [text]);

  return <>{renderedParts}</>;
};

export default FormattedTextRenderer;
