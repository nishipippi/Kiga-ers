// apps/web/src/app/api/papers/route.ts
import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';

// arXiv APIのエンドポイント
const ARXIV_API_URL = 'http://export.arxiv.org/api/query';

// 取得する論文のカテゴリ (例: Computer Science - Artificial Intelligence)
const DEFAULT_CATEGORY = 'cat:cs.AI';
// 取得する最大件数
const MAX_RESULTS = 10; // まずは少ない件数で試すことを推奨

export async function GET() {
  try {
    // arXiv APIへのリクエストURLを構築
    const queryParams = new URLSearchParams({
      search_query: DEFAULT_CATEGORY,
      sortBy: 'submittedDate', // 投稿日でソート
      sortOrder: 'descending', // 新しい順
      start: '0',
      max_results: MAX_RESULTS.toString(),
    });
    const url = `${ARXIV_API_URL}?${queryParams.toString()}`;

    // console.log(`Fetching papers from: ${url}`); // デバッグ用に変更
    console.log(`Fetching papers from: ${url}`); // サーバー側のログ

    // arXiv APIを呼び出す
    const response = await fetch(url, { next: { revalidate: 3600 } }); // 1時間キャッシュを試す

    if (!response.ok) {
       const errorText = await response.text(); // エラー内容を取得
      console.error(`Failed to fetch papers from arXiv: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`arXiv API Error: ${response.status} ${response.statusText}`);
    }

    // XMLレスポンスを取得
    const xmlData = await response.text();

    // XMLをJSONにパース
    const parser = new XMLParser({
      ignoreAttributes: false, // 属性もパースする
      attributeNamePrefix: '@_', // 属性名のプレフィックス
      // XMLの構造によっては、特定の要素を常に配列としてパースする設定が有効な場合がある
      // isArray: (name, jpath, isLeafNode, isAttribute) => {
      //   if (['entry', 'link', 'author', 'category'].includes(name)) return true;
      //   return false;
      // }
    });
    // jsonData の型を unknown または Record<string, unknown> にする
    const jsonData: Record<string, unknown> = parser.parse(xmlData);

    // パース結果の簡単なログ
    // console.log('Parsed JSON structure:', jsonData?.feed ? Object.keys(jsonData.feed) : 'No feed found');

    // 必要な情報を抽出して整形
    let papers: Array<{ // 返却するオブジェクトの型をインラインで定義
      id: string;
      title: string;
      summary: string;
      authors: string[];
      published: string;
      updated: string;
      pdfLink: string;
      categories: string[];
    }> = []; // 配列の型を指定

    // jsonData.feed がオブジェクトであることを確認し、entry プロパティにアクセス
    // 型ガードを使って安全にアクセス
    if (typeof jsonData.feed === 'object' && jsonData.feed !== null && 'entry' in jsonData.feed) {
      const feed = jsonData.feed as { entry?: unknown }; // feed の型を絞り込む
      const entriesRaw = feed.entry; // entry は unknown 型

      // entryが単一の場合と配列の場合の両方に対応
      // entriesRaw が undefined でないことを確認
      const entries = entriesRaw ? (Array.isArray(entriesRaw) ? entriesRaw : [entriesRaw]) : [];

      // map の前に entries が配列であることを確認 (より安全に)
      if (Array.isArray(entries)) {
        // map のコールバック引数 entry の型を Record<string, unknown> に変更 (any を避ける)
        papers = entries.map((entry: Record<string, unknown>) => {
          // entry がオブジェクトであることを念のため確認
          if (typeof entry !== 'object' || entry === null) {
            console.warn('Invalid entry found:', entry);
            return null; // 不正なデータは null を返す
          }

          // arXiv IDを抽出 (プロパティアクセスを安全に行う)
          const idUrl = typeof entry.id === 'string' ? entry.id : '';
          let arxivId = '';
          if (idUrl.includes('/abs/')) {
            arxivId = idUrl.split('/abs/')[1] || '';
            if (arxivId) {
              arxivId = arxivId.split('v')[0]; // バージョン情報を除去
            }
          }
          // IDが取得できない場合の処理
          if (!arxivId) {
            arxivId = `unknown-${Math.random()}`;
            console.warn('Could not extract arXiv ID from:', idUrl);
          }

          // PDFリンクを取得 (プロパティアクセスを安全に行う)
          let pdfLink = '';
          const entryLinks = entry.link; // link は unknown 型
          if (Array.isArray(entryLinks)) {
            // find のコールバック引数 link の型を Record<string, unknown> に変更
            const pdfEntry = entryLinks.find((link: Record<string, unknown>) =>
              typeof link === 'object' && link !== null && link['@_title'] === 'pdf' && typeof link['@_href'] === 'string'
            );
            pdfLink = typeof pdfEntry?.['@_href'] === 'string' ? pdfEntry['@_href'] : ''; // Optional Chainingと型チェック
          } else if (typeof entryLinks === 'object' && entryLinks !== null) {
             // link が単一オブジェクトの場合 (型を Record<string, unknown> として扱う)
            const link = entryLinks as Record<string, unknown>;
            if (link['@_title'] === 'pdf' && typeof link['@_href'] === 'string') {
              pdfLink = link['@_href'];
            }
          }
          // PDFリンクがない場合の推測
          if (!pdfLink && idUrl.includes('/abs/')) {
            pdfLink = idUrl.replace('/abs/', '/pdf/') + '.pdf';
            // console.log(`Guessed PDF link for ${arxivId}: ${pdfLink}`); // 必要ならログ出力
          }

          // 著者情報を整形 (プロパティアクセスを安全に行う)
          let authors: string[] = [];
          const entryAuthors = entry.author; // author は unknown 型
          if (Array.isArray(entryAuthors)) {
             // map/filter のコールバック引数 auth, name の型を unknown に変更し、型ガードで絞り込む
            authors = entryAuthors
              .map((auth: unknown) => (typeof auth === 'object' && auth !== null && 'name' in auth && typeof (auth as {name: unknown}).name === 'string' ? (auth as {name: string}).name : null))
              .filter((name): name is string => typeof name === 'string' && name.length > 0); // 型ガードで string[] に
          } else if (typeof entryAuthors === 'object' && entryAuthors !== null && 'name' in entryAuthors && typeof (entryAuthors as {name: unknown}).name === 'string') {
            // author が単一オブジェクトの場合
             authors = [(entryAuthors as {name: string}).name];
          }

          // カテゴリ情報を整形 (プロパティアクセスを安全に行う)
          let categories: string[] = [];
          const entryCategories = entry.category; // category は unknown 型
          if (Array.isArray(entryCategories)) {
             // map/filter のコールバック引数 cat, term の型を unknown に変更し、型ガードで絞り込む
            categories = entryCategories
              .map((cat: unknown) => (typeof cat === 'object' && cat !== null && '@_term' in cat && typeof (cat as {'@_term': unknown})['@_term'] === 'string' ? (cat as {'@_term': string})['@_term'] : null))
              .filter((term): term is string => typeof term === 'string' && term.length > 0); // 型ガードで string[] に
          } else if (typeof entryCategories === 'object' && entryCategories !== null && '@_term' in entryCategories && typeof (entryCategories as {'@_term': unknown})['@_term'] === 'string') {
             // category が単一オブジェクトの場合
             categories = [(entryCategories as {'@_term': string})['@_term']];
          }

          // title と summary も型チェックを追加
          const title = typeof entry.title === 'string' ? entry.title : 'タイトルなし';
          const summaryRaw = typeof entry.summary === 'string' ? entry.summary : '要約なし';
          const summary = summaryRaw.trim().replace(/\s+/g, ' ');
          const published = typeof entry.published === 'string' ? entry.published : '';
          const updated = typeof entry.updated === 'string' ? entry.updated : '';


          return {
            id: arxivId,
            title: title,
            summary: summary,
            authors: authors,
            published: published,
            updated: updated,
            pdfLink: pdfLink,
            categories: categories,
          };
          // map の結果から null を除去
        }).filter(paper => paper !== null) as Array<{ /* 上記と同じ型定義 */ id: string; title: string; summary: string; authors: string[]; published: string; updated: string; pdfLink: string; categories: string[]; }>;

      } else {
         console.warn('jsonData.feed.entry is not an array or undefined.');
      }

    } else {
       console.warn('No feed or entry found in arXiv response.');
       // console.log('Full arXiv Response JSON:', JSON.stringify(jsonData, null, 2)); // 詳細デバッグ用
    }

    // JSONレスポンスを返す
    return NextResponse.json(papers);

  } catch (error) {
    console.error('Error in /api/papers:', error);
    // エラーレスポンスを返す
    const message = error instanceof Error ? error.message : '不明なサーバーエラーが発生しました。';
    return NextResponse.json({ error: `論文の取得またはパースに失敗しました: ${message}` }, { status: 500 });
  }
}
