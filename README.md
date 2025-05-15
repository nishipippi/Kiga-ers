# KigaIrs: 論文スワイプアプリ

**論文との新しい出会いを、もっと直感的に。**

**すぐに試す → [https://kiga-irs-web.vercel.app/](https://kiga-irs-web.vercel.app/)**

Kiga-ers（キガース）は、[arXiv](https://arxiv.org/) の論文をスワイプ操作で閲覧できるWebアプリケーションです。忙しい研究者や学生、新しい知識に触れたいすべての人へ、効率的かつ楽しく論文を発見する体験を提供します。

## 主な機能

*   **論文スワイプインターフェース**:
    *   表示された論文カードを右（興味あり/いいね）または左（興味なし）にスワイプして、直感的に論文を評価できます。
    *   PCではボタンクリックでも同様の操作が可能です。
*   **AIによる論文要約 (日本語)**:
    *   各論文のAbstract（英語）を、Google Gemini APIを利用してオンデマンドで日本語に要約します。
    *   専門的な内容も、より迅速に概要を把握できます。
*   **論文検索**:
    *   キーワードを入力して、arXiv上の論文を検索できます。
    *   検索結果もスワイプ形式で表示されます。
*   **PDFへの簡単アクセス**:
    *   興味を持った論文は、ワンクリックでarXiv上のPDFファイルを開くことができます。
*   **LaTeX数式・HTML表示対応**:
    *   論文タイトルや要約に含まれるLaTeX形式の数式や、一部のHTMLタグを適切にレンダリングして表示します。
*   **いいねした論文のカウント**:
    *   「いいね」した論文の数が表示され、モチベーションにつながります（現時点では一覧表示機能はありません）。
*   **レスポンシブデザイン**:
    *   PC、タブレット、スマートフォンなど、様々なデバイスで快適に利用できます。

## こんな方におすすめ

*   最新の研究動向を効率的にキャッチアップしたい研究者・学生の方
*   自分の専門分野以外の新しい論文に偶然出会いたい方
*   論文を読む時間をなかなか確保できない方
*   楽しく情報収集をしたい方

## 技術スタック

Kiga-ersは以下の技術を使用して構築されています。

*   **フロントエンド**:
    *   [Next.js](https://nextjs.org/) (App Router)
    *   [React](https://reactjs.org/)
    *   [TypeScript](https://www.typescriptlang.org/)
    *   CSS Modules (グローバルCSSとの併用)
*   **UIコンポーネント・ライブラリ**:
    *   [@heroicons/react](https://heroicons.com/) (アイコン)
    *   [KaTeX](https://katex.org/) (LaTeX数式レンダリング)
*   **API連携**:
    *   Next.js API Routes (Route Handlers)
    *   [arXiv API](https://arxiv.org/help/api/index) (論文データ取得)
    *   [Google Gemini API](https://ai.google.dev/models/gemini) (論文要約生成 - `@google/genai` SDK利用)
*   **データ処理**:
    *   [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) (arXiv APIのXMLレスポンス解析)
*   **開発・ビルドツール**:
    *   [pnpm](https://pnpm.io/) (パッケージマネージャー、モノレポ管理)
    *   ESLint, Prettier (コード品質管理 - 推奨)
*   **デプロイメント**:
    *   [Vercel](https://vercel.com/)

## セットアップとローカルでの実行方法

1.  **リポジトリをクローン**:
    ```bash
    git clone https://github.com/nishipippi/KigaIrs.git
    cd KigaIrs
    ```

2.  **依存関係をインストール**:
    プロジェクトルートで以下のコマンドを実行します。
    ```bash
    pnpm install
    ```

3.  **環境変数の設定**:
    `apps/web` ディレクトリに `.env.local` ファイルを作成し、以下の内容を記述してください。
    ```env
    # .env.local (apps/web/.env.local)

    # Google Gemini APIのAPIキー
    # https://ai.google.dev/ から取得してください
    GEMINI_API_KEY=あなたのGemini_APIキーをここに設定
    ```

4.  **開発サーバーを起動**:
    プロジェクトルートで以下のコマンドを実行します。
    ```bash
    pnpm dev
    ```
    これにより、Next.jsアプリケーション (`apps/web`) の開発サーバーが起動します。
    通常、`http://localhost:3000` でアクセスできます。

## 今後の展望 (アイデア)

*   いいねした論文のリスト表示・管理機能
*   論文のカテゴリ別フィルタリング
*   ユーザーアカウント機能と論文評価の永続化
*   オフラインでの論文閲覧機能（PWA化）
*   より高度な推薦アルゴリズムの導入
*   論文に関するディスカッション機能

## コントリビューション

バグ報告、機能提案、プルリクエストなど、あらゆるコントリビューションを歓迎します！
何かアイデアがあれば、お気軽にIssueを作成してください。

## ライセンス

このプロジェクトは [MIT License](LICENSE) の下で公開されています。

---

Kiga-ersで、新しい論文との出会いをお楽しみください！
