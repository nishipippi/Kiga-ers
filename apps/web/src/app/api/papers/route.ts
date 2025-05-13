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

    console.log(`Workspaceing papers from: ${url}`); // サーバー側のログ

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
      // parseAttributeValue: true, // 必要であれば属性値を型変換
      // parseNodeValue: true, // 必要であればノード値を型変換
    });
    const jsonData = parser.parse(xmlData);

    // パース結果の簡単なログ
    // console.log('Parsed JSON structure:', jsonData?.feed ? Object.keys(jsonData.feed) : 'No feed found');

    // 必要な情報を抽出して整形
    let papers = [];
    if (jsonData.feed && jsonData.feed.entry) {
      // entryが単一の場合と配列の場合の両方に対応
      const entries = Array.isArray(jsonData.feed.entry) ? jsonData.feed.entry : [jsonData.feed.entry];

      papers = entries.map((entry: any) => {
        // arXiv IDを抽出 (例: http://arxiv.org/abs/2310.12345v1 -> 2310.12345)
        // ID形式のバリエーションに対応 (古い形式も考慮)
        const idUrl = entry.id || '';
        let arxivId = idUrl.split('/abs/')[1] || ''; // /abs/ 以降を取得
        if (arxivId) {
            arxivId = arxivId.split('v')[0]; // バージョン情報を除去
        } else {
            arxivId = `unknown-${Math.random()}`; // IDが取得できない場合の代替
            console.warn('Could not extract arXiv ID from:', idUrl);
        }


        // PDFリンクを取得 (より確実に)
        let pdfLink = '';
        if (Array.isArray(entry.link)) {
          const pdfEntry = entry.link.find((link: any) => link['@_title'] === 'pdf' && link['@_href']);
          pdfLink = pdfEntry ? pdfEntry['@_href'] : '';
        } else if (entry.link && entry.link['@_title'] === 'pdf' && entry.link['@_href']) {
          pdfLink = entry.link['@_href'];
        }
        // PDFリンクがない場合、abstractページへのリンクを使う代替策も検討可能
        if (!pdfLink && idUrl) {
            pdfLink = idUrl.replace('/abs/', '/pdf/') + '.pdf'; // 推測でPDFリンクを生成
            console.log(`Guessed PDF link for ${arxivId}: ${pdfLink}`)
        }

        // 著者情報を整形
        let authors: string[] = [];
        if (entry.author) {
            const authorList = Array.isArray(entry.author) ? entry.author : [entry.author];
            authors = authorList.map((auth: any) => auth?.name || '不明な著者').filter((name: any) => name);
        }


        // カテゴリ情報を整形
         let categories: string[] = [];
         if (entry.category) {
            const categoryList = Array.isArray(entry.category) ? entry.category : [entry.category];
            categories = categoryList
                .map((cat: any) => cat?.['@_term'])
                .filter((term: any) => term); // term属性が存在するもののみ
         }


        return {
          id: arxivId,
          title: entry.title || 'タイトルなし',
          // summary の改行や空白をトリム
          summary: entry.summary ? entry.summary.trim().replace(/\s+/g, ' ') : '要約なし',
          authors: authors,
          published: entry.published || '',
          updated: entry.updated || '',
          pdfLink: pdfLink,
          categories: categories,
        };
      });
    } else {
       console.warn('No entries found in arXiv response or unexpected feed structure.');
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
