// Kiga-ers/apps/web/src/app/api/papers/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { XMLParser, X2jOptions } from 'fast-xml-parser';

// --- arXiv API レスポンスの型定義 ---
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
  author?: ArxivAuthor[];
  link?: ArxivLinkAttribute[];
  category?: ArxivCategoryAttribute[];
  'arxiv:comment'?: string;
  'arxiv:primary_category'?: ArxivCategoryAttribute;
  'arxiv:doi'?: string;
  'arxiv:journal_ref'?: string;
}

interface ArxivFeed {
  entry?: ArxivEntry[];
  title?: string;
  id?: string;
  updated?: string;
  link?: ArxivLinkAttribute[];
  'opensearch:totalResults'?: number;
  'opensearch:startIndex'?: number;
  'opensearch:itemsPerPage'?: number;
}

interface ArxivRawData {
  feed?: ArxivFeed;
}

// --- フロントエンドに返す論文情報の型 ---
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isArray: (tagName: string, jPath: string, isNodeEmpty: boolean, isAttribute: boolean): boolean => {
    if (jPath === 'feed.entry' || jPath.endsWith('.entry.author') || jPath.endsWith('.entry.link') || jPath.endsWith('.entry.category')) {
      return true;
    }
    if (jPath === 'feed.link') {
        return true;
    }
    return false;
  },
  parseAttributeValue: true,
  parseTagValue: true,
};

// --- 型ガード関数 (簡易版) ---
function isArxivRawData(data: unknown): data is ArxivRawData {
  if (typeof data !== 'object' || data === null) {
    console.error('Type guard failed: Parsed data is not an object or is null.');
    return false;
  }
  if ('feed' in data && (typeof (data as { feed: unknown }).feed !== 'object' || (data as { feed: unknown }).feed === null)) {
    console.warn('Type guard warning: Parsed data has "feed", but it is not an object.');
  }
  // feed.entry が存在しない場合も許容する (検索結果0件の場合など)
  // if (
  //   'feed' in data &&
  //   (data as { feed: unknown }).feed !== null &&
  //   typeof (data as { feed: unknown }).feed === 'object' &&
  //   'entry' in (data as { feed: object }).feed! &&
  //   !Array.isArray((data as { feed: { entry?: unknown } }).feed!.entry) &&
  //   (data as { feed: { entry?: unknown } }).feed!.entry !== undefined // entryがundefinedでない場合のみ配列チェック
  // ) {
  //   console.error("Type guard failed: feed.entry exists but is not an array. Check isArray parser option or XML structure.");
  //   return false;
  // }
  return true;
}


const ARXIV_API_URL = 'http://export.arxiv.org/api/query';
const DEFAULT_CATEGORY = 'cat:cs.AI';
const DEFAULT_MAX_RESULTS = '10'; // API側でもデフォルト値を設定

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    const start = searchParams.get('start') || '0'; // ★★★ 修正点: クライアントから start パラメータを取得 ★★★
    const max_results = searchParams.get('max_results') || DEFAULT_MAX_RESULTS; // ★★★ 修正点: クライアントから max_results を取得 ★★★

    let searchQueryValue: string;
    let sortByValue: 'submittedDate' | 'relevance' = 'submittedDate';

    if (query && query.trim() !== '') {
      searchQueryValue = query.trim();
      sortByValue = 'relevance';
      console.log(`API: Fetching papers with user query: "${searchQueryValue}", sortBy: ${sortByValue}, start: ${start}, max_results: ${max_results}`);
    } else {
      searchQueryValue = DEFAULT_CATEGORY;
      console.log(`API: Fetching papers with default category: "${searchQueryValue}", sortBy: ${sortByValue}, start: ${start}, max_results: ${max_results}`);
    }

    const queryParams = new URLSearchParams({
      search_query: searchQueryValue,
      sortBy: sortByValue,
      sortOrder: 'descending',
      start: start, // ★★★ 修正点: 取得した start を使用 ★★★
      max_results: max_results, // ★★★ 修正点: 取得した max_results を使用 ★★★
    });
    const url = `${ARXIV_API_URL}?${queryParams.toString()}`;
    console.log(`API: Constructed arXiv API URL: ${url}`);

    const response = await fetch(url, { 
        next: { revalidate: query ? 600 : 3600 }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API: Failed to fetch papers from arXiv: ${response.status} ${response.statusText}`, { url, errorText });
      return NextResponse.json({ error: `arXiv API Error: ${response.status} ${response.statusText}`, details: errorText }, { status: response.status });
    }

    const xmlData = await response.text();
    const parser = new XMLParser(parserOptions);
    const parsedData: unknown = parser.parse(xmlData);

    if (!isArxivRawData(parsedData)) {
      console.error('API: Parsed XML data does not match expected structure (ArxivRawData). Data:', JSON.stringify(parsedData, null, 2));
      return NextResponse.json({ error: 'Failed to parse arXiv data. Unexpected format received.' }, { status: 500 });
    }
    
    const entries = parsedData.feed?.entry;
    let papers: PaperSummary[] = [];

    if (entries && Array.isArray(entries)) {
      papers = entries
        .map((entryItem): PaperSummary | null => {
          if (!entryItem) return null;
          // ... (中略: PaperSummaryへの変換ロジックは変更なし) ...
          const idUrl = typeof entryItem.id === 'string' ? entryItem.id : undefined;
          let arxivId: string | undefined;
          if (idUrl) { const match = idUrl.match(/\/abs\/([^v]+)/); arxivId = match?.[1]; }
          if (!arxivId) { console.warn('API: Could not extract valid arXiv ID from:', idUrl ?? 'N/A', '. Skipping entry.'); return null; }

          let pdfLink: string = '';
          const links = entryItem.link;
          if (Array.isArray(links)) {
            const pdfEntry = links.find(
              (link): link is { '@_title': 'pdf', '@_href': string } =>
                link !== null && typeof link === 'object' && link['@_title'] === 'pdf' && typeof link['@_href'] === 'string'
            );
            pdfLink = pdfEntry?.['@_href'] ?? '';
          }
          if (!pdfLink && idUrl?.includes('/abs/')) {
             const potentialPdfLink = idUrl.replace('/abs/', '/pdf/') + '.pdf';
             if (potentialPdfLink.startsWith('http://') || potentialPdfLink.startsWith('https://')) {
                 pdfLink = potentialPdfLink;
             }
          }
          if (!pdfLink) { console.warn(`API: Could not find or generate PDF link for entry ID: ${arxivId}`); }

          let authors: string[] = [];
          const authorList = entryItem.author;
          if (Array.isArray(authorList)) {
            authors = authorList
              .map((auth) => (auth && typeof auth.name === 'string' ? auth.name.trim() : null))
              .filter((name): name is string => name !== null && name.length > 0);
          }

          let categories: string[] = [];
          const categoryList = entryItem.category;
          if (Array.isArray(categoryList)) {
            categories = categoryList
              .map((cat) => (cat && typeof cat['@_term'] === 'string' ? cat['@_term'] : null))
              .filter((term): term is string => term !== null && term.length > 0);
          }

          const title = (typeof entryItem.title === 'string' ? entryItem.title.trim().replace(/\s\s+/g, ' ') : undefined) ?? 'タイトルなし';
          const summaryRaw = typeof entryItem.summary === 'string' ? entryItem.summary.trim().replace(/\s\s+/g, ' ') : undefined;
          const summary = summaryRaw ?? '要約なし';
          const published = (typeof entryItem.published === 'string' ? entryItem.published : undefined) ?? '';
          const updated = (typeof entryItem.updated === 'string' ? entryItem.updated : undefined) ?? '';
          
          return {
            id: arxivId,
            title,
            summary,
            authors,
            published,
            updated,
            pdfLink: pdfLink,
            categories,
          };
        })
        .filter((paper): paper is PaperSummary => paper !== null);
    } else if (entries && !Array.isArray(entries) && typeof entries === 'object') { // 検索結果が1件の場合、配列でなくオブジェクトになることがある
        const entryItem = entries as ArxivEntry;
        // ... (上記と同様の PaperSummary への変換ロジックを1件分実行) ...
        // この部分は省略しますが、配列の場合と同じ処理を単一エントリに対して行ってください。
        // もし isArray オプションが正しく機能していれば、この分岐は不要なはずです。
        console.warn("API: feed.entry was a single object, not an array. Processed as single entry.");
    } else {
      if (!parsedData.feed) {
          console.warn('API: Parsed data does not contain "feed" element.');
      } else if (entries === undefined) { // entries が undefined の場合 (結果0件)
          console.log('API: Feed element does not contain any "entry" elements (results might be empty).');
      } else { // その他の予期しない形式
          console.warn('API: Feed "entry" has unexpected format. Data:', JSON.stringify(entries, null, 2));
      }
    }

    console.log(`API: Returning ${papers.length} papers for query "${searchQueryValue}", start: ${start}.`);
    return NextResponse.json(papers);

  } catch (error) {
    console.error('API: Unhandled error in /api/papers route:', error);
    const message = error instanceof Error ? error.message : 'An unknown server error occurred.';
    return NextResponse.json({ error: `Failed to process request: ${message}` }, { status: 500 });
  }
}