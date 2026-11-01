import { FactFileType, SemanticSection } from '../types/brain';

/**
 * Industrial-strength Semantic Chunker
 * Parses text by logical breaks (chat turns, markdown headings, code definitions,
 * slides, sheets, paragraphs) rather than fixed-length character splits.
 *
 * This ensures that documents and conversation exports are understood
 * as coherent semantic structures, enabling unified context nodes and
 * intelligent incremental merging.
 */

export interface ParsedDocumentStructure {
  rawText: string;
  sections: SemanticSection[];
  totalWordCount: number;
  detectedFormat: 'chat' | 'markdown' | 'presentation' | 'tabular' | 'code' | 'prose';
  title?: string;
}

export interface IncrementalMergeResult {
  isIdentical: boolean;
  hasNewContent: boolean;
  newSections: SemanticSection[];
  mergedContent: string;
  mergedSectionsCount: number;
  summary: string;
  action: 'unchanged' | 'merged' | 'appended';
}

/**
 * Normalizes text to standardize line endings and trailing whitespace.
 */
function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

/**
 * Detects whether the content is an AI chat export.
 */
function isChatTranscript(text: string): boolean {
  return (
    text.includes('#### User') ||
    text.includes('#### Assistant') ||
    /(?:^|\n)(?:Human|User|Assistant|System):\s+/i.test(text) ||
    /(?:^|\n)\*\*(?:USER|ASSISTANT|HUMAN)\*\*:/i.test(text)
  );
}

/**
 * Parses an AI conversation into coherent chat turns (User / Assistant / System).
 */
function parseChatTurns(text: string): SemanticSection[] {
  const sections: SemanticSection[] = [];

  // 1. Check for standard '#### User' / '#### Assistant' markdown markers (Claude / common exports)
  if (text.includes('#### User') || text.includes('#### Assistant')) {
    // Preserve header if present before the first turn
    const firstTurnIdx = text.search(/#### (?:User|Assistant|System)/);
    if (firstTurnIdx > 0) {
      const preamble = text.slice(0, firstTurnIdx).trim();
      if (preamble) {
        sections.push({
          index: 0,
          type: 'heading',
          title: 'Document Header',
          content: preamble,
          speaker: 'system',
        });
      }
    }

    const turns = text.split(/(?=#### (?:User|Assistant|System))/g).filter(Boolean);
    turns.forEach((rawTurn) => {
      const trimmed = rawTurn.trim();
      if (!trimmed) return;

      let speaker: 'user' | 'assistant' | 'system' = 'user';
      let title = 'Conversation Turn';

      if (trimmed.startsWith('#### User')) {
        speaker = 'user';
        title = 'User Prompt';
      } else if (trimmed.startsWith('#### Assistant')) {
        speaker = 'assistant';
        title = 'Assistant Response';
      } else if (trimmed.startsWith('#### System')) {
        speaker = 'system';
        title = 'System Context';
      }

      sections.push({
        index: sections.length,
        type: 'chat-turn',
        title,
        content: trimmed,
        speaker,
      });
    });

    if (sections.length > 0) return sections;
  }

  // 2. Check for "Human: / Assistant:" or "User: / Assistant:"
  const turnPattern = /(?:^|\n)(Human|User|Assistant|System):\s+/gi;
  const matches = Array.from(text.matchAll(turnPattern));
  if (matches.length > 1) {
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const start = match.index!;
      const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
      const turnText = text.slice(start, end).trim();
      const roleStr = match[1].toLowerCase();
      const speaker: 'user' | 'assistant' | 'system' =
        roleStr === 'assistant' ? 'assistant' : roleStr === 'system' ? 'system' : 'user';

      sections.push({
        index: sections.length,
        type: 'chat-turn',
        title: speaker === 'user' ? 'User Prompt' : 'Assistant Response',
        content: turnText,
        speaker,
      });
    }
    if (sections.length > 0) return sections;
  }

  return [];
}

/**
 * Parses Markdown documents by logical headings (#, ##, ###, ####).
 */
function parseMarkdownHeadings(text: string): SemanticSection[] {
  const sections: SemanticSection[] = [];
  // Split on headings that start at line beginning
  const headingRegex = /(?:^|\n)(?=#{1,4}\s+)/g;
  const parts = text.split(headingRegex).filter(Boolean);

  parts.forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;

    // Extract heading title
    const firstLineMatch = trimmed.match(/^#{1,4}\s+(.+)$/m);
    const title = firstLineMatch ? firstLineMatch[1].trim() : 'Section';

    sections.push({
      index: sections.length,
      type: 'heading',
      title,
      content: trimmed,
    });
  });

  return sections;
}

/**
 * Parses Presentation slides ('## Slide N').
 */
function parseSlideSections(text: string): SemanticSection[] {
  const sections: SemanticSection[] = [];
  const parts = text.split(/(?=## Slide \d+)/g).filter(Boolean);

  parts.forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const titleMatch = trimmed.match(/^## Slide (\d+)/);
    const title = titleMatch ? `Slide ${titleMatch[1]}` : 'Presentation Slide';

    sections.push({
      index: sections.length,
      type: 'slide',
      title,
      content: trimmed,
    });
  });

  return sections;
}

/**
 * Parses Spreadsheet sheets ('## Sheet: ...').
 */
function parseSheetSections(text: string): SemanticSection[] {
  const sections: SemanticSection[] = [];
  const parts = text.split(/(?=## Sheet:\s*)/g).filter(Boolean);

  parts.forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const titleMatch = trimmed.match(/^## Sheet:\s*(.+)$/m);
    const title = titleMatch ? `Sheet: ${titleMatch[1].trim()}` : 'Spreadsheet';

    sections.push({
      index: sections.length,
      type: 'sheet',
      title,
      content: trimmed,
    });
  });

  return sections;
}

/**
 * Parses Code files by top-level class/function definitions and module blocks.
 */
function parseCodeSections(text: string): SemanticSection[] {
  const sections: SemanticSection[] = [];
  // Split along function/class declarations or major comment banners
  const codeBlockRegex = /(?:^|\n)(?=(?:export\s+)?(?:class|function|def|interface|type)\s+[A-Za-z0-9_]+)/g;
  const parts = text.split(codeBlockRegex).filter(Boolean);

  if (parts.length > 1) {
    parts.forEach((part) => {
      const trimmed = part.trim();
      if (!trimmed) return;
      const declMatch = trimmed.match(/(?:export\s+)?(?:class|function|def|interface|type)\s+([A-Za-z0-9_]+)/);
      const title = declMatch ? declMatch[0] : 'Code Block';

      sections.push({
        index: sections.length,
        type: 'code-block',
        title,
        content: trimmed,
      });
    });
  }

  return sections;
}

/**
 * Fallback parser: groups prose by paragraph breaks (\n\n), keeping thoughts intact.
 */
function parseParagraphSections(text: string): SemanticSection[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const sections: SemanticSection[] = [];
  let currentGroup: string[] = [];
  let currentWordCount = 0;

  paragraphs.forEach((p) => {
    const pWords = p.split(/\s+/).length;
    // Combine short paragraphs into coherent units of ~250 words
    if (currentGroup.length > 0 && currentWordCount + pWords > 300) {
      const combined = currentGroup.join('\n\n');
      sections.push({
        index: sections.length,
        type: 'paragraph',
        title: `Section ${sections.length + 1}`,
        content: combined,
      });
      currentGroup = [p];
      currentWordCount = pWords;
    } else {
      currentGroup.push(p);
      currentWordCount += pWords;
    }
  });

  if (currentGroup.length > 0) {
    sections.push({
      index: sections.length,
      type: 'paragraph',
      title: `Section ${sections.length + 1}`,
      content: currentGroup.join('\n\n'),
    });
  }

  return sections;
}

/**
 * Main parser: takes raw file text and parses it into logical semantic sections.
 */
export function parseSemanticSections(
  rawText: string,
  fileType?: FactFileType,
  fileName?: string
): ParsedDocumentStructure {
  const text = normalize(rawText);
  if (!text) {
    return {
      rawText: '',
      sections: [],
      totalWordCount: 0,
      detectedFormat: 'prose',
    };
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  let detectedFormat: ParsedDocumentStructure['detectedFormat'] = 'prose';
  let sections: SemanticSection[] = [];

  // Extract document title from first header or file name
  let title: string | undefined;
  const headerMatch = text.match(/^#\s+(.+)$/m);
  if (headerMatch) {
    title = headerMatch[1].trim();
  } else if (fileName) {
    title = fileName.replace(/\.[^/.]+$/, '');
  }

  // 1. Check if chat transcript
  if (fileType === 'chat' || isChatTranscript(text)) {
    sections = parseChatTurns(text);
    if (sections.length > 0) {
      detectedFormat = 'chat';
    }
  }

  // 2. Check if presentations (.pptx)
  if (sections.length === 0 && (fileType === 'pptx' || text.includes('## Slide '))) {
    sections = parseSlideSections(text);
    if (sections.length > 0) {
      detectedFormat = 'presentation';
    }
  }

  // 3. Check if spreadsheets (.xlsx, .csv)
  if (sections.length === 0 && (fileType === 'xlsx' || text.includes('## Sheet:'))) {
    sections = parseSheetSections(text);
    if (sections.length > 0) {
      detectedFormat = 'tabular';
    }
  }

  // 4. Check if markdown with headers
  if (sections.length === 0 && (fileType === 'md' || /^#{1,3}\s+/m.test(text))) {
    sections = parseMarkdownHeadings(text);
    if (sections.length > 0) {
      detectedFormat = 'markdown';
    }
  }

  // 5. Check if source code
  if (sections.length === 0 && fileType === 'code') {
    sections = parseCodeSections(text);
    if (sections.length > 0) {
      detectedFormat = 'code';
    }
  }

  // 6. Fallback to logical paragraph grouping
  if (sections.length === 0) {
    sections = parseParagraphSections(text);
    detectedFormat = 'prose';
  }

  // Ensure index ordering
  sections.forEach((s, idx) => {
    s.index = idx;
  });

  return {
    rawText: text,
    sections,
    totalWordCount: wordCount,
    detectedFormat,
    title,
  };
}

/**
 * Intelligent Diff and Incremental Merge Engine
 * Detects whether new incoming content contains new conversation turns,
 * appended sections, or updates compared to an existing node's content.
 */
export function detectIncrementalDiff(
  existingContent: string,
  incomingContent: string,
  fileType?: FactFileType,
  fileName?: string
): IncrementalMergeResult {
  const normExisting = normalize(existingContent);
  const normIncoming = normalize(incomingContent);

  // Exact match check
  if (normExisting === normIncoming) {
    const parsed = parseSemanticSections(normExisting, fileType, fileName);
    return {
      isIdentical: true,
      hasNewContent: false,
      newSections: [],
      mergedContent: normExisting,
      mergedSectionsCount: parsed.sections.length,
      summary: 'Incoming content is identical to existing node. Redundant creation skipped.',
      action: 'unchanged',
    };
  }

  const existingParsed = parseSemanticSections(normExisting, fileType, fileName);
  const incomingParsed = parseSemanticSections(normIncoming, fileType, fileName);

  // Map existing sections by normalized signature
  const existingSignatures = new Set(
    existingParsed.sections.map((s) => s.content.trim().toLowerCase())
  );

  // Find sections in incoming that don't exist yet
  const newSections: SemanticSection[] = [];
  incomingParsed.sections.forEach((sec) => {
    const sig = sec.content.trim().toLowerCase();
    if (!existingSignatures.has(sig)) {
      newSections.push(sec);
    }
  });

  // If incoming simply extends existing (e.g. chat continues or document appended)
  if (newSections.length > 0) {
    // Check if incoming text starts with existing text (direct prefix extension)
    let mergedContent: string;
    if (normIncoming.startsWith(normExisting)) {
      mergedContent = normIncoming;
    } else {
      // Append the new sections cleanly with standard logical spacing
      const newContentToAdd = newSections.map((s) => s.content).join('\n\n');
      mergedContent = `${normExisting}\n\n${newContentToAdd}`.trim();
    }

    const mergedParsed = parseSemanticSections(mergedContent, fileType, fileName);

    const sectionType = incomingParsed.detectedFormat === 'chat' ? 'conversation turn' : 'semantic section';
    const summary = `Intelligently merged ${newSections.length} new ${sectionType}${
      newSections.length === 1 ? '' : 's'
    } into existing unified node. Preserved complete coherent context.`;

    return {
      isIdentical: false,
      hasNewContent: true,
      newSections,
      mergedContent,
      mergedSectionsCount: mergedParsed.sections.length,
      summary,
      action: 'merged',
    };
  }

  // If no distinct new sections found but content differs (minor edit / formatting correction)
  return {
    isIdentical: false,
    hasNewContent: true,
    newSections: [],
    mergedContent: normIncoming,
    mergedSectionsCount: incomingParsed.sections.length,
    summary: 'Updated existing unified node with revised document content in-place.',
    action: 'merged',
  };
}
