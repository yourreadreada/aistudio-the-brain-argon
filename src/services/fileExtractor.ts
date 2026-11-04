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

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB general limit
export const MAX_PDF_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB PDF limit
export const MAX_XLSX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB spreadsheet limit
export const MAX_XLSX_SHEETS = 20;
export const MAX_XLSX_ROWS_PER_SHEET = 500;
export const MAX_XLSX_TOTAL_ROWS = 2000;
export const MAX_XLSX_COLUMNS_PER_ROW = 50;

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

const KNOWN_ACRONYMS: Record<string, string> = {
  ai: 'AI',
  api: 'API',
  ui: 'UI',
  ux: 'UX',
  db: 'DB',
  sql: 'SQL',
  pdf: 'PDF',
  docx: 'DOCX',
  xlsx: 'XLSX',
  pptx: 'PPTX',
  json: 'JSON',
  csv: 'CSV',
  md: 'MD',
  txt: 'TXT',
  html: 'HTML',
  css: 'CSS',
  js: 'JS',
  ts: 'TS',
  jsx: 'JSX',
  tsx: 'TSX',
  mcp: 'MCP',
  llm: 'LLM',
  llms: 'LLMs',
  gpt: 'GPT',
  chatgpt: 'ChatGPT',
  rag: 'RAG',
  ocr: 'OCR',
  url: 'URL',
  uri: 'URI',
  id: 'ID',
  pr: 'PR',
  prs: 'PRs',
  sih: 'SIH',
  github: 'GitHub',
  gitlab: 'GitLab',
  fastapi: 'FastAPI',
  pytorch: 'PyTorch',
  graphql: 'GraphQL',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  powerpoint: 'PowerPoint',
  readme: 'README',
  sqlite: 'SQLite',
  mfcc: 'MFCC',
  redis: 'Redis',
  rfc: 'RFC',
  adr: 'ADR',
  dsp: 'DSP',
  cn: 'CN',
};

const MINOR_TITLE_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'nor',
  'for',
  'so',
  'yet',
  'in',
  'on',
  'at',
  'to',
  'of',
  'by',
  'with',
  'from',
  'into',
  'onto',
  'per',
  'via',
]);

const KNOWN_STRIPPABLE_EXTENSIONS = new Set([
  'zip',
  'md',
  'markdown',
  'txt',
  'json',
  'csv',
  'pdf',
  'docx',
  'doc',
  'rtf',
  'xlsx',
  'xls',
  'pptx',
  'ppt',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'svg',
  'gif',
  'ts',
  'tsx',
  'js',
  'jsx',
  'py',
  'rs',
  'go',
  'java',
  'cpp',
  'c',
  'sql',
  'yaml',
  'yml',
  'sh',
  'html',
  'css',
]);

/**
 * Formats a raw filename or title into readable Title Case without mutating
 * the underlying filename or path identity.
 * - Strips file extensions when present
 * - Replaces underscores and hyphens with spaces
 * - Converts lowercase words to Title Case while preserving acronyms and intentional camelCase
 */
export function formatReadableTitle(rawInput: string): string {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return 'Untitled Document';

  // Extract base segment if path separators exist
  const baseSegment = trimmed.split(/[\\/]/).pop() || trimmed;

  // Strip trailing file extension if it matches a known extension
  const extMatch = baseSegment.match(/^(.+)\.([a-zA-Z0-9]{1,8})$/);
  const withoutExt =
    extMatch && KNOWN_STRIPPABLE_EXTENSIONS.has(extMatch[2].toLowerCase())
      ? extMatch[1]
      : baseSegment;

  // Replace underscores and hyphens with spaces and collapse repeated whitespace
  const normalizedWords = withoutExt
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalizedWords) return baseSegment;

  const tokens = normalizedWords.split(' ');
  const total = tokens.length;

  return tokens
    .map((word, idx) => {
      if (!word) return '';

      // Preserve parenthetical wrappers like "(3" or "chats)"
      const leadPunctMatch = word.match(/^([([{"']+)(.*)$/);
      const leadPunct = leadPunctMatch ? leadPunctMatch[1] : '';
      const restAfterLead = leadPunctMatch ? leadPunctMatch[2] : word;

      const trailPunctMatch = restAfterLead.match(/^(.*?)([)\]}"',.:;!?]+)$/);
      const core = trailPunctMatch ? trailPunctMatch[1] : restAfterLead;
      const trailPunct = trailPunctMatch ? trailPunctMatch[2] : '';

      if (!core) return word;

      const lower = core.toLowerCase();

      // 1. Check known acronyms / brand casing
      if (KNOWN_ACRONYMS[lower]) {
        return `${leadPunct}${KNOWN_ACRONYMS[lower]}${trailPunct}`;
      }

      // 2. Format version tokens such as v1, v2, v2.1 -> V1, V2, V2.1
      if (/^v\d+(\.\d+)*$/i.test(core)) {
        return `${leadPunct}V${core.slice(1)}${trailPunct}`;
      }

      // 3. Preserve words that already have intentional internal mixed/upper casing (e.g. "OpenAI", "macOS")
      if (/[a-z]/.test(core) && /[A-Z]/.test(core.slice(1))) {
        return `${leadPunct}${core}${trailPunct}`;
      }

      // 4. Preserve short all-uppercase acronyms (2-4 letters) if the input wasn't entirely uppercase
      const isEntireInputUpper =
        normalizedWords === normalizedWords.toUpperCase() &&
        /[A-Z]/.test(normalizedWords);
      if (!isEntireInputUpper && /^[A-Z0-9]{2,4}$/.test(core)) {
        return `${leadPunct}${core}${trailPunct}`;
      }

      // 5. Keep minor conjunctions/prepositions lowercase unless first or last word
      if (idx > 0 && idx < total - 1 && MINOR_TITLE_WORDS.has(lower)) {
        return `${leadPunct}${lower}${trailPunct}`;
      }

      // 6. Standard Title Case
      const titled = lower.charAt(0).toUpperCase() + lower.slice(1);
      return `${leadPunct}${titled}${trailPunct}`;
    })
    .join(' ');
}

export function cleanTitleFromFileName(fileName: string): string {
  return formatReadableTitle(fileName);
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
 * Polyfills ES2025 `Promise.try` and `Uint8Array.prototype.toHex` / `Uint8Array.fromHex`
 * if missing in the current JS runtime (e.g. Node 22 or older browsers),
 * which are required by `pdfjs-dist` 6.x during PDF parsing and worker initialization.
 */
function ensurePdfJsRuntimePolyfills(): void {
  if (typeof (Promise as any).try !== 'function') {
    (Promise as any).try = function <T>(
      callback: (...args: any[]) => T | PromiseLike<T>,
      ...args: any[]
    ): Promise<T> {
      return new Promise<T>((resolve) => resolve(callback(...args)));
    };
  }

  if (typeof (Uint8Array.prototype as any).toHex !== 'function') {
    (Uint8Array.prototype as any).toHex = function (this: Uint8Array): string {
      let out = '';
      for (let i = 0; i < this.length; i++) {
        out += this[i].toString(16).padStart(2, '0');
      }
      return out;
    };
  }

  if (typeof (Uint8Array as any).fromHex !== 'function') {
    (Uint8Array as any).fromHex = function (hex: string): Uint8Array {
      const clean = String(hex || '').replace(/\s+/g, '');
      const bytes = new Uint8Array(Math.floor(clean.length / 2));
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    };
  }
}

ensurePdfJsRuntimePolyfills();

/**
 * Configures PDF.js to use the local package worker matching the installed pdfjs-dist version
 * instead of a hard-coded external CDN version.
 */
export function configurePdfWorker(pdfjsLib: any): string {
  ensurePdfJsRuntimePolyfills();

  const localWorkerUrl = new URL(
    '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  if (pdfjsLib?.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = localWorkerUrl;
  }

  return localWorkerUrl;
}

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
      fileName: file.name,
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
    // Rejectlegacy .xls before general size checks so the user always gets the specific .xlsx conversion instructions
    if (extension === '.xls') {
      return await extractXlsx(file, initialSource, onProgress);
    }

    if (sizeBytes > MAX_FILE_SIZE_BYTES && extension !== '.pdf' && extension !== '.xlsx') {
      const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
      const maxMb = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(1);
      return {
        title,
        fileName,
        extension,
        sizeBytes,
        text: '',
        detectedSource: initialSource,
        status: 'error',
        statusMessage: `File exceeds maximum supported size (${mb} MB > ${maxMb} MB limit). Please split or compress the file before importing.`,
      };
    }

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
          title: extracted.title ? formatReadableTitle(extracted.title) : title,
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
 * Preserves both the base fileName and the full archive relative filePath independently of the Title Case display title.
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
      if (extracted.text.trim() || extracted.status === 'error') {
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

/**
 * PDF Extraction using local/package pdfjs-dist worker.
 * Surfaces clear error messages for malformed/corrupted PDFs and scanned PDFs without a text layer.
 */
async function extractPdf(
  file: File,
  detectedSource: AISource,
  onProgress?: ExtractionProgressCallback
): Promise<ExtractedFileResult> {
  const title = cleanTitleFromFileName(file.name);
  if (file.size > MAX_PDF_FILE_SIZE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    const maxMb = (MAX_PDF_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(1);
    return {
      title,
      fileName: file.name,
      fileType: 'pdf',
      extension: '.pdf',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'pages',
      detectedSource,
      status: 'error',
      statusMessage: `Oversized PDF file (${mb} MB exceeds ${maxMb} MB limit). Split the PDF into smaller documents before importing.`,
    };
  }

  onProgress?.({
    mode: 'indeterminate',
    phase: 'extracting',
    label: 'Loading PDF document…',
  });

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Quick structural header check before invoking PDF.js
  if (bytes.byteLength < 5) {
    return {
      title,
      fileName: file.name,
      fileType: 'pdf',
      extension: '.pdf',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'pages',
      detectedSource,
      status: 'error',
      statusMessage:
        'Malformed or corrupted PDF file: file is too small to contain a valid PDF header.',
    };
  }

  const headerAscii = String.fromCharCode(
    ...bytes.slice(0, Math.min(bytes.byteLength, 1024))
  );
  if (!headerAscii.includes('%PDF-')) {
    return {
      title,
      fileName: file.name,
      fileType: 'pdf',
      extension: '.pdf',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'pages',
      detectedSource,
      status: 'error',
      statusMessage:
        'Malformed or corrupted PDF file: missing %PDF- document header.',
    };
  }

  const pdfjsLib = await import('pdfjs-dist');
  configurePdfWorker(pdfjsLib);

  let pdf: any;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: bytes,
      useSystemFonts: true,
      disableFontFace: true,
    });
    pdf = await loadingTask.promise;
  } catch (err: any) {
    const rawMsg = err?.message || 'Unable to parse PDF structure';
    return {
      title,
      fileName: file.name,
      fileType: 'pdf',
      extension: '.pdf',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'pages',
      detectedSource,
      status: 'error',
      statusMessage: `Malformed or corrupted PDF file: ${rawMsg}`,
    };
  }

  const numPages = pdf?.numPages || 0;
  if (numPages === 0) {
    return {
      title,
      fileName: file.name,
      fileType: 'pdf',
      extension: '.pdf',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'pages',
      detectedSource,
      status: 'error',
      statusMessage: 'Malformed PDF file: document contains 0 pages.',
    };
  }

  const pageTexts: string[] = [];
  let pageReadErrors = 0;

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
      pageReadErrors++;
    }
  }

  try {
    await pdf.destroy?.();
  } catch {}

  const fullText = pageTexts.join('\n\n').trim();

  if (!fullText) {
    const isCorruptedPages = pageReadErrors === numPages;
    return {
      title,
      fileName: file.name,
      fileType: 'pdf',
      extension: '.pdf',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: numPages,
      itemUnitLabel: numPages === 1 ? 'page' : 'pages',
      detectedSource,
      status: 'error',
      statusMessage: isCorruptedPages
        ? 'Malformed PDF file: failed to read page streams.'
        : 'Scanned or image-only PDF: no extractable text layer found. Run OCR before importing.',
    };
  }

  return {
    title,
    fileName: file.name,
    fileType: 'pdf',
    extension: '.pdf',
    sizeBytes: file.size,
    text: fullText,
    pageOrItemCount: numPages,
    itemUnitLabel: numPages === 1 ? 'page' : 'pages',
    detectedSource: detectSourceFromFileName(file.name, fullText) || detectedSource,
    status: 'success',
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

// Excel (.xlsx, .xls) Extraction using safe `read-excel-file`
async function extractXlsx(
  file: File,
  detectedSource: AISource,
  onProgress?: ExtractionProgressCallback
): Promise<ExtractedFileResult> {
  const title = cleanTitleFromFileName(file.name);
  const extension = '.' + (file.name.split('.').pop() || 'xlsx').toLowerCase();

  // 1. Reject unsupported legacy binary .xls files with clear conversion instructions
  if (extension === '.xls') {
    return {
      title,
      fileName: file.name,
      fileType: 'xlsx',
      extension: '.xls',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'sheets',
      detectedSource,
      status: 'error',
      statusMessage:
        'Unsupported legacy .xls binary spreadsheet format. Please open this file in Microsoft Excel, Apple Numbers, or Google Sheets and save/export it as .xlsx before importing.',
    };
  }

  // 2. Guard against oversized spreadsheets
  if (file.size > MAX_XLSX_FILE_SIZE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    const maxMb = (MAX_XLSX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(1);
    return {
      title,
      fileName: file.name,
      fileType: 'xlsx',
      extension: '.xlsx',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'sheets',
      detectedSource,
      status: 'error',
      statusMessage: `Oversized spreadsheet (${mb} MB exceeds ${maxMb} MB limit). Export individual sheets or reduce file size before importing.`,
    };
  }

  onProgress?.({
    mode: 'indeterminate',
    phase: 'extracting',
    label: 'Reading .xlsx workbook…',
  });

  const arrayBuffer = await file.arrayBuffer();
  const headerBytes = new Uint8Array(arrayBuffer.slice(0, 8));

  // Detect OLE2 Compound Document header (0xD0 0xCF 0x11 0xE0) renamed as .xlsx
  if (
    headerBytes.length >= 4 &&
    headerBytes[0] === 0xd0 &&
    headerBytes[1] === 0xcf &&
    headerBytes[2] === 0x11 &&
    headerBytes[3] === 0xe0
  ) {
    return {
      title,
      fileName: file.name,
      fileType: 'xlsx',
      extension,
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'sheets',
      detectedSource,
      status: 'error',
      statusMessage:
        'Unsupported legacy .xls binary spreadsheet detected (file uses OLE2 format). Please open it in Excel or Google Sheets and save it as .xlsx before importing.',
    };
  }

  // Verify ZIP/OOXML magic header (PK\x03\x04)
  if (
    headerBytes.length < 4 ||
    headerBytes[0] !== 0x50 ||
    headerBytes[1] !== 0x4b
  ) {
    return {
      title,
      fileName: file.name,
      fileType: 'xlsx',
      extension,
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'sheets',
      detectedSource,
      status: 'error',
      statusMessage:
        'Malformed or corrupted .xlsx file: file is not a valid OpenXML workbook archive.',
    };
  }

  let sheets: { sheet: string; data: any[][] }[] = [];
  try {
    const readXlsxModule = await import('read-excel-file/universal');
    const readXlsxFile =
      (readXlsxModule as any).default || readXlsxModule;
    sheets = await readXlsxFile(arrayBuffer);
  } catch (err: any) {
    const detail = err?.message || 'Unable to parse workbook XML structure';
    return {
      title,
      fileName: file.name,
      fileType: 'xlsx',
      extension,
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'sheets',
      detectedSource,
      status: 'error',
      statusMessage: `Malformed or corrupted .xlsx file: ${detail}`,
    };
  }

  const totalSheetCount = Array.isArray(sheets) ? sheets.length : 0;
  if (totalSheetCount === 0) {
    return {
      title,
      fileName: file.name,
      fileType: 'xlsx',
      extension,
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'sheets',
      detectedSource,
      status: 'warning',
      statusMessage: 'Spreadsheet is empty (no sheets found).',
    };
  }

  const boundedSheets = sheets.slice(0, MAX_XLSX_SHEETS);
  const truncationNotices: string[] = [];

  if (totalSheetCount > MAX_XLSX_SHEETS) {
    truncationNotices.push(
      `omitted ${totalSheetCount - MAX_XLSX_SHEETS} additional sheet(s) beyond ${MAX_XLSX_SHEETS}-sheet limit`
    );
  }

  const parts: string[] = [];
  let totalIncludedRows = 0;
  let stoppedByTotalRowLimit = false;

  for (let idx = 0; idx < boundedSheets.length; idx++) {
    const sheetObj = boundedSheets[idx];
    const sheetName = sheetObj.sheet || `Sheet ${idx + 1}`;
    const rawRows = Array.isArray(sheetObj.data) ? sheetObj.data : [];

    onProgress?.({
      mode: 'determinate',
      phase: 'extracting',
      current: idx + 1,
      total: boundedSheets.length,
      unit: boundedSheets.length === 1 ? 'sheet' : 'sheets',
      label: 'Extracting sheets',
    });

    const nonEmptyRows: string[] = [];
    let sheetOmittedRows = 0;
    let sheetOmittedCols = false;

    for (const row of rawRows) {
      if (!Array.isArray(row)) continue;
      const formattedCells = row
        .slice(0, MAX_XLSX_COLUMNS_PER_ROW)
        .map((cell) => {
          if (cell === null || cell === undefined) return '';
          if (cell instanceof Date) return cell.toISOString().slice(0, 10);
          return String(cell).replace(/\s+/g, ' ').trim();
        });

      if (row.length > MAX_XLSX_COLUMNS_PER_ROW) {
        sheetOmittedCols = true;
      }

      if (!formattedCells.some((c) => c.length > 0)) {
        continue;
      }

      if (nonEmptyRows.length >= MAX_XLSX_ROWS_PER_SHEET) {
        sheetOmittedRows++;
        continue;
      }

      if (totalIncludedRows >= MAX_XLSX_TOTAL_ROWS) {
        sheetOmittedRows++;
        stoppedByTotalRowLimit = true;
        continue;
      }

      nonEmptyRows.push(formattedCells.join(' | ').replace(/(?:\s*\|\s*)+$/, ''));
      totalIncludedRows++;
    }

    if (sheetOmittedCols) {
      truncationNotices.push(
        `capped "${sheetName}" at ${MAX_XLSX_COLUMNS_PER_ROW} columns per row`
      );
    }

    if (sheetOmittedRows > 0) {
      truncationNotices.push(
        `truncated ${sheetOmittedRows} row(s) in "${sheetName}"`
      );
    }

    if (nonEmptyRows.length > 0) {
      const sheetFooter =
        sheetOmittedRows > 0
          ? `\n\n[Truncated: ${sheetOmittedRows} additional row(s) omitted in "${sheetName}"]`
          : '';
      parts.push(
        `## Sheet: ${sheetName}\n\n${nonEmptyRows.join('\n')}${sheetFooter}`
      );
    }

    if (stoppedByTotalRowLimit) {
      break;
    }
  }

  const fullText = parts.join('\n\n').trim();
  const wasTruncated = truncationNotices.length > 0;

  return {
    title,
    fileName: file.name,
    fileType: 'xlsx',
    extension,
    sizeBytes: file.size,
    text: fullText,
    pageOrItemCount: boundedSheets.length,
    itemUnitLabel: boundedSheets.length === 1 ? 'sheet' : 'sheets',
    detectedSource:
      detectSourceFromFileName(file.name, fullText) || detectedSource,
    status: !fullText ? 'warning' : wasTruncated ? 'warning' : 'success',
    statusMessage: !fullText
      ? 'Spreadsheet is empty'
      : wasTruncated
      ? `Spreadsheet truncated for safety: ${truncationNotices.join('; ')}.`
      : undefined,
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
