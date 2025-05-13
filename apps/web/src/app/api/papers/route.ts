// apps/web/src/app/api/papers/route.ts
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
  if (
    'feed' in data &&
    (data as { feed: unknown }).feed !== null &&
    typeof (data as { feed: unknown }).feed === 'object' &&
    'entry' in (data as { feed: object }).feed! &&
    !Array.isArray((data as { feed: { entry?: unknown } }).feed!.entry)
  ) {
    console.error("Type guard failed: feed.entry exists but is not an array. Check isArray parser option or XML structure.");
    return false;
  }
  return true;
}


const ARXIV_API_URL = 'http://export.arxiv.org/api/query';
const DEFAULT_CATEGORY = 'cat:cs.AI'; // デフォルトのカテゴリ (検索語がない場合)
const MAX_RESULTS = 10; // 検索結果の最大件数 (必要に応じて増やすことも検討)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query'); // URLクエリパラメータから 'query' を取得

    let searchQueryValue: string;
    let sortByValue: 'submittedDate' | 'relevance' = 'submittedDate'; // デフォルトは提出日順

    if (query && query.trim() !== '') {
      searchQueryValue = query.trim();
      sortByValue = 'relevance'; // 検索語がある場合は関連度順にする
      console.log(`Fetching papers with user query: "${searchQueryValue}", sortBy: ${sortByValue}`);
    } else {
      searchQueryValue = DEFAULT_CATEGORY;
      // sortByValue は 'submittedDate' のまま
      console.log(`Fetching papers with default category: "${searchQueryValue}", sortBy: ${sortByValue}`);
    }

    const queryParams = new URLSearchParams({
      search_query: searchQueryValue,
      sortBy: sortByValue,
      sortOrder: 'descending', // relevance の場合でも descending は有効 (関連度が高い順)
      start: '0', // TODO: 将来的にページネーションを実装する場合はここを変更
      max_results: MAX_RESULTS.toString(),
    });
    const url = `${ARXIV_API_URL}?${queryParams.toString()}`;
    console.log(`Constructed arXiv API URL: ${url}`);

    const response = await fetch(url, { 
        next: { revalidate: query ? 600 : 3600 } // 検索クエリがある場合はキャッシュ時間を短く(10分)、ない場合は長く(1時間)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch papers from arXiv: ${response.status} ${response.statusText}`, { url, errorText });
      return NextResponse.json({ error: `arXiv API Error: ${response.status} ${response.statusText}`, details: errorText }, { status: response.status });
    }

    const xmlData = await response.text();
    const parser = new XMLParser(parserOptions);
    const parsedData: unknown = parser.parse(xmlData);

    if (!isArxivRawData(parsedData)) {
      console.error('Parsed XML data does not match expected structure (ArxivRawData). Data:', JSON.stringify(parsedData, null, 2));
      return NextResponse.json({ error: 'Failed to parse arXiv data. Unexpected format received.' }, { status: 500 });
    }
    
    const entries = parsedData.feed?.entry;
    let papers: PaperSummary[] = [];

    if (entries && Array.isArray(entries)) {
      papers = entries
        .map((entryItem): PaperSummary | null => {
          if (!entryItem) return null;

          const idUrl = typeof entryItem.id === 'string' ? entryItem.id : undefined;
          let arxivId: string | undefined;
          if (idUrl) { const match = idUrl.match(/\/abs\/([^v]+)/); arxivId = match?.[1]; }
          if (!arxivId) { console.warn('Could not extract valid arXiv ID from:', idUrl ?? 'N/A', '. Skipping entry.'); return null; }

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
          if (!pdfLink) { console.warn(`Could not find or generate PDF link for entry ID: ${arxivId}`); }

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

          // if (title === 'タイトルなし') { // タイトルなしでも許容する場合
          //    console.warn(`Entry ID ${arxivId} has missing or invalid title.`);
          // }

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
    } else {
      if (!parsedData.feed) {
          console.warn('Parsed data does not contain "feed" element.');
      } else if (!entries) {
          console.warn('Feed element does not contain any "entry" elements. This might be normal if search results are empty.');
      } else {
          console.warn('Feed "entry" exists but is not an array. Data:', JSON.stringify(entries, null, 2));
      }
    }

    console.log(`Returning ${papers.length} papers for query "${searchQueryValue}".`);
    return NextResponse.json(papers);

  } catch (error) {
    console.error('Unhandled error in /api/papers route:', error);
    const message = error instanceof Error ? error.message : 'An unknown server error occurred.';
    return NextResponse.json({ error: `Failed to process request: ${message}` }, { status: 500 });
  }
}