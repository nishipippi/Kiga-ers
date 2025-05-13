// apps/web/src/app/api/papers/route.ts
import { NextResponse } from 'next/server';
import { XMLParser, X2jOptions } from 'fast-xml-parser';

// --- arXiv API レスポンスの型定義 (より厳密に) ---
interface ArxivLinkAttribute {
  '@_href'?: string;
  '@_rel'?: string;
  '@_title'?: string; // 'pdf' など
  '@_type'?: string;  // 'application/pdf' など
}

interface ArxivAuthor {
  name?: string;
  'arxiv:affiliation'?: string;
}

interface ArxivCategoryAttribute {
  '@_term'?: string;   // 'cs.AI' など
  '@_scheme'?: string; // 'http://arxiv.org/schemas/atom' など
}

interface ArxivEntry {
  id?: string;
  updated?: string;
  published?: string;
  title?: string;
  summary?: string;
  author: ArxivAuthor[]; // isArray オプションにより常に配列
  link: ArxivLinkAttribute[]; // isArray オプションにより常に配列
  category: ArxivCategoryAttribute[]; // isArray オプションにより常に配列
  'arxiv:comment'?: string;
  'arxiv:primary_category'?: ArxivCategoryAttribute;
  'arxiv:doi'?: string;
  'arxiv:journal_ref'?: string;
}

interface ArxivFeed {
  entry: ArxivEntry[]; // isArray オプションにより、entryが1つでも配列になる
  title?: string; // <feed> タグ直下の title
  id?: string;    // <feed> タグ直下の id
  updated?: string; // <feed> タグ直下の updated
  link?: ArxivLinkAttribute[]; // <feed> タグ直下の link
  'opensearch:totalResults'?: number;
  'opensearch:startIndex'?: number;
  'opensearch:itemsPerPage'?: number;
}

interface ArxivParsedData {
  feed?: ArxivFeed; // feed が存在しない場合も考慮
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
  // XML構造上、単一でも配列になりうる要素を常に配列としてパースする
  isArray: (name: string, jpath: string, isLeafNode: boolean, isAttribute: boolean): boolean => {
    // entry, author, link, category は <feed> または <entry> の直下にある場合に配列化
    if (jpath === 'feed.entry' || jpath.endsWith('.entry.author') || jpath.endsWith('.entry.link') || jpath.endsWith('.entry.category')) {
      return true;
    }
    // <feed> 直下の link も配列として扱う場合
    if (jpath === 'feed.link') {
        return true;
    }
    return false;
  },
  parseAttributeValue: false,
  parseTagValue: false,
  // removeNSPrefix: true, // 名前空間プレフィックス (例: arxiv:) を削除する場合 (今回は保持)
};

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

    const response = await fetch(url, { next: { revalidate: 3600 } });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch papers from arXiv: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`arXiv API Error: ${response.status} ${response.statusText}`);
    }

    const xmlData = await response.text();
    const parser = new XMLParser(parserOptions);
    // パース結果に型アサーションを適用
    const jsonData = parser.parse(xmlData) as ArxivParsedData;

    let papers: PaperSummary[] = [];

    // jsonData.feed と jsonData.feed.entry の存在を確認
    // isArray オプションにより jsonData.feed.entry は常に配列のはず
    const entries = jsonData?.feed?.entry;

    if (entries && Array.isArray(entries)) {
      papers = entries.map((entryItem: ArxivEntry): PaperSummary | null => {
        // id の取得と検証 (string 型であることを期待)
        const idUrl = typeof entryItem.id === 'string' ? entryItem.id : '';
        let arxivId = '';
        if (idUrl.includes('/abs/')) {
          arxivId = idUrl.split('/abs/')[1]?.split('v')[0] || ''; // Optional chaining で安全に
        }
        if (!arxivId) {
          console.warn('Could not extract valid arXiv ID from:', idUrl, '. Skipping entry.');
          return null; // IDがなければこのエントリーはスキップ
        }

        // PDFリンクの取得 (entryItem.link は ArxivLinkAttribute[] 型)
        let pdfLink = '';
        // isArray オプションにより entryItem.link は常に配列
        const pdfEntry = entryItem.link.find(
          (link: ArxivLinkAttribute) => link['@_title'] === 'pdf' && typeof link['@_href'] === 'string'
        );
        pdfLink = pdfEntry?.['@_href'] || ''; // Optional chaining
        if (!pdfLink && idUrl.includes('/abs/')) {
          pdfLink = idUrl.replace('/abs/', '/pdf/') + '.pdf';
        }

        // 著者の取得 (entryItem.author は ArxivAuthor[] 型)
        const authors = entryItem.author
          .map((auth: ArxivAuthor) => (typeof auth.name === 'string' ? auth.name : null))
          .filter((name): name is string => name !== null && name.length > 0);

        // カテゴリの取得 (entryItem.category は ArxivCategoryAttribute[] 型)
        const categories = entryItem.category
          .map((cat: ArxivCategoryAttribute) => (typeof cat['@_term'] === 'string' ? cat['@_term'] : null))
          .filter((term): term is string => term !== null && term.length > 0);

        // 各プロパティの型安全な取得
        const title = typeof entryItem.title === 'string' ? entryItem.title : 'タイトルなし';
        const summaryRaw = typeof entryItem.summary === 'string' ? entryItem.summary : '要約なし';
        const summary = summaryRaw.trim().replace(/\s+/g, ' ');
        const published = typeof entryItem.published === 'string' ? entryItem.published : '';
        const updated = typeof entryItem.updated === 'string' ? entryItem.updated : '';

        return {
          id: arxivId,
          title,
          summary,
          authors,
          published,
          updated,
          pdfLink,
          categories,
        };
      }).filter((paper): paper is PaperSummary => paper !== null); // null を除去し型を確定
    } else {
      console.warn('No entries found in arXiv feed, or feed.entry is not an array.');
      if (jsonData?.feed?.entry) { // entry が配列でない場合の詳細ログ (デバッグ用)
        console.warn('feed.entry was not an array:', JSON.stringify(jsonData.feed.entry, null, 2));
      }
    }

    return NextResponse.json(papers);
  } catch (error) {
    console.error('Error in /api/papers:', error);
    const message = error instanceof Error ? error.message : '不明なサーバーエラーが発生しました。';
    return NextResponse.json({ error: `論文の取得またはパースに失敗しました: ${message}` }, { status: 500 });
  }
}
