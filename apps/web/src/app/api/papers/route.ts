// apps/web/src/app/api/papers/route.ts
import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';

// arXiv APIのエンドポイント
const ARXIV_API_URL = 'http://export.arxiv.org/api/query';

// 取得する論文のカテゴリ (例: Computer Science - Artificial Intelligence)
const DEFAULT_CATEGORY = 'cat:cs.AI';
// 取得する最大件数
const MAX_RESULTS = 10; // まずは少ない件数で試すことを推奨

// 返却する論文データの型 (フロントエンドと合わせる)
interface PaperSummary {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  updated: string;
  pdfLink: string;
  categories: string[];
}

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
      // isArray: (name) => ['entry', 'link', 'author', 'category'].includes(name), // 必要なら要素を常に配列に
    });
    // jsonData の型を Record<string, unknown> にする (any を避ける)
    const jsonData: Record<string, unknown> = parser.parse(xmlData);

    // パース結果の簡単なログ
    // console.log('Parsed JSON structure:', jsonData?.feed ? Object.keys(jsonData.feed) : 'No feed found');

    // 必要な情報を抽出して整形
    let papers: PaperSummary[] = []; // 配列の型を指定

    // jsonData.feed がオブジェクトであることを確認し、entry プロパティにアクセス
    if (typeof jsonData.feed === 'object' && jsonData.feed !== null && 'entry' in jsonData.feed) {
      const feed = jsonData.feed as { entry?: unknown }; // feed の型を絞り込む
      const entriesRaw = feed.entry; // entry は unknown 型

      // entryが単一の場合と配列の場合の両方に対応
      const entries = entriesRaw ? (Array.isArray(entriesRaw) ? entriesRaw : [entriesRaw]) : [];

      if (Array.isArray(entries)) {
        // map のコールバック引数 entry の型を unknown に変更
        papers = entries.map((entry: unknown): PaperSummary | null => { // Line 57: any -> unknown
          // entry がオブジェクトであることを確認
          if (typeof entry !== 'object' || entry === null) {
            console.warn('Invalid entry found (not an object):', entry);
            return null; // 不正なデータは null を返す
          }
          // entry の型を Record<string, unknown> にキャストしてプロパティにアクセスしやすくする
          const entryObj = entry as Record<string, unknown>;

          // arXiv IDを抽出 (プロパティアクセスを安全に行う)
          const idUrl = typeof entryObj.id === 'string' ? entryObj.id : '';
          let arxivId = '';
          if (idUrl.includes('/abs/')) {
            arxivId = idUrl.split('/abs/')[1] || '';
            if (arxivId) {
              arxivId = arxivId.split('v')[0]; // バージョン情報を除去
            }
          }
          if (!arxivId) {
            // IDが取得できないエントリーはスキップ
            console.warn('Could not extract valid arXiv ID from:', idUrl, 'Skipping entry.');
            return null;
          }

          // PDFリンクを取得 (プロパティアクセスを安全に行う)
          let pdfLink = '';
          const entryLinks = entryObj.link; // link は unknown 型
          if (Array.isArray(entryLinks)) {
            // find のコールバック引数 link の型を unknown に変更
            const pdfEntry = entryLinks.find((link: unknown): link is Record<string, unknown> => // Line 73: any -> unknown (implicit in find) & type guard added
              typeof link === 'object' && link !== null && (link as Record<string, unknown>)['@_title'] === 'pdf' && typeof (link as Record<string, unknown>)['@_href'] === 'string'
            );
            pdfLink = pdfEntry ? (pdfEntry['@_href'] as string) : ''; // 型アサーション
          } else if (typeof entryLinks === 'object' && entryLinks !== null) {
            const link = entryLinks as Record<string, unknown>;
            if (link['@_title'] === 'pdf' && typeof link['@_href'] === 'string') {
              pdfLink = link['@_href'];
            }
          }
          if (!pdfLink && idUrl.includes('/abs/')) {
            pdfLink = idUrl.replace('/abs/', '/pdf/') + '.pdf';
            // console.log(`Guessed PDF link for ${arxivId}: ${pdfLink}`)
          }

          // 著者情報を整形 (プロパティアクセスを安全に行う)
          let authors: string[] = [];
          const entryAuthors = entryObj.author; // author は unknown 型
          if (Array.isArray(entryAuthors)) {
            // map/filter のコールバック引数 auth の型を unknown に変更
            authors = entryAuthors
              .map((auth: unknown) => (typeof auth === 'object' && auth !== null && 'name' in auth && typeof (auth as {name: unknown}).name === 'string' ? (auth as {name: string}).name : null)) // Line 88: any -> unknown (implicit in map)
              .filter((name): name is string => name !== null && name.length > 0); // nullを除去し型ガード
          } else if (typeof entryAuthors === 'object' && entryAuthors !== null && 'name' in entryAuthors && typeof (entryAuthors as {name: unknown}).name === 'string') {
             authors = [(entryAuthors as {name: string}).name];
          }

          // カテゴリ情報を整形 (プロパティアクセスを安全に行う)
          let categories: string[] = [];
          const entryCategories = entryObj.category; // category は unknown 型
          if (Array.isArray(entryCategories)) {
             // map/filter のコールバック引数 cat の型を unknown に変更
            categories = entryCategories
              .map((cat: unknown) => (typeof cat === 'object' && cat !== null && '@_term' in cat && typeof (cat as {'@_term': unknown})['@_term'] === 'string' ? (cat as {'@_term': string})['@_term'] : null)) // Line 97: any -> unknown (implicit in map)
              .filter((term): term is string => term !== null && term.length > 0); // nullを除去し型ガード
          } else if (typeof entryCategories === 'object' && entryCategories !== null && '@_term' in entryCategories && typeof (entryCategories as {'@_term': unknown})['@_term'] === 'string') {
             categories = [(entryCategories as {'@_term': string})['@_term']];
          }

          // title, summary, published, updated も安全に取得
          const title = typeof entryObj.title === 'string' ? entryObj.title : 'タイトルなし';
          const summaryRaw = typeof entryObj.summary === 'string' ? entryObj.summary : '要約なし';
          const summary = summaryRaw.trim().replace(/\s+/g, ' ');
          const published = typeof entryObj.published === 'string' ? entryObj.published : '';
          const updated = typeof entryObj.updated === 'string' ? entryObj.updated : '';

          // PaperSummary 型のオブジェクトを返す
          return {
            id: arxivId, // 上で null チェック済み
            title: title,
            summary: summary,
            authors: authors,
            published: published,
            updated: updated,
            pdfLink: pdfLink,
            categories: categories,
          };
        // map の結果から null を除去し、型を PaperSummary[] に確定
        }).filter((paper): paper is PaperSummary => paper !== null);
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
