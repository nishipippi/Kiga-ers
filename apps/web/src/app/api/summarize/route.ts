// apps/web/src/app/api/summarize/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai'; // 正しいSDKをインポート

// 環境変数からAPIキーを取得
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// APIキーが設定されていない場合は、初期化時にエラーを発生させる
if (!GEMINI_API_KEY) {
  console.error('FATAL ERROR: GEMINI_API_KEY environment variable is not set.');
  // サーバー起動時にエラーがわかるように、ここではエラーを投げる
  throw new Error('サーバー設定エラー: Gemini APIキーが設定されていません。アプリケーションを起動できません。');
  // もしくは、リクエスト時にエラーを返す場合は以下のようにもできるが、起動時エラーの方が問題発見が早い
  // return NextResponse.json({ error: 'サーバー設定エラー: APIキーがありません。' }, { status: 500 });
}

// GoogleGenAIクライアントを初期化 (APIキーを渡す)
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// POSTリクエストを処理する関数をエクスポート
export async function POST(request: Request) {
  try {
    // リクエストボディをJSONとしてパースし、textToSummarizeを取得
    const { textToSummarize } = await request.json();

    // textToSummarize が存在し、かつ文字列であることを確認
    if (!textToSummarize || typeof textToSummarize !== 'string') {
      console.warn('Invalid request to /api/summarize: textToSummarize is missing or not a string.');
      return NextResponse.json({ error: '要約するテキストが必要です。' }, { status: 400 }); // Bad Request
    }

    // デバッグ用に受け取ったテキストの冒頭を表示 (長すぎる場合は切り詰める)
    console.log(`Received text to summarize (first 100 chars): ${textToSummarize.substring(0, 100)}...`);

    // Geminiモデルを選択 (利用可能なモデル名を確認してください)
    const modelName = "gemini-2.0-flash"; // 例: 'gemini-1.5-flash' や 'gemini-pro' など

    // Gemini APIを呼び出して要約を生成
    const response = await ai.models.generateContent({
        model: modelName,
        // プロンプト: どのような要約を期待するか具体的に指示
        contents: `以下の英語の論文Abstractを日本語で、その研究の主要な目的、手法、結果が簡潔にわかるように要約してください:\n\n---\n${textToSummarize}\n---`,
        // 必要に応じて生成設定 (generationConfig) を追加
        // config: {
        //   temperature: 0.5, // 低めに設定して、より決定的な出力を得る
        //   maxOutputTokens: 250, // 要約の最大長を制限
        //   // safetySettings: [...] // 安全性設定
        // }
    });

    // APIからのレスポンスから要約テキストを取得 (新しいSDKでは .text でアクセス)
    const summary = response.text;

    // 要約が生成されなかった場合のチェック
    if (!summary) {
        console.error('Gemini API call succeeded but returned no summary text.', response); // レスポンス詳細をログに記録
        return NextResponse.json({ error: '要約の生成に失敗しました。APIからの応答が空でした。' }, { status: 500 });
    }

    // 生成された要約の冒頭をデバッグ用に表示
    console.log(`Generated summary (first 100 chars): ${summary.substring(0, 100)}...`);

    // 成功レスポンスとして要約をJSON形式で返す
    return NextResponse.json({ summary });

  } catch (error) {
    // エラーハンドリング
    console.error('Error occurred in /api/summarize:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました。';
    // サーバー内部のエラーとして500エラーを返す
    return NextResponse.json({ error: `要約生成中にサーバーエラーが発生しました: ${errorMessage}` }, { status: 500 });
  }
}
