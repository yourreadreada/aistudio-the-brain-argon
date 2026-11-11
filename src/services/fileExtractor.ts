import {
  AISource,
  ExtractionStatus,
  FactFileType,
  StructuredDocumentPayload,
  inferFileTypeFromExtension,
} from '../types/brain';
export { inferFileTypeFromExtension };

export const SUPPORTED_FILE_EXTENSIONS = [
  '.zip',
  '.md',
  '.markdown',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
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
  '.svg',
  '.gif',
  '.html',
  '.htm',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.sql',
  '.sh',
  '.rs',
  '.go',
  '.java',
  '.cpp',
  '.c',
  '.css',
];

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB general limit
export const MAX_PDF_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB PDF limit
export const MAX_XLSX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB spreadsheet limit
export const MAX_XLSX_SHEETS = 20;
export const MAX_XLSX_ROWS_PER_SHEET = 500;
export const MAX_XLSX_TOTAL_ROWS = 2000;
export const MAX_XLSX_COLUMNS_PER_ROW = 50;

// Zip safety bounds
export const MAX_ZIP_RECURSION_DEPTH = 3;
export const MAX_ZIP_FILE_COUNT = 1000;
export const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 500 * 1024 * 1024; // 500 MB

export interface ExtractedFileResult {
  title: string;
  fileName: string;
  filePath?: string;
  sourceFolder?: string;
  fileType?: FactFileType;
  archiveParent?: string;
  extension: string;
  sizeBytes: number;
  text: string;
  pageOrItemCount?: number;
  itemUnitLabel?: string;
  detectedSource: AISource;
  sourceAttributionBasis?:
    | 'folder_path'
    | 'explicit_header'
    | 'filename'
    | 'content_heuristic'
    | 'manual_override';
  status: 'success' | 'warning' | 'error';
  extractionStatus?: ExtractionStatus;
  extractionWarnings?: string[];
  statusMessage?: string;
  originalCreatedAt?: string | null;
  importedAt?: string;
  checksum?: string;
  relatedSources?: AISource[];
  fixtureId?: string;
  topicKey?: string;
  extractedTags?: string[];
  structuredData?: StructuredDocumentPayload;
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
  yaml: 'YAML',
  yml: 'YML',
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
  'yaml',
  'yml',
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
  'sh',
  'html',
  'htm',
  'css',
]);

/**
 * Formats a raw filename or title into readable Title Case without mutating
 * the underlying filename or path identity.
 */
export function formatReadableTitle(rawInput: string): string {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return 'Untitled Document';

  const baseSegment = trimmed.split(/[\\/]/).pop() || trimmed;

  const extMatch = baseSegment.match(/^(.+)\.([a-zA-Z0-9]{1,8})$/);
  const withoutExt =
    extMatch && KNOWN_STRIPPABLE_EXTENSIONS.has(extMatch[2].toLowerCase())
      ? extMatch[1]
      : baseSegment;

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

      const leadPunctMatch = word.match(/^([([{"']+)(.*)$/);
      const leadPunct = leadPunctMatch ? leadPunctMatch[1] : '';
      const restAfterLead = leadPunctMatch ? leadPunctMatch[2] : word;

      const trailPunctMatch = restAfterLead.match(/^(.*?)([)\]}"',.:;!?]+)$/);
      const core = trailPunctMatch ? trailPunctMatch[1] : restAfterLead;
      const trailPunct = trailPunctMatch ? trailPunctMatch[2] : '';

      if (!core) return word;

      const lower = core.toLowerCase();

      if (KNOWN_ACRONYMS[lower]) {
        return `${leadPunct}${KNOWN_ACRONYMS[lower]}${trailPunct}`;
      }

      if (/^v\d+(\.\d+)*$/i.test(core)) {
        return `${leadPunct}V${core.slice(1)}${trailPunct}`;
      }

      if (/[a-z]/.test(core) && /[A-Z]/.test(core.slice(1))) {
        return `${leadPunct}${core}${trailPunct}`;
      }

      const isEntireInputUpper =
        normalizedWords === normalizedWords.toUpperCase() &&
        /[A-Z]/.test(normalizedWords);
      if (!isEntireInputUpper && /^[A-Z0-9]{2,4}$/.test(core)) {
        return `${leadPunct}${core}${trailPunct}`;
      }

      if (idx > 0 && idx < total - 1 && MINOR_TITLE_WORDS.has(lower)) {
        return `${leadPunct}${lower}${trailPunct}`;
      }

      const titled = lower.charAt(0).toUpperCase() + lower.slice(1);
      return `${leadPunct}${titled}${trailPunct}`;
    })
    .join(' ');
}

export function cleanTitleFromFileName(fileName: string): string {
  return formatReadableTitle(fileName);
}

/**
 * Maps a raw provider token, folder name, or label to a canonical AISource.
 */
export function normalizeSourceToken(token: string): AISource | null {
  const clean = (token || '').trim().toLowerCase();
  if (!clean) return null;

  if (
    clean === '01_claude' ||
    clean === 'claude' ||
    clean === 'anthropic' ||
    clean.startsWith('01_claude') ||
    clean.includes('claude')
  ) {
    return 'claude';
  }
  if (
    clean === '02_chatgpt' ||
    clean === 'chatgpt' ||
    clean === 'gpt' ||
    clean === 'openai' ||
    clean.startsWith('02_chatgpt') ||
    clean.includes('chatgpt') ||
    clean.includes('openai')
  ) {
    return 'gpt';
  }
  if (
    clean === '03_gemini' ||
    clean === 'gemini' ||
    clean === 'google gemini' ||
    clean.startsWith('03_gemini') ||
    clean.includes('gemini')
  ) {
    return 'gemini';
  }
  if (
    clean === '04_github' ||
    clean === 'github' ||
    clean.startsWith('04_github') ||
    clean.includes('github')
  ) {
    return 'github';
  }
  if (
    clean === '05_moodle' ||
    clean === 'moodle' ||
    clean.startsWith('05_moodle') ||
    clean.includes('moodle')
  ) {
    return 'moodle';
  }
  if (
    clean === '06_cursor_antigravity' ||
    clean === '06_cursor' ||
    clean === 'cursor' ||
    clean === 'antigravity' ||
    clean === 'cursor / antigravity' ||
    clean.startsWith('06_cursor') ||
    clean.includes('cursor') ||
    clean.includes('antigravity')
  ) {
    return 'cursor';
  }
  if (
    clean === '07_local_ai_ollama' ||
    clean === '07_local_ai' ||
    clean === 'local-ai' ||
    clean === 'local_ai' ||
    clean === 'local ai' ||
    clean === 'ollama' ||
    clean === 'local ai / ollama' ||
    clean.startsWith('07_local_ai') ||
    clean.includes('local_ai') ||
    clean.includes('local-ai') ||
    clean.includes('ollama')
  ) {
    return 'local-ai';
  }
  return null;
}

/**
 * Resolves the authoritative AISource and sourceFolder from a file's path, filename, and content.
 *
 * STRICT PRECEDENCE ORDER (Section 1B):
 * 1. Folder / Path Provenance (e.g. `01_claude/...`, `02_chatgpt/...`, `03_gemini/...`, `04_github/...`, `05_moodle/...`, `06_cursor_antigravity/...`, `07_local_ai_ollama/...`)
 * 2. Explicit Header / Metadata (`Primary Source: ...` or JSON `"primary_source"`)
 * 3. Filename explicit provider token
 * 4. Content heuristics (ONLY if path, header, and filename have no provider indicator)
 */
export function resolveSourceFromProvenance(
  filePath?: string,
  fileName?: string,
  textSample: string = '',
  fallbackSource: AISource = 'claude'
): {
  source: AISource;
  sourceFolder?: string;
  basis:
    | 'folder_path'
    | 'explicit_header'
    | 'filename'
    | 'content_heuristic';
  confidence: 'folder' | 'header' | 'filename' | 'content';
} {
  const effectivePath = (filePath || fileName || '').replace(/\\/g, '/').trim();
  const segments = effectivePath
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  // 1. Check directory segments (all segments before the filename, or any numbered corpus folder)
  const dirSegments = segments.length > 1 ? segments.slice(0, -1) : [];
  for (const seg of dirSegments) {
    const matched = normalizeSourceToken(seg);
    if (matched) {
      return {
        source: matched,
        sourceFolder: seg,
        basis: 'folder_path',
        confidence: 'folder',
      };
    }
  }

  // 2. Check explicit metadata header in content (e.g. `- **Primary Source:** 03_gemini` or `Primary Source: GitHub`)
  const headerSlice = (textSample || '').slice(0, 2500);
  const primaryHeaderMatch =
    headerSlice.match(/(?:\*\*Primary Source:\*\*|Primary Source:)\s*([^\n\r]+)/i) ||
    headerSlice.match(/"primary_source"\s*:\s*"([^"]+)"/i) ||
    headerSlice.match(/"source_folder"\s*:\s*"([^"]+)"/i);

  if (primaryHeaderMatch && primaryHeaderMatch[1]) {
    const rawHeaderVal = primaryHeaderMatch[1].replace(/[*`]/g, '').trim();
    const matched = normalizeSourceToken(rawHeaderVal);
    if (matched) {
      return {
        source: matched,
        sourceFolder: dirSegments[dirSegments.length - 1] || rawHeaderVal,
        basis: 'explicit_header',
        confidence: 'header',
      };
    }
  }

  // 3. Check filename tokens (explicit provider names only)
  const baseName = (fileName || segments[segments.length - 1] || '').toLowerCase();
  if (baseName) {
    if (/\b(claude|anthropic)\b/.test(baseName)) {
      return { source: 'claude', basis: 'filename', confidence: 'filename' };
    }
    if (/\b(chatgpt|openai|gpt)\b/.test(baseName) || baseName === 'conversations.json') {
      return { source: 'gpt', basis: 'filename', confidence: 'filename' };
    }
    if (/\b(gemini|aistudio)\b/.test(baseName)) {
      return { source: 'gemini', basis: 'filename', confidence: 'filename' };
    }
    if (/\b(github)\b/.test(baseName)) {
      return { source: 'github', basis: 'filename', confidence: 'filename' };
    }
    if (/\b(moodle|syllabus)\b/.test(baseName)) {
      return { source: 'moodle', basis: 'filename', confidence: 'filename' };
    }
    if (/\b(cursor|antigravity)\b/.test(baseName)) {
      return { source: 'cursor', basis: 'filename', confidence: 'filename' };
    }
    if (/\b(ollama|local[_-]ai|llama|qwen|mistral)\b/.test(baseName)) {
      return { source: 'local-ai', basis: 'filename', confidence: 'filename' };
    }
  }

  // 4. Content heuristic fallback (whole-word matching only, when no path/header/filename matched)
  const lowerContent = headerSlice.toLowerCase();
  if (/\b(moodle|syllabus|coursework|semester exam)\b/.test(lowerContent)) {
    return { source: 'moodle', basis: 'content_heuristic', confidence: 'content' };
  }
  if (/\b(github|pull request|commit hash)\b/.test(lowerContent)) {
    return { source: 'github', basis: 'content_heuristic', confidence: 'content' };
  }
  if (/\b(chatgpt|openai)\b/.test(lowerContent)) {
    return { source: 'gpt', basis: 'content_heuristic', confidence: 'content' };
  }
  if (/\b(gemini)\b/.test(lowerContent)) {
    return { source: 'gemini', basis: 'content_heuristic', confidence: 'content' };
  }
  if (/\b(cursor|antigravity)\b/.test(lowerContent)) {
    return { source: 'cursor', basis: 'content_heuristic', confidence: 'content' };
  }
  if (/\b(ollama|local ai)\b/.test(lowerContent)) {
    return { source: 'local-ai', basis: 'content_heuristic', confidence: 'content' };
  }
  if (/\b(claude|anthropic)\b/.test(lowerContent)) {
    return { source: 'claude', basis: 'content_heuristic', confidence: 'content' };
  }

  return {
    source: fallbackSource || 'claude',
    sourceFolder: dirSegments[dirSegments.length - 1],
    basis: 'content_heuristic',
    confidence: 'content',
  };
}

/**
 * Legacy helper signature preserved for compatibility; now delegates to `resolveSourceFromProvenance`.
 */
export function detectSourceFromFileName(
  filenameOrPath: string,
  textSample: string = ''
): AISource {
  return resolveSourceFromProvenance(filenameOrPath, filenameOrPath, textSample).source;
}

/**
 * Extracts structured provenance metadata (fixtureId, relatedSources, topicKey, originalCreatedAt, tags, title)
 * from document text without inventing any fields.
 */
export function extractMetadataFromDocumentText(
  text: string,
  primarySourceOrFileName?: AISource | string
): {
  fixtureId?: string;
  relatedSources?: AISource[];
  topicKey?: string;
  originalCreatedAt?: string | null;
  tags: string[];
  title?: string;
} {
  const sample = (text || '').slice(0, 4000);
  if (!sample) return { originalCreatedAt: null, tags: [] };

  const normalizedPrimary = primarySourceOrFileName
    ? normalizeSourceToken(String(primarySourceOrFileName))
    : null;

  // 1. Fixture ID
  let fixtureId: string | undefined;
  const fixtureHeaderMatch =
    sample.match(/(?:\*\*Fixture ID:\*\*|Fixture ID:)\s*([A-Z0-9_-]+)/i) ||
    sample.match(/"fixture_id"\s*:\s*"([^"]+)"/i) ||
    sample.match(/\b(BRAIN-(?:GRAPH|CORPUS|STRESS|FIXTURE|TEST)-[A-Z0-9_-]+)\b/);
  if (fixtureHeaderMatch && fixtureHeaderMatch[1]) {
    fixtureId = fixtureHeaderMatch[1].trim();
  }

  // 2. Related Sources
  const relatedSet = new Set<AISource>();
  const relatedHeaderMatch =
    sample.match(/(?:\*\*Related Sources?:\*\*|Related Sources?:)\s*([^\n\r]+)/i) ||
    sample.match(/"related_sources"\s*:\s*\[([^\]]+)\]/i);
  if (relatedHeaderMatch && relatedHeaderMatch[1]) {
    const rawTokens = relatedHeaderMatch[1]
      .replace(/["'`*]/g, '')
      .split(/[,;|]+/);
    for (const tok of rawTokens) {
      const norm = normalizeSourceToken(tok);
      if (norm && norm !== normalizedPrimary) {
        relatedSet.add(norm);
      }
    }
  }

  // 3. Topic Key
  let topicKey: string | undefined;
  const topicMatch =
    sample.match(/(?:\*\*Topic Key:\*\*|Topic Key:)\s*([^\n\r]+)/i) ||
    sample.match(/"topic_key"\s*:\s*"([^"]+)"/i);
  if (topicMatch && topicMatch[1]) {
    topicKey = topicMatch[1].replace(/[*`]/g, '').trim().toLowerCase();
  }

  // 4. Original Document Creation Date (ONLY when explicitly present in document metadata; never invented)
  let originalCreatedAt: string | null = null;
  const dateMatch =
    sample.match(
      /(?:\*\*Original Created(?: At)?:\*\*|\*\*Document Date:\*\*|\*\*Created Date:\*\*|Original Created At:|Document Date:)\s*(\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?)/i
    ) ||
    sample.match(/"(?:original_created_at|document_date|created_date)"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"/i);
  if (dateMatch && dateMatch[1]) {
    originalCreatedAt = dateMatch[1].trim();
  }

  // 5. Explicit Tags & Heading Title
  const tags: string[] = [];
  if (topicKey) tags.push(topicKey);
  if (fixtureId) tags.push(fixtureId.toLowerCase());
  const headingMatch = sample.match(/^#\s+([^\n\r]+)/m);
  const title = headingMatch?.[1]?.trim();

  return {
    fixtureId,
    relatedSources: relatedSet.size > 0 ? Array.from(relatedSet) : undefined,
    topicKey,
    originalCreatedAt,
    tags,
    ...(title ? { title } : {}),
  };
}

/**
 * Computes deterministic 64-bit hex checksum of a string or Uint8Array synchronously.
 */
export function computeContentChecksum(
  input: string | Uint8Array
): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let h1 = 0xdeadbeef ^ bytes.length;
  let h2 = 0x41c6ce57 ^ bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    const ch = bytes[i];
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0')
  );
}

/**
 * Parses CSV or pipe-delimited Markdown table text into structured rows and columns.
 */
export function parseTabularTextToSheet(
  rawText: string,
  sheetName: string = 'Sheet 1'
): {
  name: string;
  headers: string[];
  columns: string[];
  rows: string[][];
  totalRows: number;
  totalCols: number;
} {
  const lines = (rawText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('## Sheet:'));

  if (lines.length === 0) {
    return { name: sheetName, headers: [], columns: [], rows: [], totalRows: 0, totalCols: 0 };
  }

  const isPipeDelimited = lines[0].includes('|');
  const parseLine = (line: string): string[] => {
    if (isPipeDelimited) {
      return line
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim());
    }
    // RFC-4180 style CSV line parser
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const parsedRows = lines
    .map(parseLine)
    .filter((r) => !r.every((cell) => /^[-:]+$/.test(cell))); // skip markdown separator rows

  const headers = parsedRows[0] || [];
  const dataRows = parsedRows.slice(1, 250);
  const maxCols = parsedRows.reduce((m, r) => Math.max(m, r.length), 0);

  return {
    name: sheetName,
    headers,
    columns: headers,
    rows: dataRows,
    totalRows: Math.max(0, parsedRows.length - 1),
    totalCols: maxCols,
  };
}

function countMarkdownSectionsOrTurns(text: string): {
  count: number;
  label: string;
} {
  if (
    text.includes('#### User') ||
    text.includes('#### Assistant') ||
    text.includes('**USER**:')
  ) {
    const turns = text
      .split(/(?=#### (?:User|Assistant)|\*\*(?:USER|ASSISTANT)\*\*:)/g)
      .filter(Boolean);
    return {
      count: Math.max(1, turns.length),
      label: turns.length === 1 ? 'turn' : 'turns',
    };
  }
  const headings = text.match(/^#{1,3}\s+.+$/gm);
  if (headings && headings.length > 0) {
    return {
      count: headings.length,
      label: headings.length === 1 ? 'section' : 'sections',
    };
  }
  const paras = text.split(/\n\s*\n/).filter(Boolean);
  return {
    count: Math.max(1, paras.length),
    label: paras.length === 1 ? 'block' : 'blocks',
  };
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

export interface ExtractItemsOptions {
  maxFilesPerBatch?: number;
  signal?: AbortSignal;
}

/**
 * Unpacks a file or a .zip archive into one or more ExtractedFileResult items for the Review Queue.
 */
export async function extractItemsFromFile(
  file: File,
  onProgress?: ExtractionProgressCallback,
  options?: ExtractItemsOptions
): Promise<ExtractedFileResult[]> {
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
  if (ext === '.zip') {
    return await extractZipArchive(
      file,
      onProgress,
      1,
      '',
      { filesProcessed: 0, totalBytesUnpacked: 0 },
      options
    );
  }
  const relativePath = (file as any).webkitRelativePath || file.name;
  const single = await extractTextFromFile(file, onProgress, relativePath);
  const provenance = resolveSourceFromProvenance(
    single.filePath || relativePath,
    file.name,
    single.text
  );
  const meta = extractMetadataFromDocumentText(single.text, provenance.source);
  const checksum = single.checksum || (await computeContentChecksum(single.text || file.name));

  return [
    {
      ...single,
      fileName: file.name,
      filePath: single.filePath || relativePath,
      sourceFolder: single.sourceFolder || provenance.sourceFolder,
      detectedSource: provenance.source,
      sourceAttributionBasis: provenance.basis,
      fileType: single.fileType || inferFileTypeFromExtension(single.fileName),
      fixtureId: single.fixtureId || meta.fixtureId,
      relatedSources: single.relatedSources || meta.relatedSources,
      topicKey: single.topicKey || meta.topicKey,
      originalCreatedAt:
        single.originalCreatedAt !== undefined
          ? single.originalCreatedAt
          : meta.originalCreatedAt,
      importedAt: single.importedAt || new Date().toISOString(),
      checksum,
    },
  ];
}

/**
 * Extracts plain text and structured format-aware payload from a single file.
 */
export async function extractTextFromFile(
  file: File,
  onProgress?: ExtractionProgressCallback,
  explicitRelativePath?: string
): Promise<ExtractedFileResult> {
  const fileName = file.name;
  const relativePath =
    explicitRelativePath || (file as any).webkitRelativePath || fileName;
  const title = cleanTitleFromFileName(fileName);
  const extension = '.' + (fileName.split('.').pop() || '').toLowerCase();
  const initialProvenance = resolveSourceFromProvenance(relativePath, fileName, '');
  const initialSource = initialProvenance.source;
  const sizeBytes = file.size;
  const importedAt = new Date().toISOString();

  try {
    if (extension === '.xls') {
      return await extractXlsx(file, initialSource, onProgress, relativePath);
    }

    if (
      sizeBytes > MAX_FILE_SIZE_BYTES &&
      extension !== '.pdf' &&
      extension !== '.xlsx'
    ) {
      const mb = (sizeBytes / (1024 * 1024)).toFixed(1);
      const maxMb = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(1);
      return {
        title,
        fileName,
        filePath: relativePath,
        sourceFolder: initialProvenance.sourceFolder,
        extension,
        sizeBytes,
        text: '',
        detectedSource: initialSource,
        sourceAttributionBasis: initialProvenance.basis,
        status: 'error',
        extractionStatus: 'error',
        statusMessage: `File exceeds maximum supported size (${mb} MB > ${maxMb} MB limit). Please split or compress the file before importing.`,
      };
    }

    if (extension === '.zip') {
      const items = await extractZipArchive(file, onProgress);
      if (items.length === 0) {
        return {
          title,
          fileName,
          filePath: relativePath,
          extension,
          sizeBytes,
          text: '',
          detectedSource: initialSource,
          status: 'warning',
          extractionStatus: 'warning',
          statusMessage:
            'No supported documents or conversations found inside ZIP archive.',
        };
      }
      const combinedText = items
        .map((i) => `# ${i.title}\n\n${i.text}`)
        .join('\n\n---\n\n');
      return {
        title,
        fileName,
        filePath: relativePath,
        extension,
        sizeBytes,
        text: combinedText,
        pageOrItemCount: items.length,
        itemUnitLabel: items.length === 1 ? 'document' : 'documents',
        detectedSource: items[0].detectedSource,
        status: 'success',
        extractionStatus: 'success',
      };
    }

    // 1. CSV files (with structured table grid extraction)
    if (extension === '.csv') {
      onProgress?.({
        mode: 'indeterminate',
        phase: 'extracting',
        label: 'Parsing CSV table…',
      });
      const rawCsv = (await file.text()).trim();
      const sheet = parseTabularTextToSheet(rawCsv, fileName);
      const formattedRows = [
        sheet.headers.join(' | '),
        ...sheet.rows.map((r) => r.join(' | ')),
      ].filter(Boolean);
      const text = `## Sheet: ${fileName}\n\n${formattedRows.join('\n')}`.trim();
      const prov = resolveSourceFromProvenance(relativePath, fileName, rawCsv);
      const meta = extractMetadataFromDocumentText(rawCsv, prov.source);
      const checksum = await computeContentChecksum(rawCsv);

      return {
        title,
        fileName,
        filePath: relativePath,
        sourceFolder: prov.sourceFolder,
        fileType: 'xlsx',
        extension,
        sizeBytes,
        text: rawCsv ? text : '',
        pageOrItemCount: sheet.totalRows || 1,
        itemUnitLabel: sheet.totalRows === 1 ? 'row' : 'rows',
        detectedSource: prov.source,
        sourceAttributionBasis: prov.basis,
        status: rawCsv ? 'success' : 'warning',
        extractionStatus: rawCsv ? 'success' : 'warning',
        statusMessage: rawCsv ? undefined : 'CSV file is empty',
        checksum,
        importedAt,
        ...meta,
        structuredData: {
          format: 'csv',
          sheets: [sheet],
        },
      };
    }

    // 2. HTML files
    if (['.html', '.htm'].includes(extension)) {
      onProgress?.({
        mode: 'indeterminate',
        phase: 'extracting',
        label: 'Extracting HTML document…',
      });
      const rawHtml = await file.text();
      let readableText = rawHtml;
      let extractedTitle = title;
      if (typeof DOMParser !== 'undefined') {
        const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
        doc
          .querySelectorAll('script, style, noscript')
          .forEach((el) => el.remove());
        const docTitle = doc.querySelector('title')?.textContent?.trim();
        if (docTitle) extractedTitle = formatReadableTitle(docTitle);
        readableText = (doc.body?.textContent || rawHtml)
          .replace(/\s+/g, ' ')
          .trim();
      } else {
        readableText = rawHtml
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      const prov = resolveSourceFromProvenance(
        relativePath,
        fileName,
        readableText
      );
      const meta = extractMetadataFromDocumentText(readableText, prov.source);
      const checksum = await computeContentChecksum(rawHtml);

      return {
        title: extractedTitle,
        fileName,
        filePath: relativePath,
        sourceFolder: prov.sourceFolder,
        fileType: 'code',
        extension,
        sizeBytes,
        text: readableText,
        pageOrItemCount: 1,
        itemUnitLabel: 'HTML page',
        detectedSource: prov.source,
        sourceAttributionBasis: prov.basis,
        status: readableText ? 'success' : 'warning',
        extractionStatus: readableText ? 'success' : 'warning',
        checksum,
        importedAt,
        ...meta,
        structuredData: {
          format: 'html',
          htmlPreviewText: readableText,
          codeMeta: {
            language: 'html',
            lineCount: rawHtml.split(/\r?\n/).length,
          },
        },
      };
    }

    // 3. Source Code & YAML files
    if (
      [
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.py',
        '.sql',
        '.sh',
        '.rs',
        '.go',
        '.java',
        '.cpp',
        '.c',
        '.css',
        '.yaml',
        '.yml',
      ].includes(extension)
    ) {
      onProgress?.({
        mode: 'indeterminate',
        phase: 'extracting',
        label: 'Reading source code…',
      });
      const codeText = (await file.text()).trim();
      const prov = resolveSourceFromProvenance(relativePath, fileName, codeText);
      const meta = extractMetadataFromDocumentText(codeText, prov.source);
      const checksum = await computeContentChecksum(codeText);
      const lineCount = codeText ? codeText.split(/\r?\n/).length : 0;

      return {
        title,
        fileName,
        filePath: relativePath,
        sourceFolder: prov.sourceFolder,
        fileType: 'code',
        extension,
        sizeBytes,
        text: codeText,
        pageOrItemCount: lineCount || 1,
        itemUnitLabel: lineCount === 1 ? 'line' : 'lines',
        detectedSource: prov.source,
        sourceAttributionBasis: prov.basis,
        status: codeText ? 'success' : 'warning',
        extractionStatus: codeText ? 'success' : 'warning',
        statusMessage: codeText ? undefined : 'Source file is empty',
        checksum,
        importedAt,
        ...meta,
        structuredData: {
          format: extension.slice(1),
          codeMeta: {
            language: extension.slice(1),
            lineCount,
          },
        },
      };
    }

    // 4. Markdown or Plain Text
    if (['.md', '.markdown', '.txt'].includes(extension)) {
      onProgress?.({
        mode: 'indeterminate',
        phase: 'extracting',
        label: 'Reading text document…',
      });
      const text = (await file.text()).trim();
      const prov = resolveSourceFromProvenance(relativePath, fileName, text);
      const meta = extractMetadataFromDocumentText(text, prov.source);
      const checksum = await computeContentChecksum(text);
      const stats = countMarkdownSectionsOrTurns(text);

      return {
        title,
        fileName,
        filePath: relativePath,
        sourceFolder: prov.sourceFolder,
        fileType: 'md',
        extension,
        sizeBytes,
        text,
        pageOrItemCount: stats.count,
        itemUnitLabel: stats.label,
        detectedSource: prov.source,
        sourceAttributionBasis: prov.basis,
        status: text ? 'success' : 'warning',
        extractionStatus: text ? 'success' : 'warning',
        statusMessage: text ? undefined : 'File is empty',
        checksum,
        importedAt,
        ...meta,
      };
    }

    // 5. JSON Chat Exports or Structured JSON
    if (extension === '.json') {
      onProgress?.({
        mode: 'indeterminate',
        phase: 'extracting',
        label: 'Parsing JSON payload…',
      });
      const rawText = await file.text();
      const checksum = await computeContentChecksum(rawText);
      try {
        const parsed = JSON.parse(rawText);
        const extracted = extractChatFromJson(parsed, fileName, onProgress);
        const effectiveText = extracted.text || rawText.trim();
        const prov = resolveSourceFromProvenance(
          relativePath,
          fileName,
          effectiveText
        );
        // Folder path or explicit header wins over generic JSON format detection
        const finalSource =
          prov.basis === 'folder_path' || prov.basis === 'explicit_header'
            ? prov.source
            : extracted.detectedSource || prov.source;
        const meta = extractMetadataFromDocumentText(effectiveText, finalSource);

        return {
          title: extracted.title
            ? formatReadableTitle(extracted.title)
            : title,
          fileName,
          filePath: relativePath,
          sourceFolder: prov.sourceFolder,
          fileType: extracted.text ? 'chat' : 'code',
          extension,
          sizeBytes,
          text: effectiveText,
          pageOrItemCount: extracted.conversationCount || 1,
          itemUnitLabel: extracted.text
            ? (extracted.conversationCount || 1) === 1
              ? 'conversation'
              : 'conversations'
            : 'JSON object',
          detectedSource: finalSource,
          sourceAttributionBasis: prov.basis,
          status: 'success',
          extractionStatus: 'success',
          checksum,
          importedAt,
          ...meta,
          structuredData: {
            format: 'json',
            jsonStructure: parsed,
            codeMeta: {
              language: 'json',
              lineCount: rawText.split(/\r?\n/).length,
            },
          },
        };
      } catch (jsonErr: any) {
        const prov = resolveSourceFromProvenance(
          relativePath,
          fileName,
          rawText
        );
        return {
          title,
          fileName,
          filePath: relativePath,
          sourceFolder: prov.sourceFolder,
          fileType: 'code',
          extension,
          sizeBytes,
          text: rawText.trim(),
          pageOrItemCount: 1,
          itemUnitLabel: 'document',
          detectedSource: prov.source,
          sourceAttributionBasis: prov.basis,
          status: rawText.trim() ? 'warning' : 'error',
          extractionStatus: rawText.trim() ? 'warning' : 'error',
          extractionWarnings: [
            `Malformed JSON syntax (${jsonErr?.message || 'parse error'}); stored as raw text`,
          ],
          statusMessage: rawText.trim()
            ? 'Malformed JSON syntax — extracted raw text'
            : 'Empty or corrupted JSON file',
          checksum,
          importedAt,
        };
      }
    }

    // 6. PDF Documents
    if (extension === '.pdf') {
      return await extractPdf(file, initialSource, onProgress, relativePath);
    }

    // 7. Microsoft Word Documents (.docx)
    if (extension === '.docx') {
      return await extractDocx(file, initialSource, onProgress, relativePath);
    }

    // 8. Microsoft Excel Spreadsheets (.xlsx, .xls)
    if (['.xlsx', '.xls'].includes(extension)) {
      return await extractXlsx(file, initialSource, onProgress, relativePath);
    }

    // 9. Microsoft PowerPoint Presentations (.pptx)
    if (extension === '.pptx') {
      return await extractPptx(file, initialSource, onProgress, relativePath);
    }

    // 10. Images
    if (
      ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'].includes(extension)
    ) {
      onProgress?.({
        mode: 'indeterminate',
        phase: 'extracting',
        label: 'Inspecting image metadata…',
      });
      return await extractImageInfo(file, initialSource, relativePath);
    }

    return {
      title,
      fileName,
      filePath: relativePath,
      sourceFolder: initialProvenance.sourceFolder,
      extension,
      sizeBytes,
      text: '',
      detectedSource: initialSource,
      sourceAttributionBasis: initialProvenance.basis,
      status: 'error',
      extractionStatus: 'error',
      statusMessage: `Unsupported file format '${extension}'. Supported: .zip, .pdf, .docx, .xlsx, .pptx, .md, .txt, .json, .yaml, .csv, .html, code, images`,
    };
  } catch (err: any) {
    return {
      title,
      fileName,
      filePath: relativePath,
      sourceFolder: initialProvenance.sourceFolder,
      extension,
      sizeBytes,
      text: '',
      detectedSource: initialSource,
      sourceAttributionBasis: initialProvenance.basis,
      status: 'error',
      extractionStatus: 'error',
      statusMessage: err?.message || 'Failed to extract text from file',
    };
  }
}

/**
 * Unpacks a .zip archive (including nested .zip archives up to MAX_ZIP_RECURSION_DEPTH)
 * while enforcing file-count and total uncompressed byte limits and isolating per-file errors.
 */
async function extractZipArchive(
  zipFile: File,
  onProgress?: ExtractionProgressCallback,
  currentDepth: number = 1,
  parentPathPrefix: string = '',
  sharedCounters: { filesProcessed: number; totalBytesUnpacked: number } = {
    filesProcessed: 0,
    totalBytesUnpacked: 0,
  },
  options?: ExtractItemsOptions
): Promise<ExtractedFileResult[]> {
  const effectiveMaxFiles = Math.max(
    1,
    Math.min(5000, Math.floor(Number(options?.maxFilesPerBatch) || MAX_ZIP_FILE_COUNT))
  );
  onProgress?.({
    mode: 'indeterminate',
    phase: 'extracting',
    label: `Reading ZIP archive index (${zipFile.name})…`,
  });

  const JSZipModule = await import('jszip');
  const JSZip = (JSZipModule as any).default || JSZipModule;

  let zip: any;
  try {
    const arrayBuffer = await zipFile.arrayBuffer();
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch (err: any) {
    return [
      {
        title: cleanTitleFromFileName(zipFile.name),
        fileName: zipFile.name,
        filePath: parentPathPrefix
          ? `${parentPathPrefix}/${zipFile.name}`
          : zipFile.name,
        extension: '.zip',
        sizeBytes: zipFile.size,
        text: '',
        detectedSource: detectSourceFromFileName(zipFile.name),
        status: 'error',
        extractionStatus: 'error',
        statusMessage: `Corrupted or unreadable ZIP archive: ${
          err?.message || 'invalid zip header'
        }`,
      },
    ];
  }

  const results: ExtractedFileResult[] = [];
  const allEntries = Object.keys(zip.files);

  const validPaths = allEntries.filter((relativePath) => {
    const zipEntry = zip.files[relativePath];
    if (!zipEntry || zipEntry.dir) return false;
    if (
      relativePath.includes('__MACOSX') ||
      relativePath.split('/').pop()?.startsWith('.')
    ) {
      return false;
    }
    const baseName = relativePath.split('/').pop() || relativePath;
    const ext = '.' + (baseName.split('.').pop() || '').toLowerCase();
    return SUPPORTED_FILE_EXTENSIONS.includes(ext);
  });

  const totalFiles = validPaths.length;

  for (let idx = 0; idx < validPaths.length; idx++) {
    if (options?.signal?.aborted) {
      break;
    }
    if (idx > 0 && idx % 25 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (sharedCounters.filesProcessed >= effectiveMaxFiles) {
      results.push({
        title: 'Archive File Count Limit Reached',
        fileName: zipFile.name,
        filePath: parentPathPrefix || zipFile.name,
        extension: '.zip',
        sizeBytes: 0,
        text: '',
        detectedSource: 'claude',
        status: 'warning',
        extractionStatus: 'warning',
        statusMessage: `Stopped unpacking after ${effectiveMaxFiles} files (configured batch limit). Remaining ${
          validPaths.length - idx
        } file(s) skipped.`,
      });
      break;
    }

    const relativePath = validPaths[idx];
    const fullArchivePath = parentPathPrefix
      ? `${parentPathPrefix}/${relativePath}`
      : relativePath;
    const zipEntry = zip.files[relativePath];
    const baseName = relativePath.split('/').pop() || relativePath;
    const ext = '.' + (baseName.split('.').pop() || '').toLowerCase();

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
      sharedCounters.totalBytesUnpacked += blob.size;
      sharedCounters.filesProcessed += 1;

      if (
        sharedCounters.totalBytesUnpacked > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES
      ) {
        results.push({
          title: cleanTitleFromFileName(baseName),
          fileName: baseName,
          filePath: fullArchivePath,
          extension: ext,
          sizeBytes: blob.size,
          text: '',
          detectedSource: resolveSourceFromProvenance(fullArchivePath, baseName)
            .source,
          status: 'error',
          extractionStatus: 'error',
          statusMessage: `ZIP decompression limit exceeded (${Math.round(
            MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES / (1024 * 1024)
          )} MB max).`,
        });
        break;
      }

      const innerFile = new File([blob], baseName, { type: blob.type });

      // Handle nested .zip archives recursively up to MAX_ZIP_RECURSION_DEPTH
      if (ext === '.zip') {
        if (currentDepth >= MAX_ZIP_RECURSION_DEPTH) {
          results.push({
            title: cleanTitleFromFileName(baseName),
            fileName: baseName,
            filePath: fullArchivePath,
            extension: '.zip',
            sizeBytes: blob.size,
            text: '',
            detectedSource: resolveSourceFromProvenance(
              fullArchivePath,
              baseName
            ).source,
            status: 'warning',
            extractionStatus: 'warning',
            statusMessage: `Skipped nested ZIP archive beyond max depth (${MAX_ZIP_RECURSION_DEPTH}).`,
          });
          continue;
        }
        const nestedResults = await extractZipArchive(
          innerFile,
          onProgress,
          currentDepth + 1,
          fullArchivePath.replace(/\.zip$/i, ''),
          sharedCounters,
          options
        );
        results.push(...nestedResults);
        continue;
      }

      // Extract inner file while passing fullArchivePath so folder provenance (01_claude, 02_chatgpt, etc.) is preserved!
      const extracted = await extractTextFromFile(
        innerFile,
        undefined,
        fullArchivePath
      );
      const provenance = resolveSourceFromProvenance(
        fullArchivePath,
        baseName,
        extracted.text
      );
      const meta = extractMetadataFromDocumentText(
        extracted.text,
        provenance.source
      );
      const checksum =
        extracted.checksum ||
        (await computeContentChecksum(extracted.text || baseName));

      if (extracted.text.trim() || extracted.status === 'error' || extracted.status === 'warning') {
        results.push({
          ...extracted,
          fileName: baseName,
          filePath: fullArchivePath,
          sourceFolder: provenance.sourceFolder,
          detectedSource: provenance.source,
          sourceAttributionBasis: provenance.basis,
          fileType: extracted.fileType || inferFileTypeFromExtension(baseName),
          archiveParent: zipFile.name,
          fixtureId: extracted.fixtureId || meta.fixtureId,
          relatedSources: extracted.relatedSources || meta.relatedSources,
          topicKey: extracted.topicKey || meta.topicKey,
          originalCreatedAt:
            extracted.originalCreatedAt !== undefined
              ? extracted.originalCreatedAt
              : meta.originalCreatedAt,
          importedAt: extracted.importedAt || new Date().toISOString(),
          checksum,
        });
      }
    } catch (innerErr: any) {
      const prov = resolveSourceFromProvenance(fullArchivePath, baseName);
      results.push({
        title: cleanTitleFromFileName(baseName),
        fileName: baseName,
        filePath: fullArchivePath,
        sourceFolder: prov.sourceFolder,
        fileType: inferFileTypeFromExtension(baseName),
        archiveParent: zipFile.name,
        extension: ext,
        sizeBytes: 0,
        text: '',
        detectedSource: prov.source,
        sourceAttributionBasis: prov.basis,
        status: 'error',
        extractionStatus: 'error',
        statusMessage:
          innerErr?.message || `Failed to unpack ${baseName} from archive`,
      });
    }
  }

  return results;
}

/**
 * PDF Extraction using local/package pdfjs-dist worker.
 * Preserves per-page structured text and explicit OCR status.
 */
async function extractPdf(
  file: File,
  initialSource: AISource,
  onProgress?: ExtractionProgressCallback,
  relativePath?: string
): Promise<ExtractedFileResult> {
  const title = cleanTitleFromFileName(file.name);
  const effectivePath = relativePath || file.name;
  const initialProv = resolveSourceFromProvenance(effectivePath, file.name, '');

  if (file.size > MAX_PDF_FILE_SIZE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    const maxMb = (MAX_PDF_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(1);
    return {
      title,
      fileName: file.name,
      filePath: effectivePath,
      sourceFolder: initialProv.sourceFolder,
      fileType: 'pdf',
      extension: '.pdf',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'pages',
      detectedSource: initialProv.source,
      sourceAttributionBasis: initialProv.basis,
      status: 'error',
      extractionStatus: 'error',
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
  const checksum = await computeContentChecksum(bytes);

  if (bytes.byteLength < 5) {
    return {
      title,
      fileName: file.name,
      filePath: effectivePath,
      sourceFolder: initialProv.sourceFolder,
      fileType: 'pdf',
      extension: '.pdf',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'pages',
      detectedSource: initialProv.source,
      sourceAttributionBasis: initialProv.basis,
      status: 'error',
      extractionStatus: 'error',
      checksum,
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
      filePath: effectivePath,
      sourceFolder: initialProv.sourceFolder,
      fileType: 'pdf',
      extension: '.pdf',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'pages',
      detectedSource: initialProv.source,
      sourceAttributionBasis: initialProv.basis,
      status: 'error',
      extractionStatus: 'error',
      checksum,
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
      filePath: effectivePath,
      sourceFolder: initialProv.sourceFolder,
      fileType: 'pdf',
      extension: '.pdf',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'pages',
      detectedSource: initialProv.source,
      sourceAttributionBasis: initialProv.basis,
      status: 'error',
      extractionStatus: 'error',
      checksum,
      statusMessage: `Malformed or corrupted PDF file: ${rawMsg}`,
    };
  }

  const numPages = pdf?.numPages || 0;
  if (numPages === 0) {
    return {
      title,
      fileName: file.name,
      filePath: effectivePath,
      sourceFolder: initialProv.sourceFolder,
      fileType: 'pdf',
      extension: '.pdf',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'pages',
      detectedSource: initialProv.source,
      sourceAttributionBasis: initialProv.basis,
      status: 'error',
      extractionStatus: 'error',
      checksum,
      statusMessage: 'Malformed PDF file: document contains 0 pages.',
    };
  }

  const pageTexts: string[] = [];
  const structuredPages: Array<{ pageNumber: number; text: string }> = [];
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
      structuredPages.push({
        pageNumber: i,
        text: combinedText || '[No embedded text on this page]',
      });
      if (combinedText) {
        pageTexts.push(`## Page ${i}\n\n${combinedText}`);
      }
    } catch {
      pageReadErrors++;
      structuredPages.push({
        pageNumber: i,
        text: '[Page stream unreadable]',
      });
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
      filePath: effectivePath,
      sourceFolder: initialProv.sourceFolder,
      fileType: 'pdf',
      extension: '.pdf',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: numPages,
      itemUnitLabel: numPages === 1 ? 'page' : 'pages',
      detectedSource: initialProv.source,
      sourceAttributionBasis: initialProv.basis,
      status: 'error',
      extractionStatus: isCorruptedPages ? 'error' : 'metadata_only',
      checksum,
      statusMessage: isCorruptedPages
        ? 'Malformed PDF file: failed to read page streams.'
        : 'Scanned or image-only PDF: no extractable text layer found (OCR not run).',
      structuredData: {
        format: 'pdf',
        pages: structuredPages,
        ocrStatus: 'not_run',
      },
    };
  }

  const prov = resolveSourceFromProvenance(effectivePath, file.name, fullText);
  const meta = extractMetadataFromDocumentText(fullText, prov.source);

  return {
    title,
    fileName: file.name,
    filePath: effectivePath,
    sourceFolder: prov.sourceFolder,
    fileType: 'pdf',
    extension: '.pdf',
    sizeBytes: file.size,
    text: fullText,
    pageOrItemCount: numPages,
    itemUnitLabel: numPages === 1 ? 'page' : 'pages',
    detectedSource: prov.source,
    sourceAttributionBasis: prov.basis,
    status: 'success',
    extractionStatus: 'success',
    checksum,
    importedAt: new Date().toISOString(),
    ...meta,
    structuredData: {
      format: 'pdf',
      pages: structuredPages,
      ocrStatus: 'embedded_text_extracted',
    },
  };
}

// Word (.docx) Extraction
async function extractDocx(
  file: File,
  initialSource: AISource,
  onProgress?: ExtractionProgressCallback,
  relativePath?: string
): Promise<ExtractedFileResult> {
  const effectivePath = relativePath || file.name;
  onProgress?.({
    mode: 'indeterminate',
    phase: 'extracting',
    label: 'Extracting Word document…',
  });
  const mammothModule = await import('mammoth');
  const mammoth = (mammothModule as any).default || mammothModule;
  const arrayBuffer = await file.arrayBuffer();
  const checksum = await computeContentChecksum(new Uint8Array(arrayBuffer));
  const result = await mammoth.extractRawText({ arrayBuffer });
  const rawText = (result.value || '').trim();
  const stats = countMarkdownSectionsOrTurns(rawText);
  const prov = resolveSourceFromProvenance(effectivePath, file.name, rawText);
  const meta = extractMetadataFromDocumentText(rawText, prov.source);

  const paragraphs = rawText
    .split(/\n\s*\n/)
    .map((p: string) => p.trim())
    .filter(Boolean);
  const headings = paragraphs
    .filter((p: string) => p.length < 90 && !p.endsWith('.'))
    .slice(0, 15)
    .map((h: string) => ({ level: 2, text: h }));

  return {
    title: cleanTitleFromFileName(file.name),
    fileName: file.name,
    filePath: effectivePath,
    sourceFolder: prov.sourceFolder,
    fileType: 'docx',
    extension: '.docx',
    sizeBytes: file.size,
    text: rawText,
    pageOrItemCount: stats.count,
    itemUnitLabel: stats.label,
    detectedSource: prov.source,
    sourceAttributionBasis: prov.basis,
    status: rawText ? 'success' : 'warning',
    extractionStatus: rawText ? 'success' : 'warning',
    statusMessage: rawText ? undefined : 'No readable text in Word document',
    checksum,
    importedAt: new Date().toISOString(),
    ...meta,
    structuredData: {
      format: 'docx',
      docxStructure: {
        headings,
        tablesCount: (rawText.match(/\|/g) || []).length > 3 ? 1 : 0,
        paragraphsCount: paragraphs.length,
      },
    },
  };
}

// Excel (.xlsx, .xls) Extraction
async function extractXlsx(
  file: File,
  initialSource: AISource,
  onProgress?: ExtractionProgressCallback,
  relativePath?: string
): Promise<ExtractedFileResult> {
  const title = cleanTitleFromFileName(file.name);
  const effectivePath = relativePath || file.name;
  const extension = '.' + (file.name.split('.').pop() || 'xlsx').toLowerCase();
  const initialProv = resolveSourceFromProvenance(effectivePath, file.name, '');

  if (extension === '.xls') {
    return {
      title,
      fileName: file.name,
      filePath: effectivePath,
      sourceFolder: initialProv.sourceFolder,
      fileType: 'xlsx',
      extension: '.xls',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'sheets',
      detectedSource: initialProv.source,
      sourceAttributionBasis: initialProv.basis,
      status: 'error',
      extractionStatus: 'error',
      statusMessage:
        'Unsupported legacy .xls binary spreadsheet format. Please open this file in Microsoft Excel, Apple Numbers, or Google Sheets and save/export it as .xlsx before importing.',
    };
  }

  if (file.size > MAX_XLSX_FILE_SIZE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    const maxMb = (MAX_XLSX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(1);
    return {
      title,
      fileName: file.name,
      filePath: effectivePath,
      sourceFolder: initialProv.sourceFolder,
      fileType: 'xlsx',
      extension: '.xlsx',
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'sheets',
      detectedSource: initialProv.source,
      sourceAttributionBasis: initialProv.basis,
      status: 'error',
      extractionStatus: 'error',
      statusMessage: `Oversized spreadsheet (${mb} MB exceeds ${maxMb} MB limit). Export individual sheets or reduce file size before importing.`,
    };
  }

  onProgress?.({
    mode: 'indeterminate',
    phase: 'extracting',
    label: 'Reading .xlsx workbook…',
  });

  const arrayBuffer = await file.arrayBuffer();
  const checksum = await computeContentChecksum(new Uint8Array(arrayBuffer));
  const headerBytes = new Uint8Array(arrayBuffer.slice(0, 8));

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
      filePath: effectivePath,
      sourceFolder: initialProv.sourceFolder,
      fileType: 'xlsx',
      extension,
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'sheets',
      detectedSource: initialProv.source,
      sourceAttributionBasis: initialProv.basis,
      status: 'error',
      extractionStatus: 'error',
      checksum,
      statusMessage:
        'Unsupported legacy .xls binary spreadsheet detected (file uses OLE2 format). Please open it in Excel or Google Sheets and save it as .xlsx before importing.',
    };
  }

  if (
    headerBytes.length < 4 ||
    headerBytes[0] !== 0x50 ||
    headerBytes[1] !== 0x4b
  ) {
    return {
      title,
      fileName: file.name,
      filePath: effectivePath,
      sourceFolder: initialProv.sourceFolder,
      fileType: 'xlsx',
      extension,
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'sheets',
      detectedSource: initialProv.source,
      sourceAttributionBasis: initialProv.basis,
      status: 'error',
      extractionStatus: 'error',
      checksum,
      statusMessage:
        'Malformed or corrupted .xlsx file: file is not a valid OpenXML workbook archive.',
    };
  }

  let sheets: { sheet: string; data: any[][] }[] = [];
  try {
    const readXlsxModule = await import('read-excel-file/universal');
    const readXlsxFile = (readXlsxModule as any).default || readXlsxModule;
    sheets = await readXlsxFile(arrayBuffer);
  } catch (err: any) {
    const detail = err?.message || 'Unable to parse workbook XML structure';
    return {
      title,
      fileName: file.name,
      filePath: effectivePath,
      sourceFolder: initialProv.sourceFolder,
      fileType: 'xlsx',
      extension,
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'sheets',
      detectedSource: initialProv.source,
      sourceAttributionBasis: initialProv.basis,
      status: 'error',
      extractionStatus: 'error',
      checksum,
      statusMessage: `Malformed or corrupted .xlsx file: ${detail}`,
    };
  }

  const totalSheetCount = Array.isArray(sheets) ? sheets.length : 0;
  if (totalSheetCount === 0) {
    return {
      title,
      fileName: file.name,
      filePath: effectivePath,
      sourceFolder: initialProv.sourceFolder,
      fileType: 'xlsx',
      extension,
      sizeBytes: file.size,
      text: '',
      pageOrItemCount: 0,
      itemUnitLabel: 'sheets',
      detectedSource: initialProv.source,
      sourceAttributionBasis: initialProv.basis,
      status: 'warning',
      extractionStatus: 'warning',
      checksum,
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
  const structuredSheets: NonNullable<StructuredDocumentPayload['sheets']> = [];
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
    const gridRows: string[][] = [];
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

      gridRows.push(formattedCells);
      nonEmptyRows.push(
        formattedCells.join(' | ').replace(/(?:\s*\|\s*)+$/, '')
      );
      totalIncludedRows++;
    }

    if (gridRows.length > 0) {
      const headers = gridRows[0] || [];
      const bodyRows = gridRows.slice(1);
      structuredSheets.push({
        name: sheetName,
        headers,
        rows: bodyRows,
        totalRows: bodyRows.length,
        totalCols: headers.length,
      });
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
  const prov = resolveSourceFromProvenance(effectivePath, file.name, fullText);
  const meta = extractMetadataFromDocumentText(fullText, prov.source);

  return {
    title,
    fileName: file.name,
    filePath: effectivePath,
    sourceFolder: prov.sourceFolder,
    fileType: 'xlsx',
    extension,
    sizeBytes: file.size,
    text: fullText,
    pageOrItemCount: boundedSheets.length,
    itemUnitLabel: boundedSheets.length === 1 ? 'sheet' : 'sheets',
    detectedSource: prov.source,
    sourceAttributionBasis: prov.basis,
    status: !fullText ? 'warning' : wasTruncated ? 'warning' : 'success',
    extractionStatus: !fullText
      ? 'warning'
      : wasTruncated
      ? 'warning'
      : 'success',
    extractionWarnings: wasTruncated ? truncationNotices : undefined,
    statusMessage: !fullText
      ? 'Spreadsheet is empty'
      : wasTruncated
      ? `Spreadsheet truncated for safety: ${truncationNotices.join('; ')}.`
      : undefined,
    checksum,
    importedAt: new Date().toISOString(),
    ...meta,
    structuredData: {
      format: 'xlsx',
      sheets: structuredSheets,
    },
  };
}

// PowerPoint (.pptx) Extraction
async function extractPptx(
  file: File,
  initialSource: AISource,
  onProgress?: ExtractionProgressCallback,
  relativePath?: string
): Promise<ExtractedFileResult> {
  const effectivePath = relativePath || file.name;
  onProgress?.({
    mode: 'indeterminate',
    phase: 'extracting',
    label: 'Reading presentation slides…',
  });
  const JSZipModule = await import('jszip');
  const JSZip = (JSZipModule as any).default || JSZipModule;
  const arrayBuffer = await file.arrayBuffer();
  const checksum = await computeContentChecksum(new Uint8Array(arrayBuffer));
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
  const structuredSlides: NonNullable<StructuredDocumentPayload['slides']> = [];
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
      structuredSlides.push({
        slideNumber: i + 1,
        title: lines[0] || `Slide ${i + 1}`,
        bullets: lines.slice(1),
      });
    }
  }

  const fullText = slideTexts.join('\n\n').trim();
  const prov = resolveSourceFromProvenance(effectivePath, file.name, fullText);
  const meta = extractMetadataFromDocumentText(fullText, prov.source);

  return {
    title: cleanTitleFromFileName(file.name),
    fileName: file.name,
    filePath: effectivePath,
    sourceFolder: prov.sourceFolder,
    fileType: 'pptx',
    extension: '.pptx',
    sizeBytes: file.size,
    text: fullText,
    pageOrItemCount: slideFiles.length,
    itemUnitLabel: slideFiles.length === 1 ? 'slide' : 'slides',
    detectedSource: prov.source,
    sourceAttributionBasis: prov.basis,
    status: fullText ? 'success' : 'warning',
    extractionStatus: fullText ? 'success' : 'warning',
    statusMessage: fullText ? undefined : 'No text content found in slides',
    checksum,
    importedAt: new Date().toISOString(),
    ...meta,
    structuredData: {
      format: 'pptx',
      slides: structuredSlides,
    },
  };
}

// Images
async function extractImageInfo(
  file: File,
  initialSource: AISource,
  relativePath?: string
): Promise<ExtractedFileResult> {
  const effectivePath = relativePath || file.name;
  const prov = resolveSourceFromProvenance(effectivePath, file.name, '');
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const checksum = await computeContentChecksum(bytes);

  // Convert small images (< 1.5MB) to a data URL for direct preview in the Format-Aware Inspector
  let dataUrl: string | undefined;
  if (file.size <= 1.5 * 1024 * 1024 && typeof FileReader !== 'undefined') {
    dataUrl = await new Promise<string | undefined>((res) => {
      const reader = new FileReader();
      reader.onload = () =>
        res(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => res(undefined);
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') {
      const text = `[Image Reference: ${file.name} | Size: ${file.size} bytes | Type: ${
        file.type || 'image'
      }]\nVisual asset stored with provenance metadata (OCR not run).`;
      resolve({
        title: cleanTitleFromFileName(file.name),
        fileName: file.name,
        filePath: effectivePath,
        sourceFolder: prov.sourceFolder,
        fileType: 'img',
        extension: '.' + (file.name.split('.').pop() || 'png').toLowerCase(),
        sizeBytes: file.size,
        text,
        pageOrItemCount: 1,
        itemUnitLabel: 'image',
        detectedSource: prov.source,
        sourceAttributionBasis: prov.basis,
        status: 'success',
        extractionStatus: 'metadata_only',
        checksum,
        importedAt: new Date().toISOString(),
        structuredData: {
          format: 'image',
          mimeType: file.type || 'image/png',
          imageMeta: {
            dataUrl,
            ocrStatus: 'not_run',
          },
        },
      });
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const text = `[Image Reference: ${file.name} | ${img.naturalWidth}x${
        img.naturalHeight
      }px | Type: ${
        file.type || 'image/png'
      }]\nAttached diagram / screenshot uploaded to knowledge base (OCR not run; metadata extracted).`;
      resolve({
        title: cleanTitleFromFileName(file.name),
        fileName: file.name,
        filePath: effectivePath,
        sourceFolder: prov.sourceFolder,
        fileType: 'img',
        extension: '.' + (file.name.split('.').pop() || 'png').toLowerCase(),
        sizeBytes: file.size,
        text,
        pageOrItemCount: 1,
        itemUnitLabel: 'image',
        detectedSource: prov.source,
        sourceAttributionBasis: prov.basis,
        status: 'success',
        extractionStatus: 'metadata_only',
        checksum,
        importedAt: new Date().toISOString(),
        structuredData: {
          format: 'image',
          mimeType: file.type || 'image/png',
          imageMeta: {
            width: img.naturalWidth,
            height: img.naturalHeight,
            dataUrl,
            ocrStatus: 'not_run',
          },
        },
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        title: cleanTitleFromFileName(file.name),
        fileName: file.name,
        filePath: effectivePath,
        sourceFolder: prov.sourceFolder,
        fileType: 'img',
        extension: '.' + (file.name.split('.').pop() || 'png').toLowerCase(),
        sizeBytes: file.size,
        text: `[Image: ${file.name}] Attached visual reference (OCR not run).`,
        pageOrItemCount: 1,
        itemUnitLabel: 'image',
        detectedSource: prov.source,
        sourceAttributionBasis: prov.basis,
        status: 'success',
        extractionStatus: 'metadata_only',
        checksum,
        importedAt: new Date().toISOString(),
        structuredData: {
          format: 'image',
          mimeType: file.type || 'image/png',
          imageMeta: {
            dataUrl,
            ocrStatus: 'not_run',
          },
        },
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
            const textParts = msg.content.parts.filter(
              (p: any) => typeof p === 'string' && p.trim()
            );
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
          const sender =
            msg.sender === 'human' || msg.role === 'user'
              ? 'User'
              : 'Assistant';
          const text =
            msg.text ||
            (Array.isArray(msg.content)
              ? msg.content.map((c: any) => c.text || '').join('\n')
              : '');
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
        title:
          convoLogs.length === 1
            ? firstTitle
            : `${cleanTitleFromFileName(fileName)} (${convoLogs.length} chats)`,
        detectedSource,
      };
    }
  }

  return {
    text: '',
    conversationCount: 1,
  };
}
