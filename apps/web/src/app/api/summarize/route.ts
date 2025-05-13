// apps/web/src/app/api/summarize/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('FATAL ERROR: SUMMARIZE - GEMINI_API_KEY environment variable is not set.');
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });

async function downloadFile(url: string, outputPath: string): Promise<void> {
  console.log(`summarize/downloadFile: Attempting to download from ${url} to ${outputPath}`);
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`summarize/downloadFile: Failed to download file (${response.status}): ${errorText} from ${url}`);
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(buffer));
  console.log(`summarize/downloadFile: File downloaded successfully to ${outputPath}`);
}

export async function POST(request: Request) {
  if (!GEMINI_API_KEY) {
    console.error('SUMMARIZE API Error: GEMINI_API_KEY is not set at request time.');
    return NextResponse.json({ error: 'サーバー設定エラー: APIキーが設定されていません。' }, { status: 500 });
  }

  try {
    const { pdfUrl, paperTitle } = await request.json();

    if (!pdfUrl || typeof pdfUrl !== 'string') {
      console.warn('summarize API: Invalid request - pdfUrl is missing or not a string.');
      return NextResponse.json({ error: '要約する論文のPDF URLが必要です。' }, { status: 400 });
    }
    const safePaperTitle = typeof paperTitle === 'string' ? paperTitle : '提示された論文';

    console.log(`summarize API: Received request to summarize PDF: ${pdfUrl} (Title: ${safePaperTitle})`);

    const modelName = "gemini-1.5-flash-latest";

    const tempDir = os.tmpdir();
    const uniqueFileName = `summary_paper_${Date.now()}_${path.basename(new URL(pdfUrl).pathname) || 'downloaded.pdf'}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const tempFilePath = path.join(tempDir, uniqueFileName);
    
    let uploadedFileResponse; 

    try {
      console.log(`summarize API: Downloading PDF to temporary path: ${tempFilePath}`);
      await downloadFile(pdfUrl, tempFilePath);

      console.log(`summarize API: Uploading file "${tempFilePath}" to Gemini.`);
      uploadedFileResponse = await ai.files.upload({
        file: tempFilePath,
      });
      console.log(`summarize API: File uploaded to Gemini. Name: ${uploadedFileResponse.name}, URI: ${uploadedFileResponse.uri}`);

      const contents = [
        { 
          fileData: {
            mimeType: uploadedFileResponse.mimeType,
            fileUri: uploadedFileResponse.uri,
          }
        },
        { 
          text: `あなたは学術論文を分析し、その内容を簡潔かつ正確に要約する専門家です。以下の論文「${safePaperTitle}」について、その主要な目的、採用された手法、得られた主要な結果、そして研究の最も重要な貢献や新規性が明確にわかるように、日本語で包括的な要約を作成してください。専門用語は適度に解説を加え、専門外の研究者や学生にも理解しやすい言葉遣いを心がけてください。要約の長さは、論文の複雑さに応じて調整し、重要な情報が欠落しない範囲で、できるだけ簡潔にまとめてください。`
        }
      ];

      console.log(`summarize API: Generating summary with model ${modelName}.`);
      const generationResponse = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          temperature: 0.4,
        }
      });
      console.log(`summarize API: Summary generation completed.`);

      const summary = generationResponse.text;

      if (!summary) {
        console.error('summarize API: Gemini API returned no summary text.', generationResponse);
        return NextResponse.json({ error: '要約の生成に失敗しました。APIからの応答が空でした。' }, { status: 500 });
      }

      console.log(`summarize API: Summary generated (first 100 chars): ${summary.substring(0, 100)}...`);
      return NextResponse.json({ summary });

    } finally {
      if (uploadedFileResponse && uploadedFileResponse.name) { // ★★★ 修正点: name が存在することを確認 ★★★
        try {
          console.log(`summarize API: Deleting uploaded file from Gemini: ${uploadedFileResponse.name}`);
          // ★★★ 修正点: オブジェクトでパラメータを渡す ★★★
          await ai.files.delete({ name: uploadedFileResponse.name }); 
          console.log(`summarize API: Gemini file ${uploadedFileResponse.name} deleted successfully.`);
        } catch (deleteError) {
          console.error(`summarize API: Error deleting Gemini file ${uploadedFileResponse.name}:`, deleteError);
        }
      }
      try {
        console.log(`summarize API: Attempting to delete temporary local file: ${tempFilePath}`);
        await fs.access(tempFilePath);
        await fs.unlink(tempFilePath);
        console.log(`summarize API: Temporary local file ${tempFilePath} deleted successfully.`);
    } catch (unlinkError) { // ★★★ 修正: any を削除し、型推論またはunknownを使用 ★★★
      // NodeJS.ErrnoException 型ガードの例
      if (unlinkError && typeof unlinkError === 'object' && 'code' in unlinkError && (unlinkError as {code: string}).code !== 'ENOENT') {
        console.error(`summarize API: Error deleting temporary local file ${tempFilePath}:`, unlinkError);
      } else if (unlinkError && typeof unlinkError === 'object' && 'code' in unlinkError && (unlinkError as {code: string}).code === 'ENOENT') {
        console.log(`summarize API: Temporary local file ${tempFilePath} not found for deletion (possibly already deleted or never created).`);
      } else {
        // その他の予期しないエラー
        console.error(`summarize API: An unexpected error occurred while deleting temporary local file ${tempFilePath}:`, unlinkError);
      }
    }
  }
  } catch (error) {
    console.error('summarize API: Unhandled error occurred:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なサーバーエラーが発生しました。';
    return NextResponse.json({ error: `要約生成中にサーバーエラーが発生しました: ${errorMessage}` }, { status: 500 });
  }
}