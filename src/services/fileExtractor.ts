import { AISource } from '../types/brain';

export const SUPPORTED_FILE_EXTENSIONS = [
  '.md',
  '.markdown',
  '.txt',
  '.json',
  '.csv',
  '.pdf',
  '.docx',
  '.xlsx',
  '.xls',
  '.pptx',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
];

export interface ExtractedFileResult {
  fileName: string;
  extension: string;
  sizeBytes: number;
  text: string;
  pageOrItemCount?: number;
  detectedSource: AISource;
  status: 'success' | 'warning' | 'error';
  statusMessage?: string;
}

export function detectSourceFromFileName(filename: string): AISource {
  const lower = filename.toLowerCase();
  if (
    lower.includes('moodle') ||
    lower.includes('syllabus') ||
    lower.includes('assignment') ||
    lower.includes('exam') ||
    lower.includes('grade') ||
    lower.includes('mark') ||
    lower.includes('lecture') ||
    lower.includes('course') ||
    lower.includes('lab') ||
    lower.includes('homework')
  ) {
    return 'moodle';
  }
  if (
    lower.includes('github') ||
    lower.includes('commit') ||
    lower.includes('pr') ||
    lower.includes('issue') ||
    lower.includes('diff') ||
    lower.includes('repo')
  ) {
    return 'github';
  }
  if (lower.includes('claude') || lower.includes('anthropic')) {
    return 'claude';
  }
  if (lower.includes('gpt') || lower.includes('chatgpt') || lower.includes('openai')) {
    return 'gpt';
  }
  if (lower.includes('gemini') || lower.includes('bard')) {
    return 'gemini';
  }
  if (lower.includes('cursor') || lower.includes('antigravity') || lower.includes('composer')) {
    return 'cursor';
  }
  if (
    lower.includes('ollama') ||
    lower.includes('local') ||
    lower.includes('llama') ||
    lower.includes('qwen') ||
    lower.includes('mistral')
  ) {
    return 'local-ai';
  }
  return 'claude';
}

/**
 * Extracts plain text from any college or chat export file type:
 * PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), Markdown (.md), Text (.txt), JSON chat exports, or Images.
 */
export async function extractTextFromFile(file: File): Promise<ExtractedFileResult> {
  const fileName = file.name;
  const extension = '.' + (fileName.split('.').pop() || '').toLowerCase();
  const detectedSource = detectSourceFromFileName(fileName);
  const sizeBytes = file.size;

  try {
    // 1. Markdown, Plain Text, or CSV
    if (['.md', '.markdown', '.txt', '.csv'].includes(extension)) {
      const text = await file.text();
      return {
        fileName,
        extension,
        sizeBytes,
        text: text.trim(),
        detectedSource,
        status: text.trim() ? 'success' : 'warning',
        statusMessage: text.trim() ? undefined : 'File is empty',
      };
    }

    // 2. JSON Chat Exports (e.g. ChatGPT conversations.json or structured memory)
    if (extension === '.json') {
      const rawText = await file.text();
      try {
        const parsed = JSON.parse(rawText);
        const extractedChat = extractChatFromJson(parsed);
        return {
          fileName,
          extension,
          sizeBytes,
          text: extractedChat || rawText,
          detectedSource: lowerMatch(fileName, 'chatgpt') ? 'gpt' : detectedSource,
          status: 'success',
        };
      } catch {
        return {
          fileName,
          extension,
          sizeBytes,
          text: rawText.trim(),
          detectedSource,
          status: 'success',
        };
      }
    }

    // 3. PDF Documents (Syllabus, handouts, research papers, exam sheets)
    if (extension === '.pdf') {
      return await extractPdf(file, detectedSource);
    }

    // 4. Microsoft Word Documents (.docx)
    if (extension === '.docx') {
      return await extractDocx(file, detectedSource);
    }

    // 5. Microsoft Excel Spreadsheets (.xlsx, .xls)
    if (['.xlsx', '.xls'].includes(extension)) {
      return await extractXlsx(file, detectedSource);
    }

    // 6. Microsoft PowerPoint Presentations (.pptx)
    if (extension === '.pptx') {
      return await extractPptx(file, detectedSource);
    }

    // 7. Images (Diagrams, whiteboard photos, slides, screenshots)
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
      return await extractImageInfo(file, detectedSource);
    }

    // Unsupported format fallback
    return {
      fileName,
      extension,
      sizeBytes,
      text: '',
      detectedSource,
      status: 'error',
      statusMessage: `Unsupported file format '${extension}'. Supported: .pdf, .docx, .xlsx, .pptx, .md, .txt, .json, .csv, images`,
    };
  } catch (err: any) {
    return {
      fileName,
      extension,
      sizeBytes,
      text: '',
      detectedSource,
      status: 'error',
      statusMessage: err?.message || 'Failed to extract text from file',
    };
  }
}

// PDF Extraction (Lazy-loaded)
async function extractPdf(file: File, detectedSource: AISource): Promise<ExtractedFileResult> {
  const pdfjsLib = await import('pdfjs-dist');
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;
  } catch {}

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  const pageTexts: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageLines = content.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .filter(Boolean);

      const combinedText = pageLines.join(' ').replace(/\s+/g, ' ').trim();
      if (combinedText) {
        pageTexts.push(`## Page ${i}\n\n${combinedText}`);
      }
    } catch {
      // Continue next page on partial error
    }
  }

  const fullText = pageTexts.join('\n\n').trim();

  return {
    fileName: file.name,
    extension: '.pdf',
    sizeBytes: file.size,
    text: fullText,
    pageOrItemCount: numPages,
    detectedSource,
    status: fullText ? 'success' : 'warning',
    statusMessage: fullText
      ? undefined
      : 'No text layer found (scanned image PDF). OCR recommended.',
  };
}

// Word (.docx) Extraction (Lazy-loaded)
async function extractDocx(file: File, detectedSource: AISource): Promise<ExtractedFileResult> {
  const mammothModule = await import('mammoth');
  const mammoth = (mammothModule as any).default || mammothModule;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const rawText = (result.value || '').trim();

  return {
    fileName: file.name,
    extension: '.docx',
    sizeBytes: file.size,
    text: rawText,
    detectedSource,
    status: rawText ? 'success' : 'warning',
    statusMessage: rawText ? undefined : 'No readable text in Word document',
  };
}

// Excel (.xlsx, .xls) Extraction (Lazy-loaded)
async function extractXlsx(file: File, detectedSource: AISource): Promise<ExtractedFileResult> {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames || [];
  const parts: string[] = [];

  sheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return;

    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const rows = csv
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r.replace(/,/g, '').trim());

    if (rows.length > 0) {
      const formattedRows = rows.map((row) =>
        row
          .split(',')
          .map((c) => c.trim())
          .join(' | ')
      );
      parts.push(`## Sheet: ${sheetName}\n\n${formattedRows.join('\n')}`);
    }
  });

  const fullText = parts.join('\n\n').trim();

  return {
    fileName: file.name,
    extension: '.' + (file.name.split('.').pop() || 'xlsx').toLowerCase(),
    sizeBytes: file.size,
    text: fullText,
    pageOrItemCount: sheetNames.length,
    detectedSource,
    status: fullText ? 'success' : 'warning',
    statusMessage: fullText ? undefined : 'Spreadsheet is empty',
  };
}

// PowerPoint (.pptx) Extraction (Lazy-loaded)
async function extractPptx(file: File, detectedSource: AISource): Promise<ExtractedFileResult> {
  const JSZipModule = await import('jszip');
  const JSZip = (JSZipModule as any).default || JSZipModule;
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideFiles = Object.keys(zip.files).filter((name) =>
    name.match(/^ppt\/slides\/slide\d+\.xml$/)
  );

  slideFiles.sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return numA - numB;
  });

  const slideTexts: string[] = [];
  const parser = new DOMParser();

  for (let i = 0; i < slideFiles.length; i++) {
    const slideXml = await zip.file(slideFiles[i])?.async('string');
    if (!slideXml) continue;

    const xmlDoc = parser.parseFromString(slideXml, 'application/xml');
    const textNodes = xmlDoc.getElementsByTagName('a:t');
    const lines: string[] = [];

    for (let j = 0; j < textNodes.length; j++) {
      const val = textNodes[j].textContent?.trim();
      if (val) lines.push(val);
    }

    if (lines.length > 0) {
      slideTexts.push(`## Slide ${i + 1}\n\n${lines.join('\n')}`);
    }
  }

  const fullText = slideTexts.join('\n\n').trim();

  return {
    fileName: file.name,
    extension: '.pptx',
    sizeBytes: file.size,
    text: fullText,
    pageOrItemCount: slideFiles.length,
    detectedSource,
    status: fullText ? 'success' : 'warning',
    statusMessage: fullText ? undefined : 'No text content found in slides',
  };
}

// Images (Extract metadata, dimensions, and image contextual header)
async function extractImageInfo(file: File, detectedSource: AISource): Promise<ExtractedFileResult> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const text = `[Image Reference: ${file.name} | ${img.naturalWidth}x${img.naturalHeight}px | Type: ${file.type}]\nAttached diagram / screenshot uploaded to knowledge base.`;
      resolve({
        fileName: file.name,
        extension: '.' + (file.name.split('.').pop() || 'png').toLowerCase(),
        sizeBytes: file.size,
        text,
        pageOrItemCount: 1,
        detectedSource,
        status: 'success',
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        fileName: file.name,
        extension: '.' + (file.name.split('.').pop() || 'png').toLowerCase(),
        sizeBytes: file.size,
        text: `[Image: ${file.name}] Attached visual reference.`,
        detectedSource,
        status: 'success',
      });
    };

    img.src = url;
  });
}

function lowerMatch(str: string, term: string) {
  return str.toLowerCase().includes(term.toLowerCase());
}

// Helper to extract clean conversation logs from ChatGPT conversations.json exports
function extractChatFromJson(data: any): string {
  if (Array.isArray(data)) {
    const convoLogs: string[] = [];
    data.forEach((convo: any, idx: number) => {
      const title = convo.title || `Conversation ${idx + 1}`;
      const messages: string[] = [];

      if (convo.mapping) {
        Object.values(convo.mapping).forEach((node: any) => {
          const msg = node?.message;
          if (msg && msg.content && Array.isArray(msg.content.parts)) {
            const role = msg.author?.role || 'speaker';
            const textParts = msg.content.parts.filter((p: any) => typeof p === 'string');
            if (textParts.length > 0) {
              messages.push(`**${role.toUpperCase()}**: ${textParts.join('\n')}`);
            }
          }
        });
      }

      if (messages.length > 0) {
        convoLogs.push(`## ${title}\n\n${messages.join('\n\n')}`);
      }
    });

    if (convoLogs.length > 0) {
      return convoLogs.join('\n\n---\n\n');
    }
  }

  return '';
}
