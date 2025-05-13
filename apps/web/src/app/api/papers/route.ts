// apps/web/src/app/api/papers/route.ts
import { NextResponse } from 'next/server';
import { XMLParser, X2jOptions } from 'fast-xml-parser'; // X2jOptions をインポート

// --- arXiv API レスポンスの型定義 ---
interface ArxivLinkAttribute {
  '@_href'?: string;
  '@_rel'?: string;
  '@_title'?: string;
  '@_type'?: string;
}

interface ArxivAuthor {
  name?: string;
  'arxiv:affiliation'?: string; // affiliation は arxiv 名前空間
}

interface ArxivCategoryAttribute {
  '@_term'?: string;
  '@_scheme'?: string;
}

interface ArxivEntry {
  id?: string; // 例: "http://arxiv.org/abs/2310.12345v1"
  updated?: string; // Date string
  published?: string; // Date string
  title?: string;
  summary?: string; // Abstract
  author?: ArxivAuthor | ArxivAuthor[]; // 単一または配列
  link?: ArxivLinkAttribute | ArxivLinkAttribute[]; // 単一または配列
  category?: ArxivCategoryAttribute | ArxivCategoryAttribute[]; // 単一または配列
  'arxiv:comment'?: string;
  'arxiv:primary_category'?: ArxivCategoryAttribute;
  'arxiv:doi'?: string;
  'arxiv:journal_ref'?: string;
}

interface ArxivFeed {
  entry?: ArxivEntry | ArxivEntry[];
  // 必要に応じて feed レベルの他の要素も定義
  // title?: string;
  // id?: string;
  // link?: ArxivLinkAttribute | ArxivLinkAttribute[];
  // updated?: string;
  // 'opensearch:totalResults'?: number;
  // 'opensearch:startIndex'?: number;
  // 'opensearch:itemsPerPage'?: number;
}

interface ArxivParsedData {
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
  // XML構造上、単一でも配列になりうる要素を指定
  // これにより、後続の処理で Array.isArray での分岐が不要になることが多い
  isArray: (name: string, jpath: string, isLeafNode: boolean, isAttribute: boolean): boolean => {
    if (['author', 'link', 'category'].includes(name)) {
      return true;
    }
    return false;
  },
  // 値の型変換は行わない (文字列として取得し、必要に応じて後で変換)
  parseAttributeValue: false,
  parseTagValue: false, // parseNodeValue から parseTagValue に変更 (v4+)
  // XML 名前空間を扱う場合 (今回は arxiv:affiliation などがあるため考慮)
  // processNSPrefix: true, // 必要に応じて
  // removeNSPrefix: false, // 名前空間プレフィックスを保持する場合
};


// arXiv APIのエンドポイント
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
    const jsonData = parser.parse(xmlData) as ArxivParsedData; // 型アサーション

    let papers: PaperSummary[] = [];

    const entries = jsonData.feed?.entry;

    if (entries && Array.isArray(entries)) { // isArray オプションにより、entries は常に配列か undefined
      papers = entries.map((entryItem: ArxivEntry): PaperSummary | null => {
        const idUrl = typeof entryItem.id === 'string' ? entryItem.id : '';
        let arxivId = '';
        if (idUrl.includes('/abs/')) {
          arxivId = idUrl.split('/abs/')[1] || '';
          if (arxivId) {
            arxivId = arxivId.split('v')[0];
          }
        }
        if (!arxivId) {
          console.warn('Could not extract valid arXiv ID from:', idUrl, '. Skipping entry.');
          return null;
        }

        let pdfLink = '';
        // entryItem.link は isArray オプションにより常に配列のはず
        if (entryItem.link && Array.isArray(entryItem.link)) {
          const pdfEntry = entryItem.link.find(
            (link: ArxivLinkAttribute) => link['@_title'] === 'pdf' && typeof link['@_href'] === 'string'
          );
          pdfLink = pdfEntry?.['@_href'] || '';
        }
        if (!pdfLink && idUrl.includes('/abs/')) {
          pdfLink = idUrl.replace('/abs/', '/pdf/') + '.pdf';
        }

        let authors: string[] = [];
        // entryItem.author は isArray オプションにより常に配列のはず
        if (entryItem.author && Array.isArray(entryItem.author)) {
          authors = entryItem.author
            .map((auth: ArxivAuthor) => (typeof auth.name === 'string' ? auth.name : null))
            .filter((name): name is string => name !== null && name.length > 0);
        }

        let categories: string[] = [];
        // entryItem.category は isArray オプションにより常に配列のはず
        if (entryItem.category && Array.isArray(entryItem.category)) {
          categories = entryItem.category
            .map((cat: ArxivCategoryAttribute) => (typeof cat['@_term'] === 'string' ? cat['@_term'] : null))
            .filter((term): term is string => term !== null && term.length > 0);
        }

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
      }).filter((paper): paper is PaperSummary => paper !== null);
    } else if (entries) { // entries が単一オブジェクトの場合 (isArray オプションが効いていない場合のためのフォールバック)
        const entryItem = entries as ArxivEntry;
        // ... (単一オブジェクトの場合の処理 - isArray オプションが正しく設定されていれば通常ここには来ない)
        // 上記の map 内のロジックを単一 entryItem に対して適用する
        console.warn('Feed entry was a single object, expected array due to parser options.');
         // ここに単一エントリーを処理するロジックを記述（上記 map の中身と同様）
         // ただし、isArrayオプションが正しく機能していれば、この分岐は不要になるはず
    } else {
      console.warn('No entries found in arXiv feed.');
    }

    return NextResponse.json(papers);
  } catch (error) {
    console.error('Error in /api/papers:', error);
    const message = error instanceof Error ? error.message : '不明なサーバーエラーが発生しました。';
    return NextResponse.json({ error: `論文の取得またはパースに失敗しました: ${message}` }, { status: 500 });
  }
}
