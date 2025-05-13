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

// XMLパース後の entry オブジェクトの期待される構造の一部を定義
// (より厳密にする場合は、すべてのプロパティを定義)
interface ArxivEntryItem {
  id?: unknown;
  title?: unknown;
  summary?: unknown;
  published?: unknown;
  updated?: unknown;
  link?: unknown; // 単一または配列の可能性
  author?: unknown; // 単一または配列の可能性
  category?: unknown; // 単一または配列の可能性
}


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
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      // isArray: (name) => ['entry', 'link', 'author', 'category'].includes(name), // 常に配列として扱いたい場合
    });
    const jsonData: Record<string, unknown> = parser.parse(xmlData);

    let papers: PaperSummary[] = [];

    if (typeof jsonData.feed === 'object' && jsonData.feed !== null && 'entry' in jsonData.feed) {
      const feed = jsonData.feed as { entry?: unknown };
      const entriesRaw = feed.entry;
      const entriesArray = entriesRaw ? (Array.isArray(entriesRaw) ? entriesRaw : [entriesRaw]) : [];

      if (Array.isArray(entriesArray)) {
        papers = entriesArray.map((entryInput: unknown): PaperSummary | null => { // Line 57: any -> unknown
          if (typeof entryInput !== 'object' || entryInput === null) {
            console.warn('Invalid entry found (not an object):', entryInput);
            return null;
          }
          const entry = entryInput as ArxivEntryItem; // ArxivEntryItem 型として扱う

          const idUrl = typeof entry.id === 'string' ? entry.id : '';
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
          const linksRaw = entry.link;
          const linksArray = linksRaw ? (Array.isArray(linksRaw) ? linksRaw : [linksRaw]) : [];
          if (Array.isArray(linksArray)) {
            const pdfEntry = linksArray.find((linkItem: unknown): linkItem is Record<string, unknown> => // Line 73: any -> unknown, and type guard
              typeof linkItem === 'object' && linkItem !== null &&
              (linkItem as Record<string, unknown>)['@_title'] === 'pdf' &&
              typeof (linkItem as Record<string, unknown>)['@_href'] === 'string'
            );
            pdfLink = pdfEntry ? (pdfEntry['@_href'] as string) : '';
          }
          if (!pdfLink && idUrl.includes('/abs/')) {
            pdfLink = idUrl.replace('/abs/', '/pdf/') + '.pdf';
          }

          let authors: string[] = [];
          const authorsRaw = entry.author;
          const authorsArray = authorsRaw ? (Array.isArray(authorsRaw) ? authorsRaw : [authorsRaw]) : [];
          if (Array.isArray(authorsArray)) {
            authors = authorsArray
              .map((authItem: unknown) => { // Line 88: any -> unknown
                if (typeof authItem === 'object' && authItem !== null && 'name' in authItem && typeof (authItem as { name?: unknown }).name === 'string') {
                  return (authItem as { name: string }).name;
                }
                return null;
              })
              .filter((name): name is string => name !== null && name.length > 0);
          }

          let categories: string[] = [];
          const categoriesRaw = entry.category;
          const categoriesArray = categoriesRaw ? (Array.isArray(categoriesRaw) ? categoriesRaw : [categoriesRaw]) : [];
          if (Array.isArray(categoriesArray)) {
            categories = categoriesArray
              .map((catItem: unknown) => { // Line 97: any -> unknown
                if (typeof catItem === 'object' && catItem !== null && '@_term' in catItem && typeof (catItem as { '@_term'?: unknown })['@_term'] === 'string') {
                  return (catItem as { '@_term': string })['@_term'];
                }
                return null;
              })
              .filter((term): term is string => term !== null && term.length > 0);
          }

          const title = typeof entry.title === 'string' ? entry.title : 'タイトルなし';
          const summaryRaw = typeof entry.summary === 'string' ? entry.summary : '要約なし';
          const summary = summaryRaw.trim().replace(/\s+/g, ' ');
          const published = typeof entry.published === 'string' ? entry.published : '';
          const updated = typeof entry.updated === 'string' ? entry.updated : '';

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
      } else {
        console.warn('jsonData.feed.entry is not an array or is undefined.');
      }
    } else {
      console.warn('No feed or entry found in arXiv response.');
    }

    return NextResponse.json(papers);
  } catch (error) {
    console.error('Error in /api/papers:', error);
    const message = error instanceof Error ? error.message : '不明なサーバーエラーが発生しました。';
    return NextResponse.json({ error: `論文の取得またはパースに失敗しました: ${message}` }, { status: 500 });
  }
}
