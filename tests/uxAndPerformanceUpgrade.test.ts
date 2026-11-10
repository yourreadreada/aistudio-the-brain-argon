import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_IMPORT_CONCURRENCY,
  MIN_IMPORT_CONCURRENCY,
  MAX_IMPORT_CONCURRENCY,
  normalizeImportConcurrency,
  computeImportCheckpointKey,
  filterRemainingItemsAfterInterruption,
  runWithControlledConcurrency,
  ImportReviewItem,
} from '../src/components/ImportReviewQueue';
import { getNodeTimestampSummary } from '../src/components/FactPanel';
import {
  computeGraphSearchHighlightState,
  applySpatialGridForceLayout,
} from '../src/components/BrainViewerCanvas';
import { brainStore } from '../src/services/brainStorage';
import { Fact, AISource, GraphRelationshipType } from '../src/types/brain';

function createSyntheticFacts(count: number): Fact[] {
  const sources: AISource[] = [
    'claude',
    'gpt',
    'gemini',
    'github',
    'cursor',
    'local-ai',
    'moodle',
  ];
  const topics = [
    'neural-graph-engine',
    'sqlite-wal-backup',
    'semantic-chunker',
    'companion-bridge',
    'oauth-loopback',
    'vector-recall',
    'moodle-coursework',
    'cursor-refactor',
    'react-canvas-perf',
    'schema-migration',
  ];
  const tagPool = [
    'architecture',
    'performance',
    'sqlite',
    'canvas',
    'search',
    'timeline',
    'concurrency',
    'typescript',
    'security',
    'testing',
    'parser',
    'sync',
  ];

  const facts: Fact[] = [];
  for (let i = 1; i <= count; i++) {
    const source = sources[i % sources.length];
    const topicKey = `${topics[i % topics.length]}-${Math.floor(i / 8)}`;
    const tag1 = tagPool[i % tagPool.length];
    const tag2 = tagPool[(i + 3) % tagPool.length];
    const fixtureId = `F-${String(i).padStart(4, '0')}`;
    const refFixture = i > 5 && i % 7 === 0 ? `See related node F-${String(i - 3).padStart(4, '0')}` : '';

    facts.push({
      id: i,
      brain: 'perf-bench',
      content: `Synthetic memory node #${i} for ${topicKey}. Covers ${tag1} and ${tag2}. ${refFixture}`,
      source,
      created_at: new Date(1760000000000 + i * 60000).toISOString(),
      updated_at: new Date(1760000000000 + i * 60000 + (i % 3 === 0 ? 120000 : 0)).toISOString(),
      originalCreatedAt: i % 2 === 0 ? new Date(1759000000000 + i * 60000).toISOString() : null,
      importedAt: i % 4 !== 0 ? new Date(1760000000000 + i * 60000).toISOString() : undefined,
      fileName: `doc_${String(i).padStart(4, '0')}.md`,
      filePath: `${source}/doc_${String(i).padStart(4, '0')}.md`,
      documentTitle: `Node ${i}: ${topicKey}`,
      fixtureId,
      topicKey,
      tags: [tag1, tag2],
    });
  }
  return facts;
}

describe('Argon UX Refinement & Performance Engineering Suite', () => {
  describe('1. Import Queue — Configurable Concurrency & Interruption Protection', () => {
    it('keeps default concurrency at 3 and clamps custom concurrency values safely', () => {
      assert.equal(DEFAULT_IMPORT_CONCURRENCY, 3);
      assert.equal(MIN_IMPORT_CONCURRENCY, 1);
      assert.equal(MAX_IMPORT_CONCURRENCY, 8);
      assert.equal(normalizeImportConcurrency(undefined), 3);
      assert.equal(normalizeImportConcurrency(NaN), 3);
      assert.equal(normalizeImportConcurrency(0), 1);
      assert.equal(normalizeImportConcurrency(1), 1);
      assert.equal(normalizeImportConcurrency(3), 3);
      assert.equal(normalizeImportConcurrency(5), 5);
      assert.equal(normalizeImportConcurrency(99), 8);
    });

    it('enforces configured concurrency limit (e.g. 1, 3, 5) during batch execution', async () => {
      const items = Array.from({ length: 12 }, (_, idx) => idx + 1);

      for (const configuredLimit of [1, 3, 5]) {
        let active = 0;
        let maxObservedActive = 0;
        const processed: number[] = [];

        await runWithControlledConcurrency(items, configuredLimit, async (item) => {
          active++;
          if (active > maxObservedActive) {
            maxObservedActive = active;
          }
          await new Promise((r) => setTimeout(r, 6));
          processed.push(item);
          active--;
        });

        assert.equal(processed.length, 12);
        assert.ok(maxObservedActive <= configuredLimit);
        assert.ok(maxObservedActive >= Math.min(configuredLimit, 2));
      }
    });

    it('avoids reprocessing already-imported files after an interruption', async () => {
      const queue: ImportReviewItem[] = [
        {
          id: 'item-1',
          title: 'First File',
          fileName: 'first.md',
          filePath: 'claude/first.md',
          fileType: 'md',
          extension: '.md',
          sizeBytes: 120,
          text: 'First file content',
          checksum: 'chk-1',
          source: 'claude',
          destinationBrain: 'coding',
          itemCount: 1,
          itemUnitLabel: 'section',
          status: 'imported',
          duplicateState: 'new',
          resolution: 'create',
          tags: ['test'],
        },
        {
          id: 'item-2',
          title: 'Second File (Checkpointed before interruption)',
          fileName: 'second.md',
          filePath: 'claude/second.md',
          fileType: 'md',
          extension: '.md',
          sizeBytes: 140,
          text: 'Second file content',
          checksum: 'chk-2',
          source: 'claude',
          destinationBrain: 'coding',
          itemCount: 1,
          itemUnitLabel: 'section',
          status: 'ready',
          duplicateState: 'new',
          resolution: 'create',
          tags: ['test'],
        },
        {
          id: 'item-3',
          title: 'Third File (Pending after interruption)',
          fileName: 'third.md',
          filePath: 'claude/third.md',
          fileType: 'md',
          extension: '.md',
          sizeBytes: 160,
          text: 'Third file content',
          checksum: 'chk-3',
          source: 'claude',
          destinationBrain: 'coding',
          itemCount: 1,
          itemUnitLabel: 'section',
          status: 'ready',
          duplicateState: 'new',
          resolution: 'create',
          tags: ['test'],
        },
      ];

      const completedCheckpoints = new Set<string>([
        computeImportCheckpointKey(queue[1]),
      ]);

      const { remaining, alreadyImported } = filterRemainingItemsAfterInterruption(
        queue,
        completedCheckpoints
      );

      assert.deepEqual(alreadyImported.map((i) => i.id), ['item-1', 'item-2']);
      assert.deepEqual(remaining.map((i) => i.id), ['item-3']);

      const executedIds: string[] = [];
      let skippedCount = 0;

      await runWithControlledConcurrency(
        queue,
        DEFAULT_IMPORT_CONCURRENCY,
        async (item) => {
          executedIds.push(item.id);
        },
        {
          shouldSkip: (item) =>
            item.status === 'imported' ||
            completedCheckpoints.has(computeImportCheckpointKey(item)),
          onSkipped: () => {
            skippedCount++;
          },
        }
      );

      assert.equal(skippedCount, 2);
      assert.deepEqual(executedIds, ['item-3']);
    });
  });

  describe('2. Timeline & Node Inspector — Timestamp Metadata Consistency', () => {
    it('displays Created/Added, Original Document Date, Imported At, Last Modified, and Updated At without fabricating missing dates', () => {
      const manualFact: Fact = {
        id: 101,
        brain: 'coding',
        content: 'Direct workspace note',
        source: 'claude',
        created_at: '2026-10-01T10:00:00.000Z',
        updated_at: '2026-10-01T10:00:00.000Z',
        originalCreatedAt: null,
        importedAt: undefined,
      };

      const manualSummary = getNodeTimestampSummary(manualFact);
      assert.equal(manualSummary.createdAddedRaw, '2026-10-01T10:00:00.000Z');
      assert.equal(manualSummary.originalDocumentDateRaw, null);
      assert.equal(manualSummary.originalDocumentDate, 'Not specified in document');
      assert.equal(manualSummary.importedAtRaw, null);
      assert.equal(manualSummary.importedAt, 'Direct entry (not file-imported)');
      assert.equal(manualSummary.hasSeparateUpdate, false);

      const importedAndEditedFact: Fact = {
        id: 102,
        brain: 'coding',
        content: 'Imported specification later corrected',
        source: 'github',
        created_at: '2026-10-05T12:00:00.000Z',
        originalCreatedAt: '2026-09-15T08:30:00.000Z',
        importedAt: '2026-10-05T12:00:00.000Z',
        updated_at: '2026-10-08T16:45:00.000Z',
      };

      const editedSummary = getNodeTimestampSummary(importedAndEditedFact);
      assert.equal(editedSummary.createdAddedRaw, '2026-10-05T12:00:00.000Z');
      assert.equal(editedSummary.originalDocumentDateRaw, '2026-09-15T08:30:00.000Z');
      assert.notEqual(editedSummary.originalDocumentDate, 'Not specified in document');
      assert.equal(editedSummary.importedAtRaw, '2026-10-05T12:00:00.000Z');
      assert.equal(editedSummary.lastModifiedRaw, '2026-10-08T16:45:00.000Z');
      assert.equal(editedSummary.updatedAtRaw, '2026-10-08T16:45:00.000Z');
      assert.equal(editedSummary.hasSeparateUpdate, true);
    });
  });

  describe('3. Search — Graph Highlight, Dimming, Relationship Highlight & Clear State', () => {
    it('highlights matching nodes and their relationships, dims non-matching nodes, and restores state on clear', () => {
      const sampleFacts = createSyntheticFacts(20);
      const edges = brainStore.computeWorkspaceRelationships(sampleFacts);

      const targetTopic = sampleFacts[0].topicKey!;
      const activeSearchState = computeGraphSearchHighlightState(
        sampleFacts,
        edges,
        targetTopic,
        null,
        'perf-bench'
      );

      assert.equal(activeSearchState.isSearchActive, true);
      assert.ok(activeSearchState.matchingFactIds.size > 0);
      assert.equal(
        activeSearchState.dimmedFactIds.size,
        sampleFacts.length - activeSearchState.matchingFactIds.size
      );
      assert.ok(activeSearchState.highlightedEdgeIds.size > 0);

      const clearedState = computeGraphSearchHighlightState(
        sampleFacts,
        edges,
        '',
        null,
        'perf-bench'
      );
      assert.equal(clearedState.isSearchActive, false);
      assert.equal(clearedState.matchingFactIds.size, 0);
      assert.equal(clearedState.dimmedFactIds.size, 0);
      assert.equal(clearedState.highlightedEdgeIds.size, 0);
    });
  });

  describe('4. Progressive Graph Performance Benchmarks (200, 500, 1,000, and 5,000 Nodes)', () => {
    it('computes relationships, force layout, and search highlighting smoothly across 200, 500, 1,000, and 5,000 nodes', () => {
      const sizes = [200, 500, 1000, 5000];
      const report: Record<
        number,
        {
          edgesCount: number;
          relationshipsMs: number;
          cachedRelationshipsMs: number;
          forceLayoutMs: number;
          searchHighlightMs: number;
        }
      > = {};

      for (const size of sizes) {
        const dataset = createSyntheticFacts(size);

        const tRel0 = performance.now();
        const edges = brainStore.computeWorkspaceRelationships(dataset);
        const relationshipsMs = Number((performance.now() - tRel0).toFixed(2));

        const tCache0 = performance.now();
        const cachedEdges = brainStore.computeWorkspaceRelationships(dataset);
        const cachedRelationshipsMs = Number((performance.now() - tCache0).toFixed(3));
        assert.equal(cachedEdges.length, edges.length);

        const nodeList = [
          {
            id: 'center-hub',
            isCenter: true,
            unclusteredBaseX: 0,
            unclusteredBaseY: 0,
          },
          ...dataset.map((f, idx) => {
            const angle = (idx / dataset.length) * Math.PI * 2;
            const radius = 160 + (idx % 12) * 14;
            return {
              id: `fact-${f.id}`,
              unclusteredBaseX: Math.cos(angle) * radius,
              unclusteredBaseY: Math.sin(angle) * radius,
            };
          }),
        ];
        const lineList = edges.slice(0, Math.min(edges.length, size * 3)).map((e, idx) => ({
          a: 0,
          b: (idx % dataset.length) + 1,
          relationshipType: e.type as GraphRelationshipType,
        }));

        const tForce0 = performance.now();
        applySpatialGridForceLayout(nodeList, lineList, size > 120);
        const forceLayoutMs = Number((performance.now() - tForce0).toFixed(2));

        const tSearch0 = performance.now();
        const hl = computeGraphSearchHighlightState(
          dataset,
          edges,
          'sqlite-wal-backup',
          null,
          'perf-bench'
        );
        const searchHighlightMs = Number((performance.now() - tSearch0).toFixed(2));
        assert.ok(hl.matchingFactIds.size > 0);

        report[size] = {
          edgesCount: edges.length,
          relationshipsMs,
          cachedRelationshipsMs,
          forceLayoutMs,
          searchHighlightMs,
        };

        assert.ok(relationshipsMs < 500, `Expected relationshipsMs < 500, got ${relationshipsMs}`);
        assert.ok(cachedRelationshipsMs < 5, `Expected cachedRelationshipsMs < 5, got ${cachedRelationshipsMs}`);
        assert.ok(forceLayoutMs < 500, `Expected forceLayoutMs < 500, got ${forceLayoutMs}`);
        assert.ok(searchHighlightMs < 250, `Expected searchHighlightMs < 250, got ${searchHighlightMs}`);
      }

      console.log('GRAPH_PERFORMANCE_BENCHMARKS:', JSON.stringify(report));
    });
  });
});
