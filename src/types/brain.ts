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
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'cpp', 'c', 'java', 'go', 'html', 'css', 'json', 'sql', 'sh', 'yaml', 'yml'].includes(ext)) return 'code';
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
    if (['ts', 'js', 'py', 'rs', 'cpp', 'java', 'html', 'css', 'json'].includes(ext || '')) return 'code';
    if (ext === 'md' || ext === 'markdown') return 'md';
    if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext || '')) return 'img';
  }

  // Infer from content patterns
  const content = fact.content;
  if (content.startsWith('## Page ') || content.includes('.pdf') || (fact.tags && fact.tags.includes('pdf'))) {
    return 'pdf';
  }
  if (content.startsWith('## Sheet:') || content.includes('.xlsx') || (content.includes('|') && content.includes('\n|'))) {
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
  index: number;
  type: 'chat-turn' | 'heading' | 'slide' | 'sheet' | 'code-block' | 'paragraph';
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

export interface ExistingFileNodeCheck {
  exists: boolean;
  existingFact?: Fact;
  hasDiff: boolean;
  isIdentical: boolean;
  newSectionsDetected: number;
  existingSectionsCount?: number;
  summary?: string;
  recommendedAction: 'merge' | 'skip' | 'replace';
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
  parentId?: number;
  isDocumentRoot?: boolean;
  isUnifiedContextNode?: boolean;
  documentTitle?: string;
  semanticSectionCount?: number;
  mergeHistory?: FactMergeRecord[];
  created_at: string;
  updated_at: string;
}

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

export type ActivityAction = 'accessed' | 'modified' | 'created';

export interface RecentActivityItem {
  id: string; // unique event id
  factId: number;
  brain: string;
  source: AISource;
  snippet: string;
  action: ActivityAction;
  timestamp: string;
}
