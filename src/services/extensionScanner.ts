export interface ScannedCompanionItem {
  title: string;
  fileName: string;
  filePath: string;
  fileType: 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'code' | 'md' | 'img' | 'chat';
  content: string;
  source: 'claude' | 'gpt' | 'gemini' | 'github' | 'moodle' | 'cursor' | 'local-ai';
  projectName?: string;
  provenanceUrl: string;
  resourceKind: 'conversation' | 'project_instructions' | 'artifact' | 'document' | 'code';
  tags: string[];
  truncated?: boolean;
  originalLength?: number;
}

export interface ScannedUnreachableResource {
  name: string;
  kind: string;
  reason: string;
}

export interface ScanMetrics {
  discovered: number;
  captured: number;
  skipped: number;
  failed: number;
}

export interface ActivePageScanResult {
  title: string;
  projectName: string;
  url: string;
  source: 'claude' | 'gpt' | 'gemini' | 'github' | 'moodle' | 'cursor' | 'local-ai';
  items: ScannedCompanionItem[];
  unreachableResources: ScannedUnreachableResource[];
  metrics: ScanMetrics;
}

export interface ScannerOptions {
  maxContentCharsPerItem?: number;
  maxGitHubFileFetches?: number;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;
}

const BINARY_EXTENSIONS_REGEX =
  /\.(pdf|docx|doc|xlsx|xls|pptx|ppt|zip|tar|gz|7z|rar|png|jpg|jpeg|gif|webp|ico|mp3|mp4|wav|mov|avi|woff|woff2|ttf|otf|eot|exe|dll|so|dylib|bin|wasm|pyc|class|jar)$/i;

const READABLE_TEXT_EXTENSIONS_REGEX =
  /\.(md|markdown|txt|ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|c|cpp|h|hpp|cs|rb|php|swift|kt|sql|sh|bash|zsh|yaml|yml|toml|ini|env\.example|dockerfile|makefile|html|css|scss|csv|xml)$/i;

export function inferCompanionFileType(
  fileName: string,
  defaultType: ScannedCompanionItem['fileType'] = 'md'
): ScannedCompanionItem['fileType'] {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['docx', 'doc'].includes(ext)) return 'docx';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'xlsx';
  if (['pptx', 'ppt'].includes(ext)) return 'pptx';
  if (
    [
      'ts',
      'tsx',
      'js',
      'jsx',
      'mjs',
      'cjs',
      'py',
      'rs',
      'go',
      'java',
      'c',
      'cpp',
      'h',
      'cs',
      'rb',
      'php',
      'swift',
      'kt',
      'sql',
      'sh',
      'yaml',
      'yml',
      'toml',
      'json',
      'html',
      'css',
    ].includes(ext)
  ) {
    return 'code';
  }
  if (['md', 'markdown', 'txt'].includes(ext)) return 'md';
  if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext)) return 'img';
  return defaultType;
}

export function normalizeSignatureContent(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/^#\s+[^\n]+\n+/i, '')
    .replace(/^>\s*Provenance:[^\n]+\n*/gim, '')
    .replace(/^>\s*Project:[^\n]+\n*/gim, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Parses a GitHub URL into owner, repo, viewType ('repo_root' | 'tree' | 'blob' | 'other'),
 * branch, and relative path inside the repository.
 */
export function parseGitHubUrl(urlStr: string): {
  isGitHubRepo: boolean;
  owner: string;
  repo: string;
  branch: string;
  viewType: 'repo_root' | 'tree' | 'blob' | 'other';
  relativePath: string;
} | null {
  try {
    const parsed = new URL(urlStr);
    if (!parsed.hostname.includes('github.com')) return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;

    const reservedRoots = new Set([
      'settings',
      'notifications',
      'explore',
      'marketplace',
      'pulls',
      'issues',
      'codespaces',
      'sponsors',
      'orgs',
      'users',
      'login',
      'signup',
      'features',
      'pricing',
      'search',
    ]);
    const owner = segments[0];
    const repo = segments[1].replace(/\.git$/i, '');
    if (reservedRoots.has(owner.toLowerCase())) return null;

    if (segments.length === 2) {
      return {
        isGitHubRepo: true,
        owner,
        repo,
        branch: 'HEAD',
        viewType: 'repo_root',
        relativePath: '',
      };
    }

    const action = segments[2];
    if (action === 'tree' || action === 'blob') {
      const branch = segments[3] || 'HEAD';
      const relativePath = segments.slice(4).join('/');
      return {
        isGitHubRepo: true,
        owner,
        repo,
        branch,
        viewType: action,
        relativePath,
      };
    }

    return {
      isGitHubRepo: true,
      owner,
      repo,
      branch: 'HEAD',
      viewType: 'other',
      relativePath: segments.slice(2).join('/'),
    };
  } catch {
    return null;
  }
}

/**
 * Deliberate active-page scanner supporting Claude, ChatGPT, Gemini, and GitHub repositories.
 * Works both inside browser extension `executeScript` and in automated Node tests with DOM mocks.
 */
export async function scanActivePageAndResources(
  doc: any,
  loc: { hostname: string; href: string; origin?: string },
  options: ScannerOptions = {}
): Promise<ActivePageScanResult> {
  const maxContentChars = options.maxContentCharsPerItem ?? 480_000;
  const maxGitHubFetches = options.maxGitHubFileFetches ?? 6;
  const host = String(loc?.hostname || '').toLowerCase();
  const pageUrl = String(loc?.href || 'https://localhost/');
  const origin =
    loc?.origin ||
    (() => {
      try {
        return new URL(pageUrl).origin;
      } catch {
        return 'https://github.com';
      }
    })();

  const rawTitle = doc?.title
    ? String(doc.title)
        .replace(/\s*[-|·]\s*(ChatGPT|Claude|Gemini|GitHub).*$/i, '')
        .trim()
    : 'Captured Workspace';

  let detectedSource: ScannedCompanionItem['source'] = 'claude';
  if (host.includes('chatgpt.com')) detectedSource = 'gpt';
  else if (host.includes('claude.ai')) detectedSource = 'claude';
  else if (host.includes('gemini.google.com')) detectedSource = 'gemini';
  else if (host.includes('github.com')) detectedSource = 'github';
  else if (host.includes('moodle')) detectedSource = 'moodle';

  const ghInfo = parseGitHubUrl(pageUrl);

  let projectName = '';
  if (ghInfo?.isGitHubRepo) {
    projectName = `${ghInfo.owner}/${ghInfo.repo}`;
  } else {
    const projectHeading =
      doc.querySelector?.(
        '[data-testid="project-title"], [data-testid="project-name"], nav a[href*="/project/"], nav a[href*="/g/"]'
      ) || doc.querySelector?.('header h1, [role="navigation"] h2');
    const headingText = projectHeading?.innerText?.trim() || projectHeading?.textContent?.trim();
    if (headingText) {
      projectName = String(headingText).slice(0, 80);
    } else if (pageUrl.includes('/project/') || pageUrl.includes('/projects/')) {
      projectName = rawTitle;
    }
  }

  const items: ScannedCompanionItem[] = [];
  const unreachableResources: ScannedUnreachableResource[] = [];
  const seenContentSignatures = new Set<string>();
  const seenFilePaths = new Set<string>();

  const metrics: ScanMetrics = {
    discovered: 0,
    captured: 0,
    skipped: 0,
    failed: 0,
  };

  function getText(el: any): string {
    if (!el) return '';
    return String(el.innerText ?? el.textContent ?? el.value ?? '').trim();
  }

  function addItem(params: {
    title: string;
    fileName?: string;
    filePath?: string;
    fileType?: ScannedCompanionItem['fileType'];
    content: string;
    resourceKind: ScannedCompanionItem['resourceKind'];
    tags?: string[];
    provenanceUrl?: string;
  }): boolean {
    metrics.discovered++;
    const rawClean = String(params.content || '').trim();
    if (!rawClean || rawClean.length < 12) {
      metrics.skipped++;
      return false;
    }

    const bodySignature = normalizeSignatureContent(rawClean);
    if (!bodySignature) {
      metrics.skipped++;
      return false;
    }

    if (seenContentSignatures.has(bodySignature)) {
      metrics.skipped++;
      return false;
    }

    const slug =
      (params.title || 'resource')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase() || `resource_${items.length + 1}`;
    const resolvedFileName =
      params.fileName || (/\.[a-z0-9]{1,6}$/i.test(slug) ? slug : `${slug}.md`);
    const folderPrefix = ghInfo?.isGitHubRepo
      ? `${ghInfo.owner}/${ghInfo.repo}`
      : projectName
      ? `${detectedSource}-project/${projectName.replace(/[^a-zA-Z0-9._-]+/g, '_')}`
      : `${detectedSource}-companion`;
    const resolvedFilePath = params.filePath || `${folderPrefix}/${resolvedFileName}`;

    if (seenFilePaths.has(resolvedFilePath.toLowerCase()) && seenContentSignatures.has(bodySignature)) {
      metrics.skipped++;
      return false;
    }

    // Never silently truncate content: if content exceeds backend limit, record explicit notice
    let finalContent = rawClean;
    let truncated = false;
    const originalLength = rawClean.length;
    if (rawClean.length > maxContentChars) {
      truncated = true;
      const notice = `\n\n> [Notice: Resource exceeded ${maxContentChars.toLocaleString()} character staging limit (original: ${originalLength.toLocaleString()} chars). Download full file directly for complete archive import.]`;
      finalContent = rawClean.slice(0, maxContentChars - notice.length) + notice;
      unreachableResources.push({
        name: resolvedFileName,
        kind: params.resourceKind,
        reason: `Content (${originalLength.toLocaleString()} chars) exceeded ${maxContentChars.toLocaleString()} char per-item staging limit; full file recommended via direct import`,
      });
    }

    seenContentSignatures.add(bodySignature);
    seenFilePaths.add(resolvedFilePath.toLowerCase());

    items.push({
      title: params.title || resolvedFileName,
      fileName: resolvedFileName,
      filePath: resolvedFilePath,
      fileType: params.fileType || inferCompanionFileType(resolvedFileName, 'md'),
      content: finalContent,
      source: detectedSource,
      projectName: projectName || undefined,
      provenanceUrl: params.provenanceUrl || pageUrl,
      resourceKind: params.resourceKind,
      tags: Array.from(
        new Set([
          'companion-capture',
          params.resourceKind,
          detectedSource,
          ...(params.tags || []),
        ])
      ),
      ...(truncated ? { truncated: true, originalLength } : {}),
    });

    metrics.captured++;
    return true;
  }

  function addUnreachable(name: string, kind: string, reason: string) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return;
    if (unreachableResources.some((u) => u.name === cleanName && u.reason === reason)) {
      return;
    }
    unreachableResources.push({ name: cleanName, kind, reason });
  }

  // ============================================================================
  // A. DELIBERATE GITHUB REPOSITORY SCANNING
  // ============================================================================
  if (ghInfo?.isGitHubRepo) {
    const repoFullName = `${ghInfo.owner}/${ghInfo.repo}`;

    // 1. Capture Repository Metadata + File Tree Overview
    const aboutEl =
      doc.querySelector?.('.BorderGrid-cell p.f4, [data-testid="repository-description"], .repository-content .f4') ||
      doc.querySelector?.('meta[name="description"]');
    const description =
      (aboutEl?.getAttribute ? aboutEl.getAttribute('content') : '') ||
      getText(aboutEl) ||
      `GitHub repository ${repoFullName}`;

    const topicEls = Array.from(
      doc.querySelectorAll?.('a.topic-tag, [data-testid="topic-tag"]') || []
    );
    const topics = topicEls
      .map((el: any) => getText(el))
      .filter(Boolean)
      .slice(0, 15);

    const branchEl = doc.querySelector?.(
      '[data-hotkey="w"] span, #branch-picker-repos-header-ref-selector span, summary[title="Switch branches or tags"] span'
    );
    const detectedBranch =
      getText(branchEl) || (ghInfo.branch !== 'HEAD' ? ghInfo.branch : 'main');

    // Collect visible repository file tree links
    const treeLinks = Array.from(
      doc.querySelectorAll?.(
        'a[href*="/blob/"], a[href*="/tree/"], [data-testid="tree-item-file-name"], .react-directory-filename-column a'
      ) || []
    );

    const treeEntries: {
      name: string;
      path: string;
      kind: 'blob' | 'tree';
      href: string;
      branch: string;
    }[] = [];
    const seenTreePaths = new Set<string>();

    for (const linkEl of treeLinks as any[]) {
      const href = String(linkEl.getAttribute?.('href') || '').trim();
      const nameText = getText(linkEl);
      if (!href && !nameText) continue;

      let fullUrl = href;
      if (href.startsWith('/')) {
        fullUrl = `${origin}${href}`;
      }
      const parsedLink = fullUrl ? parseGitHubUrl(fullUrl) : null;
      if (
        parsedLink &&
        parsedLink.owner.toLowerCase() === ghInfo.owner.toLowerCase() &&
        parsedLink.repo.toLowerCase() === ghInfo.repo.toLowerCase() &&
        (parsedLink.viewType === 'blob' || parsedLink.viewType === 'tree') &&
        parsedLink.relativePath
      ) {
        const key = `${parsedLink.viewType}:${parsedLink.relativePath}`;
        if (!seenTreePaths.has(key)) {
          seenTreePaths.add(key);
          treeEntries.push({
            name: parsedLink.relativePath.split('/').pop() || nameText || parsedLink.relativePath,
            path: parsedLink.relativePath,
            kind: parsedLink.viewType,
            href: fullUrl,
            branch: parsedLink.branch || detectedBranch,
          });
        }
      }
    }

    // Build Repository Overview & Tree Manifest if metadata or tree entries exist
    if (description || treeEntries.length > 0) {
      const treeLines = treeEntries.map(
        (entry) => `- \`${entry.kind === 'tree' ? entry.path + '/' : entry.path}\` (${entry.kind === 'tree' ? 'directory' : 'file'})`
      );
      const overviewMd = [
        `# ${repoFullName} — Repository Overview`,
        '',
        `> Provenance: ${pageUrl}`,
        `> Repository: \`${repoFullName}\``,
        `> Active Branch: \`${detectedBranch}\``,
        topics.length > 0 ? `> Topics: ${topics.map((t) => `\`#${t}\``).join(' ')}` : '',
        '',
        `## Description`,
        description,
        '',
        treeLines.length > 0 ? `## Visible Repository File Tree (${treeEntries.length} entries)` : '',
        ...treeLines,
      ]
        .filter((line) => line !== '')
        .join('\n');

      addItem({
        title: `${repoFullName} — Repository Overview`,
        fileName: 'REPOSITORY_OVERVIEW.md',
        filePath: `${repoFullName}/REPOSITORY_OVERVIEW.md`,
        fileType: 'md',
        content: overviewMd,
        resourceKind: 'document',
        tags: ['github-repo', 'repository-metadata', ...topics.slice(0, 5)],
      });
    }

    // 2. Capture README content if visible on the repository or tree page
    const readmeEl = doc.querySelector?.(
      '[data-testid="readme"] article, article.markdown-body, #readme .markdown-body, readme-toc article'
    );
    const readmeText = getText(readmeEl);
    if (readmeText && readmeText.length >= 20) {
      addItem({
        title: `${repoFullName} — README.md`,
        fileName: 'README.md',
        filePath: ghInfo.relativePath
          ? `${repoFullName}/${ghInfo.relativePath}/README.md`
          : `${repoFullName}/README.md`,
        fileType: 'md',
        content: `# ${repoFullName} — README\n\n> Provenance: ${pageUrl}\n\n${readmeText}`,
        resourceKind: 'document',
        tags: ['github-readme', 'documentation'],
      });
    }

    // 3. If currently viewing a single file blob on GitHub, capture its source content directly from DOM
    if (ghInfo.viewType === 'blob' && ghInfo.relativePath) {
      const blobFileName = ghInfo.relativePath.split('/').pop() || 'file.txt';
      if (BINARY_EXTENSIONS_REGEX.test(blobFileName)) {
        metrics.discovered++;
        metrics.skipped++;
        addUnreachable(
          ghInfo.relativePath,
          blobFileName.split('.').pop()?.toLowerCase() || 'binary',
          'Binary repository file cannot be ingested as plain text via DOM scanner'
        );
      } else {
        const blobCodeEl =
          doc.querySelector?.(
            'textarea#read-only-cursor-text-area, [data-testid="raw-blob-content"], .blob-wrapper table, .react-code-lines, article.markdown-body'
          ) || doc.querySelector?.('pre');
        const blobText = getText(blobCodeEl);
        if (blobText && blobText.length >= 12) {
          const inferredType = inferCompanionFileType(blobFileName, 'code');
          addItem({
            title: `${repoFullName}/${ghInfo.relativePath}`,
            fileName: blobFileName,
            filePath: `${repoFullName}/${ghInfo.relativePath}`,
            fileType: inferredType,
            content: blobText,
            resourceKind: inferredType === 'code' ? 'code' : 'document',
            tags: ['github-file', blobFileName.split('.').pop()?.toLowerCase() || 'file'],
            provenanceUrl: pageUrl,
          });
        }
      }
    }

    // 4. Deliberately inspect visible repository file tree entries:
    //    - Flag binary files in unreachableResources
    //    - Fetch readable text/code files via same-origin raw endpoint (using existing browser session) up to maxGitHubFetches
    const fetchFn =
      options.fetchImpl ||
      (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);

    let fetchedCount = 0;
    for (const entry of treeEntries) {
      if (entry.kind === 'tree') {
        continue;
      }
      // Skip README if already captured from DOM
      if (/^readme(\.md|\.txt|\.rst)?$/i.test(entry.name) && readmeText && readmeText.length >= 20) {
        continue;
      }

      if (BINARY_EXTENSIONS_REGEX.test(entry.name)) {
        metrics.discovered++;
        metrics.skipped++;
        addUnreachable(
          entry.path,
          entry.name.split('.').pop()?.toLowerCase() || 'binary',
          'Binary file in repository tree — skipped during text scan'
        );
        continue;
      }

      const isReadableCandidate =
        READABLE_TEXT_EXTENSIONS_REGEX.test(entry.name) ||
        /^(dockerfile|makefile|license|changelog|contributing|authors|gemfile|procfile)$/i.test(
          entry.name
        );

      if (!isReadableCandidate) {
        metrics.discovered++;
        metrics.skipped++;
        addUnreachable(
          entry.path,
          entry.name.split('.').pop()?.toLowerCase() || 'unknown',
          'Unrecognized or non-text file extension in repository tree — not scanned'
        );
        continue;
      }

      if (!fetchFn || fetchedCount >= maxGitHubFetches) {
        metrics.discovered++;
        metrics.skipped++;
        addUnreachable(
          entry.path,
          entry.name.split('.').pop()?.toLowerCase() || 'file',
          fetchFn
            ? `Not scanned (scan budget capped at ${maxGitHubFetches} files per pass — open file directly to capture)`
            : 'Session fetch unavailable in this context — open file blob view directly to capture'
        );
        continue;
      }

      fetchedCount++;
      const rawUrl = `${origin}/${ghInfo.owner}/${ghInfo.repo}/raw/${entry.branch}/${entry.path}`;
      try {
        const res = await fetchFn(rawUrl, { credentials: 'include' } as RequestInit);
        if (!res.ok) {
          metrics.discovered++;
          metrics.failed++;
          addUnreachable(
            entry.path,
            entry.name.split('.').pop()?.toLowerCase() || 'file',
            `Repository file could not be fetched (HTTP ${res.status})`
          );
          continue;
        }
        const fileContent = await res.text();
        if (!fileContent || fileContent.trim().length < 12) {
          metrics.discovered++;
          metrics.skipped++;
          addUnreachable(
            entry.path,
            entry.name.split('.').pop()?.toLowerCase() || 'file',
            'Repository file was empty or under 12 characters'
          );
          continue;
        }
        const inferredType = inferCompanionFileType(entry.name, 'code');
        addItem({
          title: `${repoFullName}/${entry.path}`,
          fileName: entry.name,
          filePath: `${repoFullName}/${entry.path}`,
          fileType: inferredType,
          content: fileContent,
          resourceKind: inferredType === 'code' ? 'code' : 'document',
          tags: ['github-file', entry.name.split('.').pop()?.toLowerCase() || 'source'],
          provenanceUrl: entry.href || rawUrl,
        });
      } catch (err: any) {
        metrics.discovered++;
        metrics.failed++;
        addUnreachable(
          entry.path,
          entry.name.split('.').pop()?.toLowerCase() || 'file',
          `Failed to read repository file: ${err?.message || 'network error'}`
        );
      }
    }
  }

  // ============================================================================
  // B. AI WORKSPACE & PROJECT RESOURCES (Claude / ChatGPT / Gemini / General)
  // ============================================================================

  // 1. Capture Project Instructions / Custom System Prompts
  Array.from(
    doc.querySelectorAll?.(
      '[data-testid*="project-instructions"], [data-testid*="custom-instructions"], [aria-label*="Project instructions" i], [aria-label*="Custom instructions" i]'
    ) || []
  ).forEach((el: any, idx: number) => {
    const text = getText(el);
    if (text && text.length >= 15) {
      addItem({
        title: projectName
          ? `${projectName} — Project Instructions`
          : `Project Instructions ${idx + 1}`,
        fileName: `project_instructions_${idx + 1}.md`,
        fileType: 'md',
        content: `# ${projectName || rawTitle} — Project Instructions\n\n> Provenance: ${pageUrl}\n\n${text}`,
        resourceKind: 'project_instructions',
        tags: ['project-instructions'],
      });
    }
  });

  // 2. Capture Claude Artifacts / ChatGPT Canvas / Side-panel Documents
  Array.from(
    doc.querySelectorAll?.(
      '[data-testid*="artifact"], [role="complementary"] pre, [aria-label*="Artifact" i], [aria-label*="Canvas" i], .artifact-content'
    ) || []
  ).forEach((el: any, idx: number) => {
    const text = getText(el);
    if (text && text.length >= 25) {
      const headingEl = el.querySelector?.('h1, h2, h3, [class*="title"]');
      const artifactTitle =
        getText(headingEl) || `${rawTitle} — Artifact ${idx + 1}`;
      addItem({
        title: artifactTitle,
        fileName: `artifact_${idx + 1}.md`,
        fileType: 'md',
        content: `# ${artifactTitle}\n\n> Provenance: ${pageUrl}\n\n${text}`,
        resourceKind: 'artifact',
        tags: ['artifact'],
      });
    }
  });

  // 3. Capture Open Project Knowledge Documents vs Opaque Binary Attachment Cards
  Array.from(
    doc.querySelectorAll?.(
      '[data-testid*="project-knowledge"], [data-testid*="file-card"], [data-testid*="attachment"], [aria-label*=".pdf" i], [aria-label*=".docx" i], [aria-label*=".xlsx" i], [aria-label*=".pptx" i], [aria-label*=".md" i], [aria-label*=".txt" i]'
    ) || []
  ).forEach((el: any, idx: number) => {
    const label =
      el.getAttribute?.('aria-label')?.trim() ||
      getText(el.querySelector?.('[class*="name"], [class*="title"], span')) ||
      `Project Attachment ${idx + 1}`;
    const bodyText = getText(el);
    const cleanLabel = String(label).split('\n')[0].trim();
    const isBinaryExtension = BINARY_EXTENSIONS_REGEX.test(cleanLabel);

    if (isBinaryExtension && bodyText.length < 160) {
      metrics.discovered++;
      metrics.skipped++;
      addUnreachable(
        cleanLabel,
        cleanLabel.split('.').pop()?.toLowerCase() || 'binary',
        'Binary attachment card is not expanded in page DOM'
      );
    } else if (bodyText.length >= 80) {
      addItem({
        title: cleanLabel,
        fileName: /\.[a-z0-9]{1,5}$/i.test(cleanLabel)
          ? cleanLabel
          : `project_doc_${idx + 1}.md`,
        fileType: 'md',
        content: `# ${cleanLabel}\n\n> Provenance: ${pageUrl}\n\n${bodyText}`,
        resourceKind: 'document',
        tags: ['project-document'],
      });
    }
  });

  // 4. Capture substantial Code Blocks (> 60 chars) when not already captured via GitHub blob view
  if (!ghInfo || ghInfo.viewType !== 'blob') {
    const codeBlocks = Array.from(doc.querySelectorAll?.('pre code, pre') || []);
    codeBlocks.slice(0, 10).forEach((codeEl: any, idx: number) => {
      const codeText = getText(codeEl);
      if (!codeText || codeText.length < 60) return;
      const className = String(codeEl.className || '');
      const langMatch = className.match(/language-([a-z0-9_+-]+)/i);
      const lang = langMatch ? langMatch[1].toLowerCase() : 'txt';
      const extMap: Record<string, string> = {
        typescript: 'ts',
        ts: 'ts',
        tsx: 'tsx',
        javascript: 'js',
        js: 'js',
        python: 'py',
        py: 'py',
        json: 'json',
        sql: 'sql',
        bash: 'sh',
        sh: 'sh',
        html: 'html',
        css: 'css',
        markdown: 'md',
        md: 'md',
      };
      const ext = extMap[lang] || 'txt';
      addItem({
        title: `${rawTitle} — Code Snippet ${idx + 1} (${lang.toUpperCase()})`,
        fileName: `snippet_${idx + 1}.${ext}`,
        fileType: ext === 'md' ? 'md' : 'code',
        content: codeText,
        resourceKind: 'code',
        tags: ['code-block', lang],
      });
    });
  }

  // 5. Capture Conversation Turns (or Main Page Article fallback)
  const turns: { role: string; text: string }[] = [];
  if (host.includes('claude.ai')) {
    Array.from(
      doc.querySelectorAll?.('[data-testid="user-message"], [data-testid="assistant-message"]') || []
    ).forEach((el: any) => {
      const isUser = el.getAttribute?.('data-testid') === 'user-message';
      const text = getText(el);
      if (text) turns.push({ role: isUser ? 'User' : 'Assistant', text });
    });
  } else if (host.includes('chatgpt.com')) {
    Array.from(doc.querySelectorAll?.('[data-message-author-role]') || []).forEach(
      (el: any) => {
        const role =
          el.getAttribute?.('data-message-author-role') === 'user'
            ? 'User'
            : 'Assistant';
        const text = getText(el);
        if (text) turns.push({ role, text });
      }
    );
  } else if (host.includes('gemini.google.com')) {
    Array.from(
      doc.querySelectorAll?.('user-query, model-response, .query-text, .model-response-text') || []
    ).forEach((el: any) => {
      const tag = String(el.tagName || '').toLowerCase();
      const isUser =
        tag === 'user-query' || Boolean(el.classList?.contains?.('query-text'));
      const text = getText(el);
      if (text) turns.push({ role: isUser ? 'User' : 'Assistant', text });
    });
  }

  if (turns.length > 0) {
    const transcriptLines = [
      `# ${rawTitle}`,
      '',
      `> Provenance: ${pageUrl}`,
      projectName ? `> Project: ${projectName}` : '',
      '',
    ].filter(Boolean);
    turns.forEach((t) => {
      transcriptLines.push(`#### ${t.role}\n${t.text}`);
    });
    addItem({
      title: rawTitle,
      fileName: `${rawTitle.replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase() || 'conversation'}.md`,
      fileType: 'chat',
      content: transcriptLines.join('\n\n'),
      resourceKind: 'conversation',
      tags: ['conversation-transcript'],
    });
  } else if (items.length === 0) {
    const main =
      doc.querySelector?.('main') || doc.querySelector?.('article') || doc.body;
    const text = getText(main);
    if (text && text.length >= 20) {
      addItem({
        title: rawTitle,
        fileName: `${rawTitle.replace(/[^a-zA-Z0-9_-]+/g, '_').toLowerCase() || 'page_capture'}.md`,
        fileType: 'md',
        content: `# ${rawTitle}\n\n> Provenance: ${pageUrl}\n\n${text}`,
        resourceKind: 'document',
        tags: ['web-capture'],
      });
    }
  }

  return {
    title: rawTitle,
    projectName,
    url: pageUrl,
    source: detectedSource,
    items,
    unreachableResources,
    metrics,
  };
}
