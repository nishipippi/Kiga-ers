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
  author?: ArxivAuthor | ArxivAuthor[]; // 単一または配列
  link?: ArxivLinkAttribute | ArxivLinkAttribute[]; // 単一または配列
  category?: ArxivCategoryAttribute | ArxivCategoryAttribute[]; // 単一または配列
  'arxiv:comment'?: string;
  'arxiv:primary_category'?: ArxivCategoryAttribute;
  'arxiv:doi'?: string;
  'arxiv:journal_ref'?: string;
}

interface ArxivFeed {
  entry?: ArxivEntry | ArxivEntry[]; // 単一または配列
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
  // isArray オプションは、タグ名に基づいて強制的に配列にするものです。
  // fast-xml-parser v4以降では、要素が1つしかない場合でも配列にするには `preserveOrder: true` と `isArray` の組み合わせや、
  // 後処理で配列化するのが一般的です。
  // ここでは、パース後の処理で配列でない場合に対応します。
  // ★★★ 修正点: 以下の行を削除 ★★★
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  // isArray: (tagName: string, jPath: string, isNodeEmpty: boolean, isAttribute: boolean): boolean => {
  //   if (jPath === 'feed.entry' || jPath.endsWith('.entry.author') || jPath.endsWith('.entry.link') || jPath.endsWith('.entry.category')) {
  //     return true;
  //   }
  //   if (jPath === 'feed.link') {
  //       return true;
  //   }
  //   return false;
  // },
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
};

// --- 型ガード関数 (簡易版) ---
function isArxivRawData(data: unknown): data is ArxivRawData {
  if (typeof data !== 'object' || data === null) {
    console.error('Type guard failed: Parsed data is not an object or is null.');
    return false;
  }
  return true;
}

const ARXIV_API_URL = 'http://export.arxiv.org/api/query';
const DEFAULT_CATEGORY = 'cat:cs.AI';
const DEFAULT_MAX_RESULTS = '10';

// ArxivEntryからPaperSummaryへの変換関数
function transformEntryToPaperSummary(entryItem: ArxivEntry): PaperSummary | null {
    if (!entryItem) return null;

    const idUrl = typeof entryItem.id === 'string' ? entryItem.id : undefined;
    let arxivId: string | undefined;
    if (idUrl) { const match = idUrl.match(/\/abs\/([^v]+)/); arxivId = match?.[1]; }
    if (!arxivId) { console.warn('API: Could not extract valid arXiv ID from:', idUrl ?? 'N/A', '. Skipping entry.'); return null; }

    let pdfLink: string = '';
    const entryLinks = Array.isArray(entryItem.link) ? entryItem.link : (entryItem.link ? [entryItem.link] : []);
    const pdfEntry = entryLinks.find(
        (link): link is { '@_title': 'pdf', '@_href': string } => // Type assertion for link
        link !== null && typeof link === 'object' && '@_title' in link && link['@_title'] === 'pdf' && typeof link['@_href'] === 'string'
    );
    pdfLink = pdfEntry?.['@_href'] ?? '';

    if (!pdfLink && idUrl?.includes('/abs/')) {
        const potentialPdfLink = idUrl.replace('/abs/', '/pdf/') + '.pdf';
        if (potentialPdfLink.startsWith('http://') || potentialPdfLink.startsWith('https://')) {
            pdfLink = potentialPdfLink;
        }
    }
    if (!pdfLink) { console.warn(`API: Could not find or generate PDF link for entry ID: ${arxivId}`); }

    let authors: string[] = [];
    const authorList = Array.isArray(entryItem.author) ? entryItem.author : (entryItem.author ? [entryItem.author] : []);
    authors = authorList
        .map((auth) => (auth && typeof auth.name === 'string' ? auth.name.trim() : null))
        .filter((name): name is string => name !== null && name.length > 0);

    let categories: string[] = [];
    const categoryList = Array.isArray(entryItem.category) ? entryItem.category : (entryItem.category ? [entryItem.category] : []);
    categories = categoryList
        .map((cat) => (cat && typeof cat['@_term'] === 'string' ? cat['@_term'] : null))
        .filter((term): term is string => term !== null && term.length > 0);

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
}


export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    const start = searchParams.get('start') || '0';
    const max_results = searchParams.get('max_results') || DEFAULT_MAX_RESULTS;

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
      start: start,
      max_results: max_results,
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

    if (!isArxivRawData(parsedData) || !parsedData.feed) { // feedの存在もチェック
      console.error('API: Parsed XML data does not match expected structure or feed is missing. Data:', JSON.stringify(parsedData, null, 2));
      return NextResponse.json({ error: 'Failed to parse arXiv data. Unexpected format received.' }, { status: 500 });
    }
    
    // feed.entry が単一オブジェクトの場合も配列として扱えるようにする
    const entriesRaw = parsedData.feed.entry;
    const entriesArray: ArxivEntry[] = Array.isArray(entriesRaw) ? entriesRaw : (entriesRaw ? [entriesRaw] : []);
    
    let papers: PaperSummary[] = [];

    if (entriesArray.length > 0) { // entriesArray が空でない場合のみ処理
        papers = entriesArray
            .map(transformEntryToPaperSummary) // ★★★ 修正点: 共通関数を使用 ★★★
            .filter((paper): paper is PaperSummary => paper !== null);
    } else {
        console.log('API: No entries found in feed.');
    }


    console.log(`API: Returning ${papers.length} papers for query "${searchQueryValue}", start: ${start}.`);
    return NextResponse.json(papers);

  } catch (error) {
    console.error('API: Unhandled error in /api/papers route:', error);
    const message = error instanceof Error ? error.message : 'An unknown server error occurred.';
    return NextResponse.json({ error: `Failed to process request: ${message}` }, { status: 500 });
  }
}