// apps/web/src/app/api/papers/route.ts
import { NextResponse } from 'next/server';
import { XMLParser, X2jOptions } from 'fast-xml-parser';

// --- arXiv API レスポンスの型定義 ---
// (基本的な構造は前回と同じですが、配列がundefinedになる可能性も考慮)
interface ArxivLinkAttribute {
  '@_href'?: string;
  '@_rel'?: string;
  '@_title'?: string;
  '@_type'?: string;
}

interface ArxivAuthor {
  name?: string;
  'arxiv:affiliation'?: string;
}

interface ArxivCategoryAttribute {
  '@_term'?: string;
  '@_scheme'?: string;
}

interface ArxivEntry {
  id?: string;
  updated?: string;
  published?: string;
  title?: string;
  summary?: string;
  // isArray オプションにより配列が期待されるが、存在しない/空の場合も考慮
  author?: ArxivAuthor[];
  link?: ArxivLinkAttribute[];
  category?: ArxivCategoryAttribute[];
  'arxiv:comment'?: string;
  'arxiv:primary_category'?: ArxivCategoryAttribute;
  'arxiv:doi'?: string;
  'arxiv:journal_ref'?: string;
}

interface ArxivFeed {
  entry?: ArxivEntry[]; // isArray オプションにより配列が期待される
  title?: string;
  id?: string;
  updated?: string;
  link?: ArxivLinkAttribute[]; // isArray オプションにより配列が期待される
  'opensearch:totalResults'?: number;
  'opensearch:startIndex'?: number;
  'opensearch:itemsPerPage'?: number;
}

// パース結果のルートオブジェクトの型
interface ArxivRawData {
  feed?: ArxivFeed;
}

// --- フロントエンドに返す論文情報の型 ---
// (前回と同じ)
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

// --- fast-xml-parser の設定 ---
const parserOptions: Partial<X2jOptions> = {
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    // isArray: (name, jpath, isLeafNode, isAttribute) => { // fast-xml-parser v3 以前のシグネチャ
    // fast-xml-parser v4 のシグネチャに合わせる (必要に応じてドキュメント確認)
    // ↓↓↓ 修正箇所 ↓↓↓
    isArray: (tagName: string, jPath: string, _isNodeEmpty: boolean, _isAttribute: boolean): boolean => {
      // entry, author, link, category は配列として扱うことを保証する
      // 注意: jPath の完全な正確性は XML 構造に依存するため、テストが必要
      if (jPath === 'feed.entry' || jPath.endsWith('.entry.author') || jPath.endsWith('.entry.link') || jPath.endsWith('.entry.category')) {
        return true;
      }
      // <feed> 直下の link も配列として扱う
      if (jPath === 'feed.link') {
          return true;
      }
      return false; // デフォルトは false
    },
    // ↑↑↑ 修正箇所 ↑↑↑
    parseAttributeValue: true,
    parseTagValue: true,
  };

// --- 型ガード関数 (簡易版) ---
// ArxivRawData型かどうかの最低限のチェック
function isArxivRawData(data: unknown): data is ArxivRawData {
  if (typeof data !== 'object' || data === null) {
    console.error('Type guard failed: Parsed data is not an object or is null.');
    return false;
  }
  // feed が存在する場合、オブジェクトであることを期待
  if ('feed' in data && (typeof (data as { feed: unknown }).feed !== 'object' || (data as { feed: unknown }).feed === null)) {
    console.warn('Type guard warning: Parsed data has "feed", but it is not an object.');
    // feed が必須ではない場合、これだけでは false にしないこともできる
  }
  // feed.entry が存在する場合、配列であることを期待 (isArray オプションが効く前提)
  if (
    'feed' in data &&
    (data as { feed: unknown }).feed !== null &&
    typeof (data as { feed: unknown }).feed === 'object' &&
    'entry' in (data as { feed: object }).feed! &&
    !Array.isArray((data as { feed: { entry?: unknown } }).feed!.entry)
  ) {
    // isArray オプションが期待通りに動いていれば、ここには基本的に来ないはず
    console.error("Type guard failed: feed.entry exists but is not an array. Check isArray parser option or XML structure.");
    return false; // entry が存在するなら配列でないと構造がおかしいと判断
  }
  return true; // 最低限のチェックをパス
}


const ARXIV_API_URL = 'http://export.arxiv.org/api/query';
const DEFAULT_CATEGORY = 'cat:cs.AI';
const MAX_RESULTS = 10;

export async function GET() {
  try {
    const queryParams = new URLSearchParams({
      search_query: DEFAULT_CATEGORY,
      sortBy: 'submittedDate',
      sortOrder: 'descending',
      start: '0',
      max_results: MAX_RESULTS.toString(),
    });
    const url = `${ARXIV_API_URL}?${queryParams.toString()}`;
    console.log(`Fetching papers from: ${url}`);

    const response = await fetch(url, { next: { revalidate: 3600 } }); // ISR: 1時間キャッシュ

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch papers from arXiv: ${response.status} ${response.statusText}`, errorText);
      // エラーレスポンスをJSON形式で返す
      return NextResponse.json({ error: `arXiv API Error: ${response.status} ${response.statusText}`, details: errorText }, { status: response.status });
    }

    const xmlData = await response.text();
    const parser = new XMLParser(parserOptions);

    // パース結果を unknown で受け取る
    const parsedData: unknown = parser.parse(xmlData);

    // 型ガードで ArxivRawData 型であることを確認
    if (!isArxivRawData(parsedData)) {
      console.error('Parsed XML data does not match expected structure (ArxivRawData). Data:', JSON.stringify(parsedData, null, 2));
      // ユーザーフレンドリーなエラーを返す
      return NextResponse.json({ error: 'Failed to parse arXiv data. Unexpected format received.' }, { status: 500 });
    }

    // 型ガードが成功したので、parsedData を ArxivRawData として扱える
    const entries = parsedData.feed?.entry; // オプショナルチェイニングで安全にアクセス
    let papers: PaperSummary[] = [];

    // entries が配列であることを明示的に確認
    if (entries && Array.isArray(entries)) {
      papers = entries
        .map((entryItem): PaperSummary | null => { // entryItem の型は ArxivEntry | undefined になる可能性がある
          if (!entryItem) return null; // 配列内に null や undefined が含まれる可能性も考慮 (通常はないはず)

          // --- IDの取得と検証 ---
          const idUrl = typeof entryItem.id === 'string' ? entryItem.id : undefined;
          let arxivId: string | undefined;
          if (idUrl) {
            const match = idUrl.match(/\/abs\/([^v]+)/); // vX (バージョン) の前までをIDとする
            arxivId = match?.[1];
          }
          if (!arxivId) {
            console.warn('Could not extract valid arXiv ID from:', idUrl ?? 'N/A', '. Skipping entry.');
            return null;
          }

          // --- PDFリンクの取得 ---
          let pdfLink: string = ''; // デフォルトは空文字列
          const links = entryItem.link; // ArxivLinkAttribute[] | undefined
          if (Array.isArray(links)) {
            const pdfEntry = links.find(
              // より安全な型ガードをfindのコールバックに適用
              (link): link is { '@_title': 'pdf', '@_href': string } => // hrefがstringであることも保証
                link !== null && // link オブジェクト自体の存在
                typeof link === 'object' && // オブジェクトであること
                link['@_title'] === 'pdf' &&
                typeof link['@_href'] === 'string'
            );
            pdfLink = pdfEntry?.['@_href'] ?? ''; // Null合体演算子でデフォルト値
          }
          // フォールバック: IDからPDFリンクを生成
          if (!pdfLink && idUrl?.includes('/abs/')) {
             const potentialPdfLink = idUrl.replace('/abs/', '/pdf/') + '.pdf';
             // 簡単なURL形式チェック
             if (potentialPdfLink.startsWith('http://') || potentialPdfLink.startsWith('https://')) {
                 pdfLink = potentialPdfLink;
             }
          }
          if (!pdfLink) { // 最終的にPDFリンクが見つからなかった場合
             console.warn(`Could not find or generate PDF link for entry ID: ${arxivId}`);
             // pdfLink は空文字列のまま
          }

          // --- 著者の取得 ---
          let authors: string[] = [];
          const authorList = entryItem.author; // ArxivAuthor[] | undefined
          if (Array.isArray(authorList)) {
            authors = authorList
              .map((auth) => (auth && typeof auth.name === 'string' ? auth.name.trim() : null)) // trimも追加
              .filter((name): name is string => name !== null && name.length > 0); // null と空文字列を除去
          }

          // --- カテゴリの取得 ---
          let categories: string[] = [];
          const categoryList = entryItem.category; // ArxivCategoryAttribute[] | undefined
          if (Array.isArray(categoryList)) {
            categories = categoryList
              .map((cat) => (cat && typeof cat['@_term'] === 'string' ? cat['@_term'] : null))
              .filter((term): term is string => term !== null && term.length > 0); // null と空文字列を除去
          }

          // --- その他のプロパティの取得 ---
          const title = (typeof entryItem.title === 'string' ? entryItem.title.trim() : undefined) ?? 'タイトルなし';
          const summaryRaw = typeof entryItem.summary === 'string' ? entryItem.summary.trim().replace(/\s+/g, ' ') : undefined;
          const summary = summaryRaw ?? '要約なし';
          const published = (typeof entryItem.published === 'string' ? entryItem.published : undefined) ?? '';
          const updated = (typeof entryItem.updated === 'string' ? entryItem.updated : undefined) ?? '';

          // 必須プロパティが空でないかのチェック (例: title)
          if (title === 'タイトルなし') {
             console.warn(`Entry ID ${arxivId} has missing or invalid title. Skipping.`);
             // return null; // タイトルがないものは除外する場合
          }

          return {
            id: arxivId, // ここに来る時点で arxivId は string
            title,
            summary,
            authors,
            published,
            updated,
            pdfLink: pdfLink, // pdfLink は string (空文字列の可能性あり)
            categories,
          };
        })
        .filter((paper): paper is PaperSummary => paper !== null); // null を除去し、型を PaperSummary[] に確定
    } else {
      // entries が存在しないか、配列でない場合のログ
      if (!parsedData.feed) {
          console.warn('Parsed data does not contain "feed" element.');
      } else if (!entries) {
          console.warn('Feed element does not contain any "entry" elements.');
      } else {
          // このケースは isArray オプションと型ガードにより、基本的には発生しないはず
          console.warn('Feed "entry" exists but is not an array. Data:', JSON.stringify(entries, null, 2));
      }
    }

    return NextResponse.json(papers);

  } catch (error) {
    console.error('Unhandled error in /api/papers route:', error);
    const message = error instanceof Error ? error.message : 'An unknown server error occurred.';
    // status コードを必ず設定する
    return NextResponse.json({ error: `Failed to process request: ${message}` }, { status: 500 });
  }
}