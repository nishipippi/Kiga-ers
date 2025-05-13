// apps/web/src/app/api/ask-ai/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('FATAL ERROR: ASK-AI - GEMINI_API_KEY environment variable is not set.');
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });

async function downloadFile(url: string, outputPath: string): Promise<void> {
  console.log(`ask-ai/downloadFile: Attempting to download from ${url} to ${outputPath}`);
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`ask-ai/downloadFile: Failed to download file (${response.status}): ${errorText} from ${url}`);
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(buffer));
  console.log(`ask-ai/downloadFile: File downloaded successfully to ${outputPath}`);
}

export async function POST(request: Request) {
  if (!GEMINI_API_KEY) {
    console.error('ASK-AI API Error: GEMINI_API_KEY is not set at request time.');
    return NextResponse.json({ error: 'サーバー設定エラー: APIキーが設定されていません。' }, { status: 500 });
  }

  try {
    const { question, pdfUrl, paperTitle } = await request.json();

    if (!question || typeof question !== 'string') {
      console.warn('ask-ai API: Invalid request - question is missing or not a string.');
      return NextResponse.json({ error: 'AIへの質問内容が必要です。' }, { status: 400 });
    }
    if (!pdfUrl || typeof pdfUrl !== 'string') {
      console.warn('ask-ai API: Invalid request - pdfUrl is missing or not a string.');
      return NextResponse.json({ error: '質問対象の論文PDF URLが必要です。' }, { status: 400 });
    }
    const safePaperTitle = typeof paperTitle === 'string' ? paperTitle : '提示された論文';

    console.log(`ask-ai API: Received question "${question}" for PDF: ${pdfUrl} (Title: ${safePaperTitle})`);

    const modelName = "gemini-1.5-flash-latest";

    const tempDir = os.tmpdir();
    const uniqueFileName = `ask_paper_${Date.now()}_${path.basename(new URL(pdfUrl).pathname) || 'downloaded.pdf'}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const tempFilePath = path.join(tempDir, uniqueFileName);
    
    let uploadedFileResponse;

    try {
      console.log(`ask-ai API: Downloading PDF to temporary path: ${tempFilePath}`);
      await downloadFile(pdfUrl, tempFilePath);

      console.log(`ask-ai API: Uploading file "${tempFilePath}" to Gemini.`);
      uploadedFileResponse = await ai.files.upload({
        file: tempFilePath,
      });
      console.log(`ask-ai API: File uploaded to Gemini. Name: ${uploadedFileResponse.name}, URI: ${uploadedFileResponse.uri}`);

      const contents = [
        { 
          fileData: {
            mimeType: uploadedFileResponse.mimeType,
            fileUri: uploadedFileResponse.uri,
          }
        },
        { 
          text: `あなたは提供された学術論文の内容を深く理解し、それに関するユーザーからの質問に、論文中の情報に基づいて正確かつ具体的に回答するAIアシスタントです。以下の論文「${safePaperTitle}」の内容を踏まえて、この質問に答えてください。\n\n質問: 「${question}」\n\n回答は、質問の意図を正確に捉え、論文中の該当箇所を適切に参照しながら、明確かつ簡潔にお願いします。もし論文中に直接的な答えが見つからない場合は、その旨を正直に伝えてください。憶測や論文外の情報に基づく回答は避けてください。`
        }
      ];
      
      console.log(`ask-ai API: Generating answer with model ${modelName}.`);
      const generationResponse = await ai.models.generateContent({
        model: modelName,
        contents: contents,
      });
      console.log(`ask-ai API: Answer generation completed.`);

      const answer = generationResponse.text;

      if (!answer) {
        console.error('ask-ai API: Gemini API returned no answer text.', generationResponse);
        return NextResponse.json({ error: 'AIからの回答が空でした。' }, { status: 500 });
      }

      console.log(`ask-ai API: Answer generated (first 100 chars): ${answer.substring(0, 100)}...`);
      return NextResponse.json({ answer });

    } finally {
      if (uploadedFileResponse && uploadedFileResponse.name) { // ★★★ 修正点: name が存在することを確認 ★★★
        try {
          console.log(`ask-ai API: Deleting uploaded file from Gemini: ${uploadedFileResponse.name}`);
          // ★★★ 修正点: オブジェクトでパラメータを渡す ★★★
          await ai.files.delete({ name: uploadedFileResponse.name });
          console.log(`ask-ai API: Gemini file ${uploadedFileResponse.name} deleted successfully.`);
        } catch (deleteError) {
          console.error(`ask-ai API: Error deleting Gemini file ${uploadedFileResponse.name}:`, deleteError);
        }
      }
      try {
        console.log(`ask-ai API: Attempting to delete temporary local file: ${tempFilePath}`);
        await fs.access(tempFilePath);
        await fs.unlink(tempFilePath);
        console.log(`ask-ai API: Temporary local file ${tempFilePath} deleted successfully.`);
      } catch (unlinkError: any) {
        if (unlinkError.code !== 'ENOENT') {
          console.error(`ask-ai API: Error deleting temporary local file ${tempFilePath}:`, unlinkError);
        } else {
          console.log(`ask-ai API: Temporary local file ${tempFilePath} not found for deletion.`);
        }
      }
    }
  } catch (error) {
    console.error('ask-ai API: Unhandled error occurred:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なサーバーエラーが発生しました。';
    return NextResponse.json({ error: `AIへの質問処理中にサーバーエラーが発生しました: ${errorMessage}` }, { status: 500 });
  }
}