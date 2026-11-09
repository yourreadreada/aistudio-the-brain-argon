export type AISource =
  | 'claude'
  | 'gpt'
  | 'gemini'
  | 'github'
  | 'moodle'
  | 'cursor'
  | 'local-ai';

export type FactFileType =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'code'
  | 'md'
  | 'img'
  | 'chat';

export type FactShapeModifier =
  | 'hexagon'
  | 'square'
  | 'crosshair'
  | 'diamond'
  | 'code-brackets'
  | 'dashed-circle'
  | 'image-frame'
  | 'circle';

export interface FileTypeMeta {
  id: FactFileType;
  label: string;
  badge: string;
  color: string;
  accentStroke: string;
  iconSymbol: string;
  strokePattern: number[]; // [] for solid, [4, 2] for dash, etc.
  shapeModifier: FactShapeModifier;
}

export const FILE_TYPE_CONFIG: Record<FactFileType, FileTypeMeta> = {
  pdf: {
    id: 'pdf',
    label: 'PDF Document',
    badge: 'PDF',
    color: '#F43F5E', // Rose red
    accentStroke: 'rgba(244, 63, 94, 0.95)',
    iconSymbol: '📕',
    strokePattern: [4, 2.5], // Distinct dual dash
    shapeModifier: 'hexagon',
  },
  docx: {
    id: 'docx',
    label: 'Word Document',
    badge: 'DOCX',
    color: '#38BDF8', // Sky blue
    accentStroke: 'rgba(56, 189, 248, 0.95)',
    iconSymbol: '📘',
    strokePattern: [2.5, 2.5], // Fine dashed
    shapeModifier: 'square',
  },
  xlsx: {
    id: 'xlsx',
    label: 'Excel Spreadsheet',
    badge: 'XLSX',
    color: '#10B981', // Emerald green
    accentStroke: 'rgba(16, 185, 129, 0.95)',
    iconSymbol: '📗',
    strokePattern: [6, 2], // Tabular long dash
    shapeModifier: 'crosshair',
  },
  pptx: {
    id: 'pptx',
    label: 'PowerPoint Slides',
    badge: 'PPTX',
    color: '#F59E0B', // Amber
    accentStroke: 'rgba(245, 158, 11, 0.95)',
    iconSymbol: '📙',
    strokePattern: [5, 2, 1.5, 2], // Dash-dot
    shapeModifier: 'diamond',
  },
  code: {
    id: 'code',
    label: 'Source Code',
    badge: 'CODE',
    color: '#A855F7', // Violet
    accentStroke: 'rgba(168, 85, 247, 0.95)',
    iconSymbol: '💻',
    strokePattern: [1.5, 2], // Fine dotted
    shapeModifier: 'code-brackets',
  },
  md: {
    id: 'md',
    label: 'Markdown Document',
    badge: 'MD',
    color: '#EC4899', // Pink
    accentStroke: 'rgba(236, 72, 153, 0.95)',
    iconSymbol: '📓',
    strokePattern: [3.5, 2],
    shapeModifier: 'dashed-circle',
  },
  img: {
    id: 'img',
    label: 'Diagram / Image',
    badge: 'IMG',
    color: '#06B6D4', // Cyan
    accentStroke: 'rgba(6, 182, 212, 0.95)',
    iconSymbol: '🖼️',
    strokePattern: [2, 1, 2, 1],
    shapeModifier: 'image-frame',
  },
  chat: {
    id: 'chat',
    label: 'AI Conversation',
    badge: 'CHAT',
    color: '#E2E8F0', // Clean slate
    accentStroke: 'rgba(255, 255, 255, 0.75)',
    iconSymbol: '💬',
    strokePattern: [], // Smooth continuous
    shapeModifier: 'circle',
  },
};

export function inferFileTypeFromExtension(filenameOrExt: string): FactFileType {
  const ext = (filenameOrExt.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['docx', 'doc', 'rtf'].includes(ext)) return 'docx';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'xlsx';
  if (['pptx', 'ppt', 'key'].includes(ext)) return 'pptx';
  if (
    [
      'ts',
      'tsx',
      'js',
      'jsx',
      'py',
      'rs',
      'cpp',
      'c',
      'java',
      'go',
      'html',
      'css',
      'json',
      'sql',
      'sh',
      'yaml',
      'yml',
    ].includes(ext)
  ) {
    return 'code';
  }
  if (['md', 'markdown', 'txt'].includes(ext)) return 'md';
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext)) return 'img';
  return 'chat';
}

export function getFactFileType(fact: Fact): FactFileType {
  if (fact.fileType) return fact.fileType;

  // Infer from fileName if present
  if (fact.fileName) {
    const ext = fact.fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (ext === 'docx' || ext === 'doc') return 'docx';
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return 'xlsx';
    if (ext === 'pptx' || ext === 'ppt') return 'pptx';
    if (
      [
        'ts',
        'tsx',
        'js',
        'jsx',
        'py',
        'rs',
        'cpp',
        'c',
        'java',
        'go',
        'html',
        'css',
        'json',
        'sql',
        'sh',
        'yaml',
        'yml',
      ].includes(ext || '')
    ) {
      return 'code';
    }
    if (ext === 'md' || ext === 'markdown' || ext === 'txt') return 'md';
    if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext || '')) {
      return 'img';
    }
  }

  // Infer from content patterns
  const content = fact.content;
  if (
    content.startsWith('## Page ') ||
    content.includes('.pdf') ||
    (fact.tags && fact.tags.includes('pdf'))
  ) {
    return 'pdf';
  }
  if (
    content.startsWith('## Sheet:') ||
    content.includes('.xlsx') ||
    (content.includes('|') && content.includes('\n|'))
  ) {
    return 'xlsx';
  }
  if (content.startsWith('## Slide ') || content.includes('.pptx')) {
    return 'pptx';
  }
  if (content.startsWith('## Table ') || content.includes('.docx')) {
    return 'docx';
  }
  if (content.startsWith('[Image') || content.includes('image text:')) {
    return 'img';
  }
  if (
    fact.source === 'github' ||
    content.includes('commit') ||
    content.includes('pipeline uses') ||
    content.includes('FastAPI') ||
    content.includes('TypeScript') ||
    content.includes('PyTorch') ||
    content.includes('def ') ||
    content.includes('class ')
  ) {
    return 'code';
  }
  if (fact.tags && fact.tags.includes('assignment')) {
    return 'docx';
  }
  if (content.includes('## ') || content.includes('**')) {
    return 'md';
  }

  return 'chat';
}

export type IngestStrategy = 'semantic' | 'single' | 'branching' | 'chunk';

export type MergeStrategy = 'auto-merge' | 'replace' | 'new-branch';

export interface SemanticSection {
  id?: string;
  index: number;
  type:
    | 'chat-turn'
    | 'heading'
    | 'slide'
    | 'sheet'
    | 'code-block'
    | 'paragraph';
  kind?: string;
  title?: string;
  content: string;
  speaker?: 'user' | 'assistant' | 'system' | 'note';
}

export interface FactMergeRecord {
  timestamp: string;
  action: 'created' | 'merged' | 'appended' | 'updated';
  summary: string;
  previousContentLength?: number;
  newContentLength?: number;
}

export type DuplicateDetectionState =
  | 'new'
  | 'possible_duplicate'
  | 'exact_duplicate'
  | 'related_content'
  | 'unable_to_determine';

export type ReviewResolutionAction =
  | 'create'
  | 'merge'
  | 'replace'
  | 'skip'
  | 'undecided';

export type ReviewItemStatus =
  | 'extracting'
  | 'ready'
  | 'importing'
  | 'processing'
  | 'imported'
  | 'skipped'
  | 'error';

export type ExtractionStatus =
  | 'ok'
  | 'success'
  | 'warning'
  | 'error'
  | 'failed'
  | 'metadata_only';

export interface StructuredDocumentPayload {
  kind?: string;
  format?: string;
  mimeType?: string;
  summary?: string;
  language?: string;
  pages?: Array<{ pageNumber: number; text: string }>;
  ocrStatus?: 'not_required' | 'not_run' | 'embedded_text_extracted' | 'completed';
  sheets?: Array<{
    name: string;
    headers: string[];
    columns?: string[];
    rows: string[][];
    totalRows: number;
    totalCols: number;
  }>;
  slides?: Array<{
    slideNumber: number;
    title: string;
    bullets: string[];
    notes?: string;
  }>;
  docxStructure?: {
    headings: Array<{ level: number; text: string }>;
    tablesCount: number;
    paragraphsCount: number;
  };
  imageMeta?: {
    width?: number;
    height?: number;
    dataUrl?: string;
    ocrStatus: 'not_run' | 'embedded_metadata_extracted';
  };
  imagePreviewDataUrl?: string;
  imageDimensions?: { width: number; height: number };
  codeMeta?: {
    language: string;
    lineCount: number;
  };
  jsonStructure?: any;
  htmlPreviewText?: string;
}

export interface ImportItemProgress {
  mode: 'determinate' | 'indeterminate';
  phase?: 'uploading' | 'extracting' | 'importing' | 'processing';
  current?: number;
  total?: number;
  unit?: string;
  label?: string;
}

export interface ExistingFileNodeCheck {
  exists: boolean;
  existingFact?: Fact;
  hasDiff: boolean;
  isIdentical: boolean;
  newSectionsDetected: number;
  existingSectionsCount?: number;
  summary?: string;
  recommendedAction: 'create' | 'merge' | 'skip' | 'replace' | 'ask_user';
  duplicateState?: DuplicateDetectionState;
}

export interface ImportReviewItem {
  id: string;
  title: string;
  fileName: string;
  filePath?: string;
  sourceFolder?: string;
  fileType?: FactFileType;
  archiveParent?: string;
  extension: string;
  sizeBytes: number;
  text: string;
  source: AISource;
  sourceAttributionBasis?: 'folder_path' | 'explicit_header' | 'filename' | 'content_heuristic' | 'manual_override';
  destinationBrain: string;
  itemCount: number;
  itemUnitLabel: string;
  status: ReviewItemStatus;
  statusMessage?: string;
  errorMessage?: string;
  lastAttemptedAction?: 'create' | 'merge' | 'replace';
  duplicateState: DuplicateDetectionState;
  nodeCheck?: ExistingFileNodeCheck;
  resolution: ReviewResolutionAction;
  tags: string[];
  progress?: ImportItemProgress;
  simulateFailureOnce?: boolean;
  // Provenance & extraction metadata
  originalCreatedAt?: string | null;
  importedAt?: string;
  importBatchId?: string;
  checksum?: string;
  extractionStatus?: ExtractionStatus;
  extractionWarnings?: string[];
  relatedSources?: AISource[];
  fixtureId?: string;
  topicKey?: string;
  structuredData?: StructuredDocumentPayload;
}

export interface BatchExecutionProgress {
  actionLabel: string;
  completed: number;
  total: number;
  imported?: number;
  skipped?: number;
  failed?: number;
  activeCount: number;
}

export interface IngestOperationResult {
  fact: Fact;
  action: 'created' | 'merged' | 'appended' | 'updated' | 'unchanged';
  message: string;
  sectionsCount: number;
  isExistingNode: boolean;
  previousId?: number;
}

export interface Fact {
  id: number;
  brain: string;
  content: string;
  source: AISource;
  tags?: string[];
  fileType?: FactFileType;
  fileName?: string;
  filePath?: string;
  sourceFolder?: string;
  parentId?: number;
  isDocumentRoot?: boolean;
  isUnifiedContextNode?: boolean;
  documentTitle?: string;
  semanticSectionCount?: number;
  mergeHistory?: FactMergeRecord[];
  // Provenance & Integrity Metadata
  originalCreatedAt?: string | null;
  importedAt?: string;
  importBatchId?: string;
  checksum?: string;
  extractionStatus?: ExtractionStatus;
  extractionWarnings?: string[];
  relatedSources?: AISource[];
  fixtureId?: string;
  topicKey?: string;
  fileSizeBytes?: number;
  structuredData?: StructuredDocumentPayload;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// SECTION 2: NEURAL GRAPH — RELATIONSHIPS & DATA CORRECTNESS
// ============================================================================

export type GraphRelationshipType = 'source' | 'semantic' | 'explicit';

export interface GraphRelationshipEdge {
  id: string;
  fromId: string;
  toId: string;
  fromFactId?: number;
  toFactId?: number;
  fromSource?: AISource;
  toSource?: AISource;
  type: GraphRelationshipType;
  score: number; // 0.0 to 1.0
  label?: string;
  basis?: string;
  explanation: string;
  sharedTerms?: string[];
  sharedTags?: string[];
  sharedKeywords?: string[];
  crossSource?: boolean;
}

// ============================================================================
// SECTION 8: ACTIVITY LOG — FULL AUDIT & DIAGNOSTICS
// ============================================================================

export type ActivityLogCategory =
  | 'viewed'
  | 'created'
  | 'modified'
  | 'deleted'
  | 'imported'
  | 'exported'
  | 'export'
  | 'import'
  | 'archive_extract'
  | 'provenance'
  | 'create'
  | 'edit'
  | 'delete'
  | 'tag_update'
  | 'search'
  | 'backup_create'
  | 'backup_verify'
  | 'backup_export'
  | 'backup_delete'
  | 'restore_internal'
  | 'restore_external'
  | 'migration'
  | 'memory_create'
  | 'memory_edit'
  | 'search_execution'
  | 'merged'
  | 'replaced'
  | 'skipped'
  | 'backup_created'
  | 'backup_exported'
  | 'backup_deleted'
  | 'restore_started'
  | 'restore_completed'
  | 'restore_failed'
  | 'db_initialized'
  | 'migration_executed'
  | 'integrity_check'
  | 'ai_sync'
  | 'error'
  | 'warning';

export type ActivityLogStatus = 'success' | 'warning' | 'error' | 'info';

export interface ActivityLogEntry {
  id: string;
  operationId?: string;
  timestamp: string;
  category: ActivityLogCategory;
  action?: string;
  status: ActivityLogStatus;
  durationMs?: number;
  brain?: string;
  source?: AISource | string;
  factId?: number | null;
  recordId?: number | null;
  fileName?: string | null;
  batchOrBackupId?: string | null;
  summary: string;
  details?: Record<string, any>;
  errorCategory?: string | null;
  recoveryAction?: string | null;
}

// Legacy compatibility types for quick recent activity drawer
export type ActivityAction = 'accessed' | 'modified' | 'created';

export interface RecentActivityItem {
  id: string;
  factId: number;
  brain: string;
  source: AISource;
  snippet: string;
  action: ActivityAction;
  timestamp: string;
}

// ============================================================================
// SECTIONS 10 & 11: AI ENTITIES, WORMHOLES & SPINAL CORD ARCHITECTURE
// ============================================================================

export type AIEntitySyncStatus =
  | 'local_gateway_ready'
  | 'companion_paired'
  | 'manual_import_only'
  | 'offline';

export interface AIEntity {
  id: AISource;
  displayName: string;
  provider?: string;
  providerFamily: string;
  transportChannel?: string;
  capabilities: string[];
  supportedImportFormats: string[];
  supportedExportFormats: string[];
  syncStatus: AIEntitySyncStatus;
  permissionsScope: string[];
  provenanceRules: {
    folderPrefixes: string[];
    headerMatchers: string[];
  };
}

export interface WormholeTransfer {
  id: string;
  originEntity: AISource;
  destinationEntity: AISource | 'workspace';
  destinationBrain: string;
  transferredFactIds: number[];
  direction: 'ingest' | 'grounding_export' | 'cross_entity_bridge';
  timestamp: string;
  transformationSummary: string;
  validationStatus: 'verified' | 'filtered' | 'rejected';
  auditOperationId: string;
}

export interface SpinalCordTransportBoundary {
  protocolVersion: string;
  localBindingOnly: boolean;
  host: string;
  port?: number;
  lanExposureEnabled?: boolean;
  remoteAccessEnabled?: boolean;
  authenticatedEndpoints: string[];
  validationGuarantees: string[];
  auditRetentionPolicy: string;
}

export const AI_ENTITIES_REGISTRY: Record<AISource, AIEntity> = {
  claude: {
    id: 'claude',
    displayName: 'Claude',
    providerFamily: 'Anthropic (Provider-Neutral Adapter)',
    capabilities: [
      'Conversation Export Ingestion',
      'Artifacts & Project Instructions Capture',
      'One-Click Context Primer Generation',
      'Local MCP Bridge Recall/Remember',
    ],
    supportedImportFormats: ['.md', '.json', '.pdf', '.docx', '.xlsx', '.pptx', '.csv', '.txt', '.zip'],
    supportedExportFormats: ['Markdown Primer (.md)', 'JSON Context Bundle'],
    syncStatus: 'local_gateway_ready',
    permissionsScope: ['read:workspace_facts', 'write:staged_review_queue'],
    provenanceRules: {
      folderPrefixes: ['01_claude', 'claude'],
      headerMatchers: ['Primary Source: Claude', 'Primary Source: 01_claude'],
    },
  },
  gpt: {
    id: 'gpt',
    displayName: 'ChatGPT',
    providerFamily: 'OpenAI (Provider-Neutral Adapter)',
    capabilities: [
      'Full Account Archive (conversations.json) Ingestion',
      'Canvas & Code Block Extraction',
      'Custom Instructions Grounding Export',
      'Browser Companion DOM Capture',
    ],
    supportedImportFormats: ['.json', '.md', '.pdf', '.docx', '.xlsx', '.pptx', '.csv', '.txt', '.zip'],
    supportedExportFormats: ['Custom Instructions (.md)', 'Portable Markdown'],
    syncStatus: 'local_gateway_ready',
    permissionsScope: ['read:workspace_facts', 'write:staged_review_queue'],
    provenanceRules: {
      folderPrefixes: ['02_chatgpt', 'chatgpt', 'gpt', 'openai'],
      headerMatchers: ['Primary Source: ChatGPT', 'Primary Source: 02_chatgpt', 'Primary Source: GPT'],
    },
  },
  gemini: {
    id: 'gemini',
    displayName: 'Gemini',
    providerFamily: 'Google DeepMind (Provider-Neutral Adapter)',
    capabilities: [
      'Multimodal Document & Research Ingestion',
      'Structured Grounding Context Export',
      'Browser Companion DOM Capture',
      'Optional Server-Side Live Recall Verification',
    ],
    supportedImportFormats: ['.md', '.pdf', '.docx', '.xlsx', '.pptx', '.csv', '.json', '.png', '.jpg', '.zip'],
    supportedExportFormats: ['Gemini Workspace Context (.md)', 'JSON Context Bundle'],
    syncStatus: 'local_gateway_ready',
    permissionsScope: ['read:workspace_facts', 'write:staged_review_queue'],
    provenanceRules: {
      folderPrefixes: ['03_gemini', 'gemini'],
      headerMatchers: ['Primary Source: Gemini', 'Primary Source: 03_gemini'],
    },
  },
  github: {
    id: 'github',
    displayName: 'GitHub',
    providerFamily: 'Git / Code Forge Adapter',
    capabilities: [
      'Repository Source Code & Architecture ADR Ingestion',
      'Issue, PR & Release Notes Extraction',
      'Cross-Source Code Provenance Linking',
    ],
    supportedImportFormats: ['.ts', '.tsx', '.js', '.py', '.rs', '.go', '.md', '.json', '.yaml', '.pdf', '.pptx', '.xlsx', '.zip'],
    supportedExportFormats: ['ADR Markdown (.md)', 'Repository Context Bundle'],
    syncStatus: 'manual_import_only',
    permissionsScope: ['read:workspace_facts', 'write:staged_review_queue'],
    provenanceRules: {
      folderPrefixes: ['04_github', 'github'],
      headerMatchers: ['Primary Source: GitHub', 'Primary Source: 04_github'],
    },
  },
  moodle: {
    id: 'moodle',
    displayName: 'Moodle',
    providerFamily: 'Academic LMS Adapter',
    capabilities: [
      'Lecture Slides (.pptx), Handouts (.pdf) & Rubrics (.docx) Extraction',
      'Lab Grades & Tabular Schedule (.xlsx/.csv) Parsing',
      'Coursework Topic Clustering',
    ],
    supportedImportFormats: ['.pdf', '.docx', '.pptx', '.xlsx', '.csv', '.md', '.txt', '.html', '.zip'],
    supportedExportFormats: ['Study Guide Markdown (.md)'],
    syncStatus: 'manual_import_only',
    permissionsScope: ['read:workspace_facts', 'write:staged_review_queue'],
    provenanceRules: {
      folderPrefixes: ['05_moodle', 'moodle'],
      headerMatchers: ['Primary Source: Moodle', 'Primary Source: 05_moodle'],
    },
  },
  cursor: {
    id: 'cursor',
    displayName: 'Cursor / Antigravity',
    providerFamily: 'IDE Agent & Composer Adapter',
    capabilities: [
      'Composer Session & Rules (.cursorrules) Ingestion',
      'Local MCP Server Recall & Remember Integration',
      'Multi-File Refactor Context Grounding',
    ],
    supportedImportFormats: ['.md', '.ts', '.tsx', '.py', '.json', '.yaml', '.pdf', '.docx', '.xlsx', '.pptx', '.zip'],
    supportedExportFormats: ['.cursorrules Markdown', 'MCP Context Payload'],
    syncStatus: 'local_gateway_ready',
    permissionsScope: ['read:workspace_facts', 'write:workspace_facts'],
    provenanceRules: {
      folderPrefixes: ['06_cursor_antigravity', '06_cursor', 'cursor', 'antigravity'],
      headerMatchers: ['Primary Source: Cursor', 'Primary Source: Cursor / Antigravity', 'Primary Source: 06_cursor_antigravity'],
    },
  },
  'local-ai': {
    id: 'local-ai',
    displayName: 'Local AI / Ollama',
    providerFamily: 'Local Inference Runtime Adapter',
    capabilities: [
      'Offline Model Generation & Benchmark Log Ingestion',
      'Zero-Egress Local SQLite Context Grounding',
      'Local MCP Stdio / HTTP Bridge Support',
    ],
    supportedImportFormats: ['.md', '.json', '.txt', '.csv', '.pdf', '.docx', '.xlsx', '.pptx', '.py', '.sh', '.zip'],
    supportedExportFormats: ['System Prompt Markdown (.md)', 'JSONL Context'],
    syncStatus: 'local_gateway_ready',
    permissionsScope: ['read:workspace_facts', 'write:workspace_facts'],
    provenanceRules: {
      folderPrefixes: ['07_local_ai_ollama', '07_local_ai', 'local-ai', 'local_ai', 'ollama'],
      headerMatchers: ['Primary Source: Local AI', 'Primary Source: Local AI / Ollama', 'Primary Source: 07_local_ai_ollama', 'Primary Source: Ollama'],
    },
  },
};

export const SPINAL_CORD_BOUNDARY: SpinalCordTransportBoundary = {
  protocolVersion: 'Argon-SpinalCord/1.2 (Local-First)',
  localBindingOnly: true,
  host: '127.0.0.1',
  port: 3000,
  lanExposureEnabled: false,
  remoteAccessEnabled: false,
  authenticatedEndpoints: [
    'POST /api/facts/ingest-item',
    'POST /api/companion/capture',
    'POST /api/companion/capture-project',
    'POST /api/database/backups',
    'POST /api/database/restore',
    'POST /api/database/restore-external',
  ],
  validationGuarantees: [
    'Strict folder/header source provenance precedence over body keywords',
    'SHA-256 content checksum computation and duplicate state verification',
    'SQLite 16-byte magic header + PRAGMA integrity_check on all backups and restores',
    'Automatic token and secret redaction on all Activity Log diagnostics and exports',
  ],
  auditRetentionPolicy: 'Durable SQLite activity_logs table with structured JSON/CSV export',
};

export interface SourceMeta {
  id: AISource;
  name: string;
  color: string;
  dotColor: string;
  bgRgba: string;
  description: string;
}

export const SOURCE_PALETTE: Record<AISource, SourceMeta> = {
  claude: {
    id: 'claude',
    name: 'Claude',
    color: '#D85A30', // Claude terracotta
    dotColor: '#E67048',
    bgRgba: 'rgba(216, 90, 48, 0.15)',
    description: 'Anthropic Claude conversations & reasoning exports',
  },
  gpt: {
    id: 'gpt',
    name: 'ChatGPT',
    color: '#378ADD', // OpenAI Blue
    dotColor: '#4A9DEC',
    bgRgba: 'rgba(55, 138, 221, 0.15)',
    description: 'OpenAI ChatGPT architectures & debugging chats',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    color: '#1D9E75', // Google Teal/Emerald
    dotColor: '#28B88B',
    bgRgba: 'rgba(29, 158, 117, 0.15)',
    description: 'Google Gemini multimodal analysis & code research',
  },
  github: {
    id: 'github',
    name: 'GitHub',
    color: '#7F77DD', // GitHub Violet
    dotColor: '#968EF0',
    bgRgba: 'rgba(127, 119, 221, 0.15)',
    description: 'Git commits, PR reviews & issue comments',
  },
  moodle: {
    id: 'moodle',
    name: 'Moodle',
    color: '#D4537E', // Moodle Pink
    dotColor: '#E26D94',
    bgRgba: 'rgba(212, 83, 126, 0.15)',
    description: 'Coursework assignments, grades & syllabus materials',
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor / Antigravity',
    color: '#3D9BB8', // Cursor Cyan
    dotColor: '#53B3D0',
    bgRgba: 'rgba(61, 155, 184, 0.15)',
    description: 'IDE editor composer sessions & inline agent context',
  },
  'local-ai': {
    id: 'local-ai',
    name: 'Local AI / Ollama',
    color: '#B8923D', // Amber Gold
    dotColor: '#CDA54E',
    bgRgba: 'rgba(184, 146, 61, 0.15)',
    description: 'Offline local LLM generations & private runs',
  },
};

export const DEFAULT_BRAINS = ['coding', 'college', 'personal'];
