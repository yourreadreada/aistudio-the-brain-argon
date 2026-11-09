import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import * as pdfjsLib from 'pdfjs-dist';

import {
  formatReadableTitle,
  cleanTitleFromFileName,
  configurePdfWorker,
  extractItemsFromFile,
} from '../src/services/fileExtractor';
import {
  normalizeWhitespaceAndCase,
  normalizeContentForDuplicateCheck,
  areDocumentsExactDuplicates,
  detectIncrementalDiff,
} from '../src/services/semanticChunker';
import { brainStore } from '../src/services/brainStorage';
import {
  isItemEligibleForAction,
  canSilentlyImportItem,
  getDefaultResolutionForDuplicateState,
  applyBulkTitleFormatting,
  applyBulkSourceAssignment,
  ImportReviewItem,
} from '../src/components/ImportReviewQueue';
import { reconcileIntraQueueDuplicates } from '../src/components/CaptureHubModal';

/**
 * Helper to build a valid minimal PDF binary in memory.
 * When `text` is provided, embeds a valid BT/ET text stream on Page 1;
 * when `text` is empty, creates a valid page with an empty content stream (simulating a scanned/image-only PDF without a text layer).
 */
function buildMinimalPdfBuffer(text?: string): Uint8Array {
  const streamContent = text
    ? `BT /F1 12 Tf 72 720 Td (${text.replace(/([()\\])/g, '\\$1')}) Tj ET`
    : '';

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(pdf, 'utf8'));
}

/**
 * Helper to build a valid multi-page PDF binary in memory.
 */
function buildMultiPagePdfBuffer(pageTexts: string[]): Uint8Array {
  const objects: string[] = [];
  // 1: Catalog, 2: Pages, 3: Font
  const pageObjNums: number[] = [];
  let nextObjNum = 4;

  const pageEntries: { pageObj: string; streamObj: string }[] = [];
  for (const text of pageTexts) {
    const pageNum = nextObjNum++;
    const streamNum = nextObjNum++;
    pageObjNums.push(pageNum);
    const streamContent = text
      ? `BT /F1 12 Tf 72 720 Td (${text.replace(/([()\\])/g, '\\$1')}) Tj ET`
      : '';
    pageEntries.push({
      pageObj: `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${streamNum} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`,
      streamObj: `${streamNum} 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    });
  }

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageTexts.length} >>\nendobj\n`
  );
  objects.push(
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  );
  for (const entry of pageEntries) {
    objects.push(entry.pageObj);
    objects.push(entry.streamObj);
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(pdf, 'utf8'));
}

/**
 * Helper to build a valid minimal .xlsx OpenXML workbook archive using JSZip
 * so `read-excel-file/universal` can parse multiple sheets and rows.
 */
async function buildMinimalXlsxBuffer(
  sheets: Array<{ name: string; rows: Array<Array<string | number>> }>
): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('\n  ')}
</Types>`
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  );

  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheets
      .map(
        (s, i) =>
          `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
      )
      .join('\n    ')}
  </sheets>
</workbook>`
  );

  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('\n  ')}
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );

  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf/></cellStyleXfs>
  <cellXfs count="1"><xf/></cellXfs>
</styleSheet>`
  );

  const colLetter = (colIdx: number): string => {
    let n = colIdx + 1;
    let s = '';
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - m) / 26);
    }
    return s;
  };

  sheets.forEach((sheet, sIdx) => {
    const rowsXml = sheet.rows
      .map((row, rIdx) => {
        const cellsXml = row
          .map((cell, cIdx) => {
            const ref = `${colLetter(cIdx)}${rIdx + 1}`;
            if (typeof cell === 'number') {
              return `<c r="${ref}"><v>${cell}</v></c>`;
            }
            const escaped = String(cell)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            return `<c r="${ref}" t="inlineStr"><is><t>${escaped}</t></is></c>`;
          })
          .join('');
        return `<row r="${rIdx + 1}">${cellsXml}</row>`;
      })
      .join('\n    ');

    zip.file(
      `xl/worksheets/sheet${sIdx + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${rowsXml}
  </sheetData>
</worksheet>`
    );
  });

  return zip.generateAsync({ type: 'uint8array' });
}

function makeFileFromBytes(
  bytes: Uint8Array | string,
  fileName: string,
  mimeType = 'application/octet-stream'
): File {
  const part = typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes;
  return new File([part as unknown as BlobPart], fileName, { type: mimeType });
}

describe('1. Duplicate Detection Improvements', () => {
  const testBrain = 'dup_test_brain';

  beforeEach(() => {
    brainStore.createBrain(testBrain);
    const existing = brainStore.recall(testBrain, '', null, null);
    for (const f of existing) {
      brainStore.forget(f.id);
    }
  });

  it('normalizes whitespace, casing, and auto-generated leading document-title headings', () => {
    const rawDoc =
      'FastAPI order queue uses Redis pub/sub for real-time token updates.\n\nNo polling required.';
    const storedWithAutoHeading = `# Canteen Architecture RFC\n\n  fastapi   order queue uses redis pub/sub for real-time token updates.\r\n\r\nno polling required.  `;
    const renamedWithDifferentHeading = `# Copy Of Canteen Spec\n\nFastAPI order queue uses Redis pub/sub for real-time token updates.\n\nNo polling required.`;

    assert.equal(
      normalizeWhitespaceAndCase('  Hello   WORLD\r\n\tTest  '),
      'hello world test'
    );

    assert.equal(
      areDocumentsExactDuplicates(
        rawDoc,
        storedWithAutoHeading,
        ['canteen_architecture_rfc.md'],
        ['Canteen Architecture RFC', 'canteen_architecture_rfc.md']
      ),
      true
    );

    assert.equal(
      areDocumentsExactDuplicates(
        storedWithAutoHeading,
        renamedWithDifferentHeading,
        ['Canteen Architecture RFC', 'canteen_architecture_rfc.md'],
        ['Copy Of Canteen Spec', 'copy_of_canteen_spec.md']
      ),
      true
    );
  });

  it('detects exact duplicate documents in brainStore even when filenames and paths differ', async () => {
    const docBody =
      'Vector memory cache stores the top 5 semantic sections and last 3 conversation turns to minimize token overhead.';

    // Store initial document with auto-generated leading heading
    await brainStore.persistReviewedItem({
      action: 'create',
      brain: testBrain,
      source: 'claude',
      title: 'Context Window Strategy',
      content: docBody,
      fileName: 'context_window_strategy.md',
      filePath: 'docs/architecture/context_window_strategy.md',
      fileType: 'md',
      tags: ['memory'],
    });

    // Check an identical document under a completely different filename and archive path, with varied casing/whitespace
    const incomingVariant = `  VECTOR memory cache stores the top 5 semantic sections   and last 3 conversation turns to minimize token overhead. \n`;
    const checkResult = brainStore.checkExistingFileNode(
      testBrain,
      'renamed_backup_notes_v2.txt',
      incomingVariant,
      'backups/2026/renamed_backup_notes_v2.txt',
      'Renamed Backup Notes v2'
    );

    assert.equal(checkResult.exists, true);
    assert.equal(checkResult.isIdentical, true);
    assert.equal(checkResult.duplicateState, 'exact_duplicate');
    assert.equal(checkResult.recommendedAction, 'skip');
    assert.ok(checkResult.existingFact);
    assert.equal(
      checkResult.existingFact?.fileName,
      'context_window_strategy.md'
    );
  });

  it('detects identical files inside ZIP archives while preserving original filenames and archive paths', async () => {
    const sharedContent =
      'Bellman-Ford distance vector routing implementation with poison reverse and split horizon.';

    const zip = new JSZip();
    zip.file('semester_5/cn_routing_notes.md', sharedContent);
    zip.file(
      'archive_backup/duplicate_routing_copy.md',
      `  bellman-ford distance vector routing   implementation with poison reverse and split horizon.\r\n`
    );
    zip.file(
      'semester_5/distinct_os_notes.md',
      'Virtual memory page replacement uses clock algorithm and TLB shootdown optimizations.'
    );

    const zipBytes = await zip.generateAsync({ type: 'uint8array' });
    const zipFile = makeFileFromBytes(
      zipBytes,
      'course_notes_bundle.zip',
      'application/zip'
    );

    const extracted = await extractItemsFromFile(zipFile);
    assert.equal(extracted.length, 3);

    // Verify original filenames and archive paths are preserved
    const paths = extracted.map((e) => e.filePath).sort();
    assert.deepEqual(paths, [
      'archive_backup/duplicate_routing_copy.md',
      'semester_5/cn_routing_notes.md',
      'semester_5/distinct_os_notes.md',
    ]);

    // Stage into review queue items and run intra-queue duplicate reconciliation
    const stagedItems: ImportReviewItem[] = extracted.map((ext, idx) => {
      const check = brainStore.checkExistingFileNode(
        testBrain,
        ext.fileName,
        ext.text,
        ext.filePath,
        ext.title
      );
      const dupState = check.duplicateState || 'new';
      return {
        id: `zip-item-${idx}`,
        title: ext.title,
        fileName: ext.fileName,
        filePath: ext.filePath,
        fileType: ext.fileType,
        archiveParent: ext.archiveParent,
        extension: ext.extension,
        sizeBytes: ext.sizeBytes,
        text: ext.text,
        source: ext.detectedSource,
        destinationBrain: testBrain,
        itemCount: 1,
        itemUnitLabel: 'document',
        status: 'ready',
        duplicateState: dupState,
        nodeCheck: check,
        resolution: getDefaultResolutionForDuplicateState(dupState),
        tags: ['archive-import'],
      };
    });

    const reconciled = reconcileIntraQueueDuplicates(stagedItems);
    const firstRouting = reconciled.find(
      (i) => i.filePath === 'semester_5/cn_routing_notes.md'
    )!;
    const secondRouting = reconciled.find(
      (i) => i.filePath === 'archive_backup/duplicate_routing_copy.md'
    )!;
    const distinctOs = reconciled.find(
      (i) => i.filePath === 'semester_5/distinct_os_notes.md'
    )!;

    assert.equal(firstRouting.duplicateState, 'new');
    assert.equal(firstRouting.resolution, 'create');
    assert.equal(firstRouting.fileName, 'cn_routing_notes.md');
    assert.equal(firstRouting.filePath, 'semester_5/cn_routing_notes.md');

    assert.equal(secondRouting.duplicateState, 'exact_duplicate');
    assert.equal(secondRouting.resolution, 'skip');
    assert.equal(secondRouting.fileName, 'duplicate_routing_copy.md');
    assert.equal(
      secondRouting.filePath,
      'archive_backup/duplicate_routing_copy.md'
    );

    assert.equal(distinctOs.duplicateState, 'new');
    assert.equal(distinctOs.resolution, 'create');
  });

  it('distinguishes exact duplicates from related content and never treats partial matches as exact duplicates', async () => {
    const fullDocument = [
      '# System Architecture',
      '',
      'Section 1: The ingestion pipeline validates file headers and extracts structured Markdown sections locally.',
      '',
      'Section 2: The SQLite persistence engine stores unified context nodes with full merge history.',
    ].join('\n');

    await brainStore.persistReviewedItem({
      action: 'create',
      brain: testBrain,
      source: 'claude',
      title: 'System Architecture',
      content: fullDocument,
      fileName: 'system_architecture.md',
      filePath: 'system_architecture.md',
      fileType: 'md',
      tags: ['architecture'],
    });

    // Partial match (only Section 1 under a different filename)
    const partialDocument =
      'Section 1: The ingestion pipeline validates file headers and extracts structured Markdown sections locally.';

    const partialCheck = brainStore.checkExistingFileNode(
      testBrain,
      'partial_notes.md',
      partialDocument,
      'partial_notes.md',
      'Partial Notes'
    );

    assert.equal(partialCheck.isIdentical, false);
    assert.notEqual(partialCheck.duplicateState, 'exact_duplicate');
    assert.equal(partialCheck.duplicateState, 'related_content');
    assert.equal(partialCheck.recommendedAction, 'ask_user');

    // Genuinely different document
    const genuinelyDifferent =
      'Quantum key distribution protocols rely on BB84 polarization states to detect eavesdropping on optical fibers.';

    const differentCheck = brainStore.checkExistingFileNode(
      testBrain,
      'quantum_crypto_notes.md',
      genuinelyDifferent,
      'quantum_crypto_notes.md',
      'Quantum Crypto Notes'
    );

    assert.equal(differentCheck.exists, false);
    assert.equal(differentCheck.isIdentical, false);
    assert.equal(differentCheck.duplicateState, 'new');
    assert.equal(differentCheck.recommendedAction, 'create');
    // Same filename, same content -> exact_duplicate
    const sameFileSameContent = brainStore.checkExistingFileNode(
      testBrain,
      'system_architecture.md',
      fullDocument,
      'system_architecture.md',
      'System Architecture'
    );
    assert.equal(sameFileSameContent.exists, true);
    assert.equal(sameFileSameContent.isIdentical, true);
    assert.equal(sameFileSameContent.duplicateState, 'exact_duplicate');

    // Same filename, different content -> possible_duplicate (never exact_duplicate)
    const sameFileDifferentContent = brainStore.checkExistingFileNode(
      testBrain,
      'system_architecture.md',
      '# System Architecture\n\nUpdated Section 3: Added WebSocket real-time sync layer.',
      'system_architecture.md',
      'System Architecture'
    );
    assert.equal(sameFileDifferentContent.exists, true);
    assert.equal(sameFileDifferentContent.isIdentical, false);
    assert.equal(sameFileDifferentContent.duplicateState, 'possible_duplicate');
  });
});

describe('2. PDF Extraction & Worker Configuration', () => {
  it('configures local package PDF.js worker and eliminates hard-coded CDN version mismatches', () => {
    const workerSrc = configurePdfWorker(pdfjsLib);
    assert.ok(workerSrc, 'Worker source URL must be configured');
    assert.equal(
      workerSrc.includes('cdnjs.cloudflare.com'),
      false,
      'Worker must not point to an external Cloudflare CDN version'
    );
    assert.equal(
      workerSrc.includes('4.10.38'),
      false,
      'Worker must not reference the outdated 4.10.38 version'
    );
    assert.equal(
      workerSrc.includes('pdf.worker.min.mjs'),
      true,
      'Worker must point to the local pdfjs-dist package worker'
    );

    const extractorSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/fileExtractor.ts'),
      'utf8'
    );
    assert.equal(
      extractorSource.includes('cdnjs.cloudflare.com/ajax/libs/pdf.js'),
      false
    );
  });

  it('extracts text from single-page and multi-page PDFs and preserves original filename alongside Title Case display title', async () => {
    const pdfBytes = buildMinimalPdfBuffer(
      'Argon local brain PDF extraction verification test'
    );
    const pdfFile = makeFileFromBytes(
      pdfBytes,
      'argon_local_pdf_verification.pdf',
      'application/pdf'
    );

    const results = await extractItemsFromFile(pdfFile);
    assert.equal(results.length, 1);
    const item = results[0];

    assert.equal(item.status, 'success');
    assert.equal(item.fileName, 'argon_local_pdf_verification.pdf');
    assert.equal(item.filePath, 'argon_local_pdf_verification.pdf');
    assert.equal(item.title, 'Argon Local PDF Verification');
    assert.equal(item.pageOrItemCount, 1);
    assert.ok(
      item.text.includes('Argon local brain PDF extraction verification test'),
      `Expected extracted text to contain PDF content, got: ${item.text}`
    );

    // Multi-page PDF test
    const multiPageBytes = buildMultiPagePdfBuffer([
      'First page executive overview of local memory',
      'Second page detailed SQLite schema notes',
    ]);
    const multiPageFile = makeFileFromBytes(
      multiPageBytes,
      'multi_page_architecture_notes_v2.pdf',
      'application/pdf'
    );
    const multiResults = await extractItemsFromFile(multiPageFile);
    assert.equal(multiResults.length, 1);
    assert.equal(multiResults[0].status, 'success');
    assert.equal(multiResults[0].pageOrItemCount, 2);
    assert.equal(multiResults[0].title, 'Multi Page Architecture Notes V2');
    assert.ok(multiResults[0].text.includes('## Page 1'));
    assert.ok(multiResults[0].text.includes('## Page 2'));
    assert.ok(
      multiResults[0].text.includes('Second page detailed SQLite schema notes')
    );
  });

  it('returns a clear error for malformed or corrupted PDF files', async () => {
    const missingHeaderFile = makeFileFromBytes(
      'NOT_A_VALID_PDF_BINARY_HEADER_CONTENT',
      'corrupted_report.pdf',
      'application/pdf'
    );

    const results1 = await extractItemsFromFile(missingHeaderFile);
    assert.equal(results1.length, 1);
    assert.equal(results1[0].status, 'error');
    assert.ok(
      results1[0].statusMessage?.includes('Malformed or corrupted PDF file'),
      `Expected malformed PDF error message, got: ${results1[0].statusMessage}`
    );

    const brokenStreamFile = makeFileFromBytes(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Broken >>>>\ntrailer\n%%EOF',
      'truncated_stream.pdf',
      'application/pdf'
    );
    const results2 = await extractItemsFromFile(brokenStreamFile);
    assert.equal(results2.length, 1);
    assert.equal(results2[0].status, 'error');
    assert.ok(
      results2[0].statusMessage?.includes('Malformed or corrupted PDF file'),
      `Expected malformed PDF error message for broken stream, got: ${results2[0].statusMessage}`
    );
  });

  it('returns a clear error for scanned or image-only PDFs without an extractable text layer', async () => {
    const emptyTextLayerPdf = buildMinimalPdfBuffer('');
    const scannedFile = makeFileFromBytes(
      emptyTextLayerPdf,
      'scanned_handwritten_lecture.pdf',
      'application/pdf'
    );

    const results = await extractItemsFromFile(scannedFile);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'error');
    assert.ok(
      results[0].statusMessage?.includes(
        'Scanned or image-only PDF: no extractable text layer found'
      ),
      `Expected scanned PDF error message, got: ${results[0].statusMessage}`
    );
  });
});

describe('2b. Safe Spreadsheet (.xlsx) Extraction via read-excel-file', () => {
  it('extracts multi-sheet .xlsx workbooks into structured Markdown using read-excel-file', async () => {
    const xlsxBytes = await buildMinimalXlsxBuffer([
      {
        name: 'Latency Benchmarks',
        rows: [
          ['Endpoint', 'P95_ms', 'Status'],
          ['/api/recall', 12, 'Optimal'],
          ['/api/ingest', 28, 'Optimal'],
        ],
      },
      {
        name: 'Storage Limits',
        rows: [
          ['Format', 'Limit_MB'],
          ['PDF', 25],
          ['XLSX', 15],
        ],
      },
    ]);

    const xlsxFile = makeFileFromBytes(
      xlsxBytes,
      'database_load_benchmarks_v2.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const results = await extractItemsFromFile(xlsxFile);
    assert.equal(results.length, 1);
    const item = results[0];
    assert.equal(item.status, 'success');
    assert.equal(item.title, 'Database Load Benchmarks V2');
    assert.equal(item.fileName, 'database_load_benchmarks_v2.xlsx');
    assert.equal(item.pageOrItemCount, 2);
    assert.ok(item.text.includes('## Sheet: Latency Benchmarks'));
    assert.ok(item.text.includes('/api/recall | 12 | Optimal'));
    assert.ok(item.text.includes('## Sheet: Storage Limits'));
  });

  it('enforces row limits on large .xlsx spreadsheets and surfaces a clear truncation warning', async () => {
    const manyRows: Array<Array<string | number>> = [['RowIndex', 'Payload']];
    for (let i = 1; i <= 540; i++) {
      manyRows.push([i, `Record_${i}`]);
    }
    const largeXlsxBytes = await buildMinimalXlsxBuffer([
      { name: 'LargeLog', rows: manyRows },
    ]);
    const largeXlsxFile = makeFileFromBytes(
      largeXlsxBytes,
      'large_telemetry_log.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const results = await extractItemsFromFile(largeXlsxFile);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, 'warning');
    assert.ok(
      results[0].statusMessage?.includes('truncated'),
      `Expected truncation warning in statusMessage, got: ${results[0].statusMessage}`
    );
    assert.ok(results[0].text.includes('[Truncated:'));
  });

  it('rejects unsupported legacy binary .xls files with instructions to save as .xlsx and handles malformed .xlsx safely', async () => {
    const legacyXlsFile = makeFileFromBytes(
      new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      'legacy_financial_sheet.xls',
      'application/vnd.ms-excel'
    );
    const xlsResults = await extractItemsFromFile(legacyXlsFile);
    assert.equal(xlsResults.length, 1);
    assert.equal(xlsResults[0].status, 'error');
    assert.ok(
      xlsResults[0].statusMessage?.includes('save/export it as .xlsx'),
      `Expected .xls guidance message, got: ${xlsResults[0].statusMessage}`
    );

    const malformedXlsxFile = makeFileFromBytes(
      'CORRUPTED_NON_ZIP_XLSX_PAYLOAD',
      'corrupted_workbook.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const badResults = await extractItemsFromFile(malformedXlsxFile);
    assert.equal(badResults.length, 1);
    assert.equal(badResults[0].status, 'error');
    assert.ok(
      badResults[0].statusMessage?.includes('Malformed or corrupted .xlsx'),
      `Expected malformed .xlsx error message, got: ${badResults[0].statusMessage}`
    );
  });
});

describe('3. Activity Log Sidebar & History Behavior', () => {
  it('removes the numerical activity count badge from BrainSidebar while keeping the Activity Log button accessible', () => {
    const sidebarSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/BrainSidebar.tsx'),
      'utf8'
    );

    assert.equal(
      sidebarSource.includes("onSelectViewMode('activity')") ||
        sidebarSource.includes('onClick={onToggleRecentActivity}'),
      true
    );
    assert.equal(sidebarSource.includes('<span>Activity Log</span>'), true);
    assert.equal(sidebarSource.includes('{recentActivityCount}'), false);
  });

  it('continues recording and returning recent activity items in brainStore', async () => {
    const testBrain = 'activity_test_brain';
    brainStore.createBrain(testBrain);
    const beforeCount = brainStore.getRecentActivities().length;

    const saved = brainStore.remember(
      testBrain,
      'Activity history recording check for local brain store.',
      'claude',
      'activity_check.md',
      'md'
    );

    const activities = brainStore.getRecentActivities();
    assert.ok(activities.length >= beforeCount);
    assert.ok(activities.some((a) => a.factId === saved.id));
    brainStore.forget(saved.id);
  });
});

describe('4. Display Names & Filename Preservation', () => {
  it('converts lowercase, underscore-separated, and hyphen-separated filenames into readable Title Case', () => {
    assert.equal(
      cleanTitleFromFileName('my_project_notes_final_v2.pdf'),
      'My Project Notes Final V2'
    );
    assert.equal(
      cleanTitleFromFileName('dog_translator_mfcc.py'),
      'Dog Translator MFCC'
    );
    assert.equal(
      cleanTitleFromFileName('canteen-system-architecture-rfc.docx'),
      'Canteen System Architecture RFC'
    );
    assert.equal(
      cleanTitleFromFileName('exports/claude/rag_architectures_for_llm_memory.pdf'),
      'RAG Architectures for LLM Memory'
    );
    assert.equal(
      formatReadableTitle('notes_on_api_and_sql_performance_v2'),
      'Notes on API and SQL Performance V2'
    );
  });

  it('preserves original filenames and file paths independently of formatted display titles during extraction', async () => {
    const mdFile = makeFileFromBytes(
      'Detailed notes on FastAPI and SQLite local persistence.',
      'fastapi_sqlite_persistence_notes.md',
      'text/markdown'
    );

    const extracted = await extractItemsFromFile(mdFile);
    assert.equal(extracted.length, 1);
    assert.equal(extracted[0].title, 'FastAPI SQLite Persistence Notes');
    assert.equal(extracted[0].fileName, 'fastapi_sqlite_persistence_notes.md');
    assert.equal(extracted[0].filePath, 'fastapi_sqlite_persistence_notes.md');
  });
});

describe('5. Bulk Review Experience & Duplicate Safety Rules', () => {
  const sampleQueue: ImportReviewItem[] = [
    {
      id: 'item-1',
      title: 'raw_lowercase_meeting_notes',
      fileName: 'raw_lowercase_meeting_notes.md',
      filePath: 'meetings/raw_lowercase_meeting_notes.md',
      fileType: 'md',
      extension: '.md',
      sizeBytes: 512,
      text: 'Meeting notes content about architecture.',
      source: 'claude',
      destinationBrain: 'coding',
      itemCount: 1,
      itemUnitLabel: 'document',
      status: 'ready',
      duplicateState: 'new',
      resolution: 'create',
      tags: [],
    },
    {
      id: 'item-2',
      title: 'api-gateway-auth-flow',
      fileName: 'api-gateway-auth-flow.txt',
      filePath: 'specs/api-gateway-auth-flow.txt',
      fileType: 'md',
      extension: '.txt',
      sizeBytes: 640,
      text: 'Gateway token validation flow.',
      source: 'claude',
      destinationBrain: 'coding',
      itemCount: 1,
      itemUnitLabel: 'document',
      status: 'ready',
      duplicateState: 'possible_duplicate',
      resolution: 'undecided',
      tags: [],
    },
    {
      id: 'item-3-imported',
      title: 'already_imported_file',
      fileName: 'already_imported_file.md',
      filePath: 'already_imported_file.md',
      fileType: 'md',
      extension: '.md',
      sizeBytes: 300,
      text: 'Already persisted content.',
      source: 'gpt',
      destinationBrain: 'coding',
      itemCount: 1,
      itemUnitLabel: 'document',
      status: 'imported',
      duplicateState: 'new',
      resolution: 'create',
      tags: [],
    },
    {
      id: 'item-4-unknown',
      title: 'unknown_duplicate_status_doc',
      fileName: 'unknown_duplicate_status_doc.md',
      filePath: 'unknown_duplicate_status_doc.md',
      fileType: 'md',
      extension: '.md',
      sizeBytes: 250,
      text: 'Content with unverified duplicate status.',
      source: 'claude',
      destinationBrain: 'coding',
      itemCount: 1,
      itemUnitLabel: 'document',
      status: 'ready',
      duplicateState: 'unable_to_determine',
      resolution: getDefaultResolutionForDuplicateState('unable_to_determine'),
      tags: [],
    },
  ];

  it('supports bulk title formatting on selected items while preserving original filenames and paths', () => {
    const { updatedItems, formattedCount } = applyBulkTitleFormatting(
      sampleQueue,
      ['item-1', 'item-2', 'item-3-imported']
    );

    // Only non-imported, non-busy selected items are formatted
    assert.equal(formattedCount, 2);
    assert.equal(updatedItems[0].title, 'Raw Lowercase Meeting Notes');
    assert.equal(updatedItems[0].fileName, 'raw_lowercase_meeting_notes.md');
    assert.equal(
      updatedItems[0].filePath,
      'meetings/raw_lowercase_meeting_notes.md'
    );

    assert.equal(updatedItems[1].title, 'API Gateway Auth Flow');
    assert.equal(updatedItems[1].fileName, 'api-gateway-auth-flow.txt');
    assert.equal(updatedItems[1].filePath, 'specs/api-gateway-auth-flow.txt');

    // Already imported item is untouched
    assert.equal(updatedItems[2].title, 'already_imported_file');
  });

  it('supports bulk source assignment on selected items without modifying filenames, paths, or already-imported items', () => {
    const { updatedItems, updatedCount } = applyBulkSourceAssignment(
      sampleQueue,
      ['item-1', 'item-2', 'item-3-imported'],
      'gemini'
    );

    assert.equal(updatedCount, 2);
    assert.equal(updatedItems[0].source, 'gemini');
    assert.equal(updatedItems[0].fileName, 'raw_lowercase_meeting_notes.md');
    assert.equal(updatedItems[1].source, 'gemini');
    assert.equal(updatedItems[1].filePath, 'specs/api-gateway-auth-flow.txt');
    // Already imported item remains 'gpt'
    assert.equal(updatedItems[2].source, 'gpt');
  });

  it('preserves Merge, Replace, and Skip eligibility rules and never allows unknown duplicate state to be silently imported', () => {
    const unknownItem = sampleQueue[3];
    assert.equal(unknownItem.duplicateState, 'unable_to_determine');
    assert.equal(unknownItem.resolution, 'undecided');

    // Merge and Replace are strictly blocked for 'unable_to_determine'
    assert.equal(isItemEligibleForAction(unknownItem, 'merge').eligible, false);
    assert.equal(
      isItemEligibleForAction(unknownItem, 'replace').eligible,
      false
    );
    // Skip is allowed
    assert.equal(isItemEligibleForAction(unknownItem, 'skip').eligible, true);

    // Unknown duplicate state must NEVER be silently imported, even if resolution is mutated
    assert.equal(canSilentlyImportItem(unknownItem), false);
    assert.equal(
      canSilentlyImportItem({ ...unknownItem, resolution: 'create' }),
      false
    );

    // Valid 'new' item with 'create' resolution can be imported
    assert.equal(canSilentlyImportItem(sampleQueue[0]), true);
    // 'possible_duplicate' with 'undecided' resolution cannot be silently imported
    assert.equal(canSilentlyImportItem(sampleQueue[1]), false);
  });
});

describe('6. Browser Companion — Project & Resource Capture Staging', () => {
  beforeEach(async () => {
    await brainStore.clearCompanionCaptures();
  });

  it('stages project instructions, artifacts, and documents with provenance and reports unreachable binary attachments', async () => {
    const result = await brainStore.stageCompanionProjectCapture({
      brain: 'coding',
      source: 'claude',
      projectName: 'Argon Memory Core',
      provenanceUrl: 'https://claude.ai/project/argon-memory-core',
      items: [
        {
          title: 'argon_project_instructions_v2',
          fileName: 'argon_project_instructions_v2.md',
          resourceKind: 'project_instructions',
          content:
            '# Argon Project Instructions\n\nPreserve local-first storage and route captures through ImportReviewQueue.',
        },
        {
          title: 'dedup_pipeline_artifact',
          fileName: 'dedup_pipeline_artifact.ts',
          fileType: 'code',
          resourceKind: 'artifact',
          content:
            'export function verifyDeduplication(a: string, b: string) { return a.trim() === b.trim(); }',
        },
      ],
      unreachableResources: [
        {
          name: 'scanned_whitepaper_attachment.pdf',
          kind: 'pdf',
          reason: 'Binary attachment card is not expanded in page DOM',
        },
      ],
    });

    assert.equal(result.stagedCount, 2);
    assert.equal(result.items.length, 2);
    assert.equal(result.unreachableResources.length, 1);
    assert.equal(
      result.unreachableResources[0].name,
      'scanned_whitepaper_attachment.pdf'
    );

    const staged = await brainStore.fetchCompanionCaptures();
    assert.equal(staged.length, 2);
    assert.equal(staged[0].projectName, 'Argon Memory Core');
    assert.equal(
      staged[0].provenanceUrl,
      'https://claude.ai/project/argon-memory-core'
    );
    assert.ok(
      staged[0].filePath.includes('claude-project/Argon Memory Core/'),
      `Expected project path prefix, got: ${staged[0].filePath}`
    );

    await brainStore.consumeCompanionCapture(staged[0].id);
    const remaining = await brainStore.fetchCompanionCaptures();
    assert.equal(remaining.length, 1);
  });
});
