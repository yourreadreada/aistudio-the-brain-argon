import { AISource, FactFileType, inferFileTypeFromExtension } from '../types/brain';
export { inferFileTypeFromExtension };

export const SUPPORTED_FILE_EXTENSIONS = [
  '.zip',
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
  title: string;
  fileName: string;
  filePath?: string;
  fileType?: FactFileType;
  archiveParent?: string;
  extension: string;
  sizeBytes: number;
  text: string;
  pageOrItemCount?: number;
  itemUnitLabel?: string;
  detectedSource: AISource;
  status: 'success' | 'warning' | 'error';
  statusMessage?: string;
}

export function detectSourceFromFileName(filename: string, textSample: string = ''): AISource {
  const lower = (filename + ' ' + textSample.slice(0, 400)).toLowerCase();
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
    lower.includes('pull request') ||
    lower.includes('issue') ||
    lower.includes('diff') ||
    lower.includes('repo')
  ) {
    return 'github';
  }
  if (lower.includes('claude') || lower.includes('anthropic') || lower.includes('chat_messages')) {
    return 'claude';
  }
  if (
    lower.includes('gpt') ||
    lower.includes('chatgpt') ||
    lower.includes('openai') ||
    lower.includes('conversations.json')
  ) {
    return 'gpt';
  }
  if (lower.includes('gemini') || lower.includes('bard') || lower.includes('aistudio')) {
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

function cleanTitleFromFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() || fileName;
  return base.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim() || base;
}

function countMarkdownSectionsOrTurns(text: string): { count: number; label: string } {
  if (text.includes('#### User') || text.includes('#### Assistant') || text.includes('**USER**:')) {
    const turns = text.split(/(?=#### (?:User|Assistant)|\*\*(?:USER|ASSISTANT)\*\*:)/g).filter(Boolean);
    return { count: Math.max(1, turns.length), label: turns.length === 1 ? 'turn' : 'turns' };
  }
  const headings = text.match(/^#{1,3}\s+.+$/gm);
  if (headings && headings.length > 0) {
    return { count: headings.length, label: headings.length === 1 ? 'section' : 'sections' };
  }
  const paras = text.split(/\n\s*\n/).filter(Boolean);
  return { count: Math.max(1, paras.length), label: paras.length === 1 ? 'block' : 'blocks' };
}

export interface ExtractionProgressInfo {
  mode: 'determinate' | 'indeterminate';
  phase: 'extracting';
  current?: number;
  total?: number;
  unit?: string;
  label?: string;
}

export type ExtractionProgressCallback = (info: ExtractionProgressInfo) => void;

/**
 * Unpacks a file or a .zip archive into one or more ExtractedFileResult items for the Review Queue.
 */
export async function extractItemsFromFile(
  file: File,
  onProgress?: ExtractionProgressCallback
): Promise<ExtractedFileResult[]> {
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
  if (ext === '.zip') {
    return await extractZipArchive(file, onProgress);
  }
  const single = await extractTextFromFile(file, onProgress);
  const relativePath = (file as any).webkitRelativePath || file.name;
  return [
    {
      ...single,
      filePath: single.filePath || relativePath,
      fileType: single.fileType || inferFileTypeFromExtension(single.fileName),
    },
  ];
}

/**
 * Extracts plain text from a single file:
 * PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), Markdown (.md), Text (.txt), JSON chat exports, ZIP, or Images.
 */
export async function extractTextFromFile(
  file: File,
  onProgress?: ExtractionProgressCallback
): Promise<ExtractedFileResult> {
  const fileName = file.name;
  const title = cleanTitleFromFileName(fileName);
  const extension = '.' + (fileName.split('.').pop() || '').toLowerCase();
  const initialSource = detectSourceFromFileName(fileName);
  const sizeBytes = file.size;

  try {
    // 0. If a .zip file is passed to single-file extractor, combine or return first summary
    if (extension === '.zip') {
      const items = await extractZipArchive(file, onProgress);
      if (items.length === 0) {
        return {
          title,
          fileName,
          extension,
          sizeBytes,
          text: '',
          detectedSource: initialSource,
          status: 'warning',
          statusMessage: 'No supported documents or conversations found inside ZIP archive.',
        };
      }
      const combinedText = items.map((i) => `# ${i.title}\n\n${i.text}`).join('\n\n---\n\n');
      return {
        title,
        fileName,
        extension,
        sizeBytes,
        text: combinedText,
        pageOrItemCount: items.length,
        itemUnitLabel: items.length === 1 ? 'document' : 'documents',
        detectedSource: items[0].detectedSource,
        status: 'success',
      };
    }

    // 1. Markdown, Plain Text, or CSV
    if (['.md', '.markdown', '.txt', '.csv'].includes(extension)) {
      onProgress?.({
        mode: 'indeterminate',
        phase: 'extracting',
        label: 'Reading text file…',
      });
      const text = (await file.text()).trim();
      const detectedSource = detectSourceFromFileName(fileName, text);
      const stats = countMarkdownSectionsOrTurns(text);
      return {
        title,
        fileName,
        extension,
        sizeBytes,
        text,
        pageOrItemCount: stats.count,
        itemUnitLabel: stats.label,
        detectedSource,
        status: text ? 'success' : 'warning',
        statusMessage: text ? undefined : 'File is empty',
      };
    }

    // 2. JSON Chat Exports (ChatGPT conversations.json, Claude conversations.json, or structured memory)
    if (extension === '.json') {
      onProgress?.({
        mode: 'indeterminate',
        phase: 'extracting',
        label: 'Parsing JSON export…',
      });
      const rawText = await file.text();
      try {
        const parsed = JSON.parse(rawText);
        const extracted = extractChatFromJson(parsed, fileName, onProgress);
        return {
          title: extracted.title || title,
          fileName,
          extension,
          sizeBytes,
          text: extracted.text || rawText.trim(),
          pageOrItemCount: extracted.conversationCount || 1,
          itemUnitLabel:
            (extracted.conversationCount || 1) === 1 ? 'conversation' : 'conversations',
          detectedSource: extracted.detectedSource || detectSourceFromFileName(fileName, rawText),
          status: 'success',
        };
      } catch {
        return {
          title,
          fileName,
          extension,
          sizeBytes,
          text: rawText.trim(),
          pageOrItemCount: 1,
          itemUnitLabel: 'document',
          detectedSource: initialSource,
          status: 'success',
        };
      }
    }

    // 3. PDF Documents
    if (extension === '.pdf') {
      return await extractPdf(file, initialSource, onProgress);
    }

    // 4. Microsoft Word Documents (.docx)
    if (extension === '.docx') {
      return await extractDocx(file, initialSource, onProgress);
    }

    // 5. Microsoft Excel Spreadsheets (.xlsx, .xls)
    if (['.xlsx', '.xls'].includes(extension)) {
      return await extractXlsx(file, initialSource, onProgress);
    }

    // 6. Microsoft PowerPoint Presentations (.pptx)
    if (extension === '.pptx') {
      return await extractPptx(file, initialSource, onProgress);
    }

    // 7. Images
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
      onProgress?.({
        mode: 'indeterminate',
        phase: 'extracting',
        label: 'Inspecting image metadata…',
      });
      return await extractImageInfo(file, initialSource);
    }

    return {
      title,
      fileName,
      extension,
      sizeBytes,
      text: '',
      detectedSource: initialSource,
      status: 'error',
      statusMessage: `Unsupported file format '${extension}'. Supported: .zip, .pdf, .docx, .xlsx, .pptx, .md, .txt, .json, .csv, images`,
    };
  } catch (err: any) {
    return {
      title,
      fileName,
      extension,
      sizeBytes,
      text: '',
      detectedSource: initialSource,
      status: 'error',
      statusMessage: err?.message || 'Failed to extract text from file',
    };
  }
}

/**
 * Unpacks a .zip archive using JSZip and extracts all supported inner files or conversation exports.
 */
async function extractZipArchive(
  zipFile: File,
  onProgress?: ExtractionProgressCallback
): Promise<ExtractedFileResult[]> {
  onProgress?.({
    mode: 'indeterminate',
    phase: 'extracting',
    label: 'Reading ZIP archive index…',
  });
  const JSZipModule = await import('jszip');
  const JSZip = (JSZipModule as any).default || JSZipModule;
  const arrayBuffer = await zipFile.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const results: ExtractedFileResult[] = [];
  const allEntries = Object.keys(zip.files);

  // Filter supported entries first so we have a real, measurable total count
  const validPaths = allEntries.filter((relativePath) => {
    const zipEntry = zip.files[relativePath];
    if (!zipEntry || zipEntry.dir) return false;
    if (relativePath.includes('__MACOSX') || relativePath.split('/').pop()?.startsWith('.')) {
      return false;
    }
    const baseName = relativePath.split('/').pop() || relativePath;
    const ext = '.' + (baseName.split('.').pop() || '').toLowerCase();
    return SUPPORTED_FILE_EXTENSIONS.includes(ext) && ext !== '.zip';
  });

  const totalFiles = validPaths.length;

  for (let idx = 0; idx < validPaths.length; idx++) {
    const relativePath = validPaths[idx];
    const zipEntry = zip.files[relativePath];
    const baseName = relativePath.split('/').pop() || relativePath;

    if (totalFiles > 0) {
      onProgress?.({
        mode: 'determinate',
        phase: 'extracting',
        current: idx + 1,
        total: totalFiles,
        unit: totalFiles === 1 ? 'file' : 'files',
        label: `Unpacking ${baseName}`,
      });
    }

    try {
      const blob = await zipEntry.async('blob');
      const innerFile = new File([blob], baseName, { type: blob.type });
      const extracted = await extractTextFromFile(innerFile);
      if (extracted.text.trim()) {
        results.push({
          ...extracted,
          fileName: baseName,
          filePath: relativePath,
          fileType: extracted.fileType || inferFileTypeFromExtension(baseName),
          archiveParent: zipFile.name,
        });
      }
    } catch {
      // Skip unreadable entry inside archive
    }
  }

  return results;
}

// PDF Extraction (Lazy-loaded)
async function extractPdf(
  file: File,
  detectedSource: AISource,
  onProgress?: ExtractionProgressCallback
): Promise<ExtractedFileResult> {
  onProgress?.({
    mode: 'indeterminate',
    phase: 'extracting',
    label: 'Loading PDF document…',
  });
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
    onProgress?.({
      mode: 'determinate',
      phase: 'extracting',
      current: i,
      total: numPages,
      unit: numPages === 1 ? 'page' : 'pages',
      label: 'Extracting PDF pages',
    });
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
    title: cleanTitleFromFileName(file.name),
    fileName: file.name,
    extension: '.pdf',
    sizeBytes: file.size,
    text: fullText,
    pageOrItemCount: numPages,
    itemUnitLabel: numPages === 1 ? 'page' : 'pages',
    detectedSource: detectSourceFromFileName(file.name, fullText) || detectedSource,
    status: fullText ? 'success' : 'warning',
    statusMessage: fullText
      ? undefined
      : 'No text layer found (scanned image PDF).',
  };
}

// Word (.docx) Extraction (Lazy-loaded)
async function extractDocx(
  file: File,
  detectedSource: AISource,
  onProgress?: ExtractionProgressCallback
): Promise<ExtractedFileResult> {
  onProgress?.({
    mode: 'indeterminate',
    phase: 'extracting',
    label: 'Extracting Word document…',
  });
  const mammothModule = await import('mammoth');
  const mammoth = (mammothModule as any).default || mammothModule;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const rawText = (result.value || '').trim();
  const stats = countMarkdownSectionsOrTurns(rawText);

  return {
    title: cleanTitleFromFileName(file.name),
    fileName: file.name,
    extension: '.docx',
    sizeBytes: file.size,
    text: rawText,
    pageOrItemCount: stats.count,
    itemUnitLabel: stats.label,
    detectedSource: detectSourceFromFileName(file.name, rawText) || detectedSource,
    status: rawText ? 'success' : 'warning',
    statusMessage: rawText ? undefined : 'No readable text in Word document',
  };
}

// Excel (.xlsx, .xls) Extraction (Lazy-loaded)
async function extractXlsx(
  file: File,
  detectedSource: AISource,
  onProgress?: ExtractionProgressCallback
): Promise<ExtractedFileResult> {
  onProgress?.({
    mode: 'indeterminate',
    phase: 'extracting',
    label: 'Reading workbook…',
  });
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames || [];
  const parts: string[] = [];

  sheetNames.forEach((sheetName, idx) => {
    if (sheetNames.length > 0) {
      onProgress?.({
        mode: 'determinate',
        phase: 'extracting',
        current: idx + 1,
        total: sheetNames.length,
        unit: sheetNames.length === 1 ? 'sheet' : 'sheets',
        label: 'Extracting sheets',
      });
    }
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
    title: cleanTitleFromFileName(file.name),
    fileName: file.name,
    extension: '.' + (file.name.split('.').pop() || 'xlsx').toLowerCase(),
    sizeBytes: file.size,
    text: fullText,
    pageOrItemCount: sheetNames.length,
    itemUnitLabel: sheetNames.length === 1 ? 'sheet' : 'sheets',
    detectedSource,
    status: fullText ? 'success' : 'warning',
    statusMessage: fullText ? undefined : 'Spreadsheet is empty',
  };
}

// PowerPoint (.pptx) Extraction (Lazy-loaded)
async function extractPptx(
  file: File,
  detectedSource: AISource,
  onProgress?: ExtractionProgressCallback
): Promise<ExtractedFileResult> {
  onProgress?.({
    mode: 'indeterminate',
    phase: 'extracting',
    label: 'Reading presentation slides…',
  });
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
    onProgress?.({
      mode: 'determinate',
      phase: 'extracting',
      current: i + 1,
      total: slideFiles.length,
      unit: slideFiles.length === 1 ? 'slide' : 'slides',
      label: 'Extracting slides',
    });
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
    title: cleanTitleFromFileName(file.name),
    fileName: file.name,
    extension: '.pptx',
    sizeBytes: file.size,
    text: fullText,
    pageOrItemCount: slideFiles.length,
    itemUnitLabel: slideFiles.length === 1 ? 'slide' : 'slides',
    detectedSource,
    status: fullText ? 'success' : 'warning',
    statusMessage: fullText ? undefined : 'No text content found in slides',
  };
}

// Images
async function extractImageInfo(file: File, detectedSource: AISource): Promise<ExtractedFileResult> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const text = `[Image Reference: ${file.name} | ${img.naturalWidth}x${img.naturalHeight}px | Type: ${file.type}]\nAttached diagram / screenshot uploaded to knowledge base.`;
      resolve({
        title: cleanTitleFromFileName(file.name),
        fileName: file.name,
        extension: '.' + (file.name.split('.').pop() || 'png').toLowerCase(),
        sizeBytes: file.size,
        text,
        pageOrItemCount: 1,
        itemUnitLabel: 'image',
        detectedSource,
        status: 'success',
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        title: cleanTitleFromFileName(file.name),
        fileName: file.name,
        extension: '.' + (file.name.split('.').pop() || 'png').toLowerCase(),
        sizeBytes: file.size,
        text: `[Image: ${file.name}] Attached visual reference.`,
        pageOrItemCount: 1,
        itemUnitLabel: 'image',
        detectedSource,
        status: 'success',
      });
    };

    img.src = url;
  });
}

// Helper to extract clean conversation logs from ChatGPT or Claude JSON exports
function extractChatFromJson(
  data: any,
  fileName: string,
  onProgress?: ExtractionProgressCallback
): {
  text: string;
  conversationCount: number;
  title?: string;
  detectedSource?: AISource;
} {
  if (Array.isArray(data)) {
    const convoLogs: string[] = [];
    let detectedSource: AISource | undefined = undefined;
    let firstTitle: string | undefined = undefined;
    const totalRecords = data.length;

    data.forEach((convo: any, idx: number) => {
      if (totalRecords > 1) {
        onProgress?.({
          mode: 'determinate',
          phase: 'extracting',
          current: idx + 1,
          total: totalRecords,
          unit: 'records',
          label: 'Parsing conversations',
        });
      }
      const title = convo.title || convo.name || `Conversation ${idx + 1}`;
      if (!firstTitle && (convo.title || convo.name)) {
        firstTitle = convo.title || convo.name;
      }
      const messages: string[] = [];

      // 1. OpenAI ChatGPT export format (`mapping`)
      if (convo.mapping && typeof convo.mapping === 'object') {
        detectedSource = 'gpt';
        Object.values(convo.mapping).forEach((node: any) => {
          const msg = node?.message;
          if (msg && msg.content && Array.isArray(msg.content.parts)) {
            const rawRole = msg.author?.role || 'assistant';
            if (rawRole === 'system') return;
            const roleLabel = rawRole === 'user' ? 'User' : 'Assistant';
            const textParts = msg.content.parts.filter((p: any) => typeof p === 'string' && p.trim());
            if (textParts.length > 0) {
              messages.push(`#### ${roleLabel}\n${textParts.join('\n')}`);
            }
          }
        });
      }

      // 2. Anthropic Claude export format (`chat_messages`)
      if (Array.isArray(convo.chat_messages)) {
        detectedSource = 'claude';
        convo.chat_messages.forEach((msg: any) => {
          const sender = msg.sender === 'human' || msg.role === 'user' ? 'User' : 'Assistant';
          const text = msg.text || (Array.isArray(msg.content) ? msg.content.map((c: any) => c.text || '').join('\n') : '');
          if (text && text.trim()) {
            messages.push(`#### ${sender}\n${text.trim()}`);
          }
        });
      }

      if (messages.length > 0) {
        convoLogs.push(`# ${title}\n\n${messages.join('\n\n')}`);
      }
    });

    if (convoLogs.length > 0) {
      return {
        text: convoLogs.join('\n\n---\n\n'),
        conversationCount: convoLogs.length,
        title: convoLogs.length === 1 ? firstTitle : `${cleanTitleFromFileName(fileName)} (${convoLogs.length} chats)`,
        detectedSource,
      };
    }
  }

  return {
    text: '',
    conversationCount: 1,
  };
}

