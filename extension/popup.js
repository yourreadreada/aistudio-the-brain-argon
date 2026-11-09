// Web AI & GitHub Companion: ChatGPT, Claude, Gemini & GitHub Repository Connector
// Runs in the extension's popup context

const apiUrlInput = document.getElementById('apiUrl');
const deviceTokenInput = document.getElementById('deviceToken');
const brainSelect = document.getElementById('brainSelect');
const injectBtn = document.getElementById('injectBtn');
const captureProjectBtn = document.getElementById('captureProjectBtn');
const saveBtn = document.getElementById('saveBtn');
const copyBtn = document.getElementById('copyBtn');
const statusEl = document.getElementById('status');
const scanMetricsEl = document.getElementById('scanMetrics');
const unreachableNoticeEl = document.getElementById('unreachableNotice');
const serverDot = document.getElementById('serverDot');
const serverText = document.getElementById('serverText');
const targetSite = document.getElementById('targetSite');

function getAuthHeaders(extra = {}) {
  const headers = { ...extra };
  const token = deviceTokenInput?.value?.trim();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function setStatus(text, kind) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = kind || '';
}

function setScanMetrics(metrics) {
  if (!scanMetricsEl) return;
  if (!metrics || typeof metrics.discovered !== 'number') {
    scanMetricsEl.style.display = 'none';
    scanMetricsEl.textContent = '';
    return;
  }
  scanMetricsEl.style.display = 'block';
  scanMetricsEl.textContent = `Scan summary: ${metrics.discovered} discovered · ${metrics.captured} captured · ${metrics.skipped} skipped · ${metrics.failed} failed`;
}

function setUnreachableNotice(unreachableResources) {
  if (!unreachableNoticeEl) return;
  if (!Array.isArray(unreachableResources) || unreachableResources.length === 0) {
    unreachableNoticeEl.style.display = 'none';
    unreachableNoticeEl.textContent = '';
    return;
  }
  const names = unreachableResources
    .slice(0, 3)
    .map((r) => `${r.name} (${r.reason})`)
    .join('; ');
  const extra =
    unreachableResources.length > 3
      ? ` +${unreachableResources.length - 3} more`
      : '';
  unreachableNoticeEl.style.display = 'block';
  unreachableNoticeEl.textContent = `Notice (${unreachableResources.length} skipped/binary resource(s)): ${names}${extra}. Download binary files directly and drop into Capture Hub → Import & Review.`;
}

async function readBackendError(res) {
  try {
    const data = await res.json();
    if (data && data.error) {
      return `${data.error} (HTTP ${res.status})`;
    }
  } catch {}
  return `Server returned HTTP ${res.status}`;
}

async function checkServer() {
  try {
    const res = await fetch(`${apiUrlInput.value}/api/brains`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      serverDot.className = 'server-status online';
      serverText.textContent = 'Server Online';
      const brains = await res.json();
      const list = brains.length ? brains : ['coding', 'college', 'personal'];
      const current = brainSelect.value;
      brainSelect.innerHTML = list.map((b) => `<option value="${b}">${b}</option>`).join('');
      if (list.includes(current)) brainSelect.value = current;
    } else if (res.status === 401) {
      serverDot.className = 'server-status offline';
      serverText.textContent = 'Auth Error (Check Device Token)';
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch {
    serverDot.className = 'server-status offline';
    serverText.textContent = 'Offline (Check Brain URL)';
  }
}

async function init() {
  const stored = await chrome.storage.local.get(['apiUrl', 'lastBrain', 'deviceToken']);
  if (stored.apiUrl) apiUrlInput.value = stored.apiUrl;
  if (stored.lastBrain) brainSelect.value = stored.lastBrain;
  if (stored.deviceToken && deviceTokenInput) deviceTokenInput.value = stored.deviceToken;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      if (tab.url.includes('chatgpt.com')) targetSite.textContent = 'Active: ChatGPT Web';
      else if (tab.url.includes('claude.ai')) targetSite.textContent = 'Active: Claude Web';
      else if (tab.url.includes('gemini.google.com')) targetSite.textContent = 'Active: Gemini Web';
      else if (tab.url.includes('github.com')) targetSite.textContent = 'Active: GitHub Repo';
      else targetSite.textContent = 'Web Page';
    }
  } catch {}

  await checkServer();
}

function buildContextPrimer(brain, facts) {
  if (!facts || facts.length === 0) {
    return `[BRAIN CONTEXT: ${brain.toUpperCase()}]\nNo facts stored yet in this brain.`;
  }
  const lines = [
    `[BRAIN MEMORY CONTEXT: ${brain.toUpperCase()}]`,
    `The user has connected their personal memory ("The Brain"). Ground your responses in these durable facts:`,
    '',
  ];

  facts.forEach((f) => {
    lines.push(`• [#${f.id} | ${f.source}] ${f.content}`);
  });

  lines.push('');
  lines.push(
    `Instructions: Use the above context across our conversation. When new durable facts, architecture choices, or preferences are made, highlight them clearly.`
  );
  lines.push('--------------------------------------------------\n');
  return lines.join('\n');
}

function injectTextIntoChat(contextText) {
  const host = window.location.hostname;
  let inputEl = null;

  if (host.includes('chatgpt.com')) {
    inputEl =
      document.querySelector('#prompt-textarea') ||
      document.querySelector('textarea[data-id="root"]') ||
      document.querySelector('div[contenteditable="true"]');
  } else if (host.includes('claude.ai')) {
    inputEl =
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector('fieldset div[contenteditable="true"]');
  } else if (host.includes('gemini.google.com')) {
    inputEl =
      document.querySelector('rich-textarea div[contenteditable="true"]') ||
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector('textarea');
  } else {
    inputEl = document.querySelector('textarea, div[contenteditable="true"]');
  }

  if (!inputEl) {
    return { success: false, error: 'Could not find chat input box on this page.' };
  }

  inputEl.focus();

  if (inputEl.tagName.toLowerCase() === 'textarea') {
    const original = inputEl.value;
    inputEl.value = contextText + (original ? '\n' + original : '');
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    const existing = inputEl.innerText.trim();
    const formatted = contextText + (existing ? '\n' + existing : '');
    inputEl.innerText = formatted;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return { success: true };
}

function extractConversation() {
  const host = window.location.hostname;
  const turns = [];

  function pushSelector(selector, role) {
    document.querySelectorAll(selector).forEach((el) => {
      const text = el.innerText?.trim();
      if (text) turns.push({ role, text });
    });
  }

  if (host.includes('claude.ai')) {
    document.querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]').forEach((el) => {
      const isUser = el.getAttribute('data-testid') === 'user-message';
      const text = el.innerText?.trim();
      if (text) turns.push({ role: isUser ? 'user' : 'assistant', text });
    });
    if (turns.length === 0) {
      pushSelector('[data-testid="user-message"]', 'user');
      pushSelector('.font-claude-message', 'assistant');
    }
  } else if (host.includes('chatgpt.com')) {
    document.querySelectorAll('[data-message-author-role]').forEach((el) => {
      const role = el.getAttribute('data-message-author-role') || 'unknown';
      const text = el.innerText?.trim();
      if (text) turns.push({ role, text });
    });
  } else if (host.includes('gemini.google.com')) {
    document.querySelectorAll('user-query, model-response, .query-text, .model-response-text').forEach((el) => {
      const isUser = el.tagName.toLowerCase() === 'user-query' || el.classList.contains('query-text');
      const text = el.innerText?.trim();
      if (text) turns.push({ role: isUser ? 'user' : 'assistant', text });
    });
  }

  if (turns.length === 0) {
    const main = document.querySelector('main') || document.querySelector('article') || document.body;
    const text = main.innerText?.trim();
    if (text) turns.push({ role: 'unknown', text });
  }

  const title = document.title ? document.title.replace(/\s*[-|]\s*(ChatGPT|Claude|Gemini).*$/i, '').trim() : 'Chat';
  return { title, url: window.location.href, turns };
}

/**
 * Self-contained async active-tab scanner injected via chrome.scripting.executeScript.
 * Captures:
 * - Deliberate GitHub repository context (metadata, file tree, README, active blob, and up to 6 readable repo files via session fetch)
 * - Project instructions / custom prompts
 * - Claude Artifacts / ChatGPT Canvas documents
 * - Open project knowledge documents (while reporting binary attachment cards honestly)
 * - Code blocks
 * - Conversation turns
 * Prevents duplicate captures within a single scan, avoids silent content truncation, and reports scan counts.
 */
async function extractProjectAndResources() {
  const MAX_CONTENT_CHARS = 480000;
  const MAX_GITHUB_FILE_FETCHES = 6;
  const BINARY_EXT_RE = /\.(pdf|docx|doc|xlsx|xls|pptx|ppt|zip|tar|gz|7z|rar|png|jpg|jpeg|gif|webp|ico|mp3|mp4|wav|mov|avi|woff|woff2|ttf|otf|eot|exe|dll|so|dylib|bin|wasm|pyc|class|jar)$/i;
  const READABLE_TEXT_EXT_RE = /\.(md|markdown|txt|ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|c|cpp|h|hpp|cs|rb|php|swift|kt|sql|sh|bash|zsh|yaml|yml|toml|ini|env\.example|dockerfile|makefile|html|css|scss|csv|xml|json)$/i;

  const host = window.location.hostname.toLowerCase();
  const pageUrl = window.location.href;
  const origin = window.location.origin;
  const rawTitle = document.title
    ? document.title.replace(/\s*[-|·]\s*(ChatGPT|Claude|Gemini|GitHub).*$/i, '').trim()
    : 'Captured Workspace';

  let detectedSource = 'claude';
  if (host.includes('chatgpt.com')) detectedSource = 'gpt';
  else if (host.includes('claude.ai')) detectedSource = 'claude';
  else if (host.includes('gemini.google.com')) detectedSource = 'gemini';
  else if (host.includes('github.com')) detectedSource = 'github';

  function parseGitHubRepoUrl(urlStr) {
    try {
      const parsed = new URL(urlStr);
      if (!parsed.hostname.includes('github.com')) return null;
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length < 2) return null;
      const reserved = new Set([
        'settings', 'notifications', 'explore', 'marketplace', 'pulls',
        'issues', 'codespaces', 'sponsors', 'orgs', 'users', 'login',
        'signup', 'features', 'pricing', 'search'
      ]);
      const owner = segments[0];
      const repo = segments[1].replace(/\.git$/i, '');
      if (reserved.has(owner.toLowerCase())) return null;
      if (segments.length === 2) {
        return { isGitHubRepo: true, owner, repo, branch: 'HEAD', viewType: 'repo_root', relativePath: '' };
      }
      const action = segments[2];
      if (action === 'tree' || action === 'blob') {
        return {
          isGitHubRepo: true,
          owner,
          repo,
          branch: segments[3] || 'HEAD',
          viewType: action,
          relativePath: segments.slice(4).join('/'),
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

  function inferFileType(fileName, fallback = 'md') {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['docx', 'doc'].includes(ext)) return 'docx';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return 'xlsx';
    if (['pptx', 'ppt'].includes(ext)) return 'pptx';
    if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'cs', 'rb', 'php', 'swift', 'kt', 'sql', 'sh', 'yaml', 'yml', 'toml', 'json', 'html', 'css'].includes(ext)) {
      return 'code';
    }
    if (['md', 'markdown', 'txt'].includes(ext)) return 'md';
    return fallback;
  }

  function normalizeSig(raw) {
    return String(raw || '')
      .replace(/\r\n/g, '\n')
      .replace(/^#\s+[^\n]+\n+/i, '')
      .replace(/^>\s*Provenance:[^\n]+\n*/gim, '')
      .replace(/^>\s*Project:[^\n]+\n*/gim, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  const ghInfo = parseGitHubRepoUrl(pageUrl);
  let projectName = '';
  if (ghInfo?.isGitHubRepo) {
    projectName = `${ghInfo.owner}/${ghInfo.repo}`;
  } else {
    const projectHeading =
      document.querySelector('[data-testid="project-title"], [data-testid="project-name"], nav a[href*="/project/"], nav a[href*="/g/"]') ||
      document.querySelector('header h1, [role="navigation"] h2');
    if (projectHeading && projectHeading.innerText?.trim()) {
      projectName = projectHeading.innerText.trim().slice(0, 80);
    } else if (pageUrl.includes('/project/') || pageUrl.includes('/projects/')) {
      projectName = rawTitle;
    }
  }

  const items = [];
  const unreachableResources = [];
  const seenSignatures = new Set();
  const seenPaths = new Set();
  const metrics = { discovered: 0, captured: 0, skipped: 0, failed: 0 };

  function addUnreachable(name, kind, reason) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return;
    if (unreachableResources.some((u) => u.name === cleanName && u.reason === reason)) return;
    unreachableResources.push({ name: cleanName, kind, reason });
  }

  function addItem({ title, fileName, filePath, fileType, content, resourceKind, tags, provenanceUrl }) {
    metrics.discovered++;
    const clean = String(content || '').trim();
    if (!clean || clean.length < 12) {
      metrics.skipped++;
      return false;
    }
    const sig = normalizeSig(clean);
    if (!sig || seenSignatures.has(sig)) {
      metrics.skipped++;
      return false;
    }

    const slug =
      (title || 'resource')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase() || `resource_${items.length + 1}`;
    const resolvedFileName = fileName || (/\.[a-z0-9]{1,6}$/i.test(slug) ? slug : `${slug}.md`);
    const folderPrefix = ghInfo?.isGitHubRepo
      ? `${ghInfo.owner}/${ghInfo.repo}`
      : projectName
      ? `${detectedSource}-project/${projectName.replace(/[^a-zA-Z0-9._-]+/g, '_')}`
      : `${detectedSource}-companion`;
    const resolvedFilePath = filePath || `${folderPrefix}/${resolvedFileName}`;

    if (seenPaths.has(resolvedFilePath.toLowerCase()) && seenSignatures.has(sig)) {
      metrics.skipped++;
      return false;
    }

    let finalContent = clean;
    if (clean.length > MAX_CONTENT_CHARS) {
      const notice = `\n\n> [Notice: Resource exceeded ${MAX_CONTENT_CHARS.toLocaleString()} character staging limit (original: ${clean.length.toLocaleString()} chars). Download full file directly for complete archive import.]`;
      finalContent = clean.slice(0, MAX_CONTENT_CHARS - notice.length) + notice;
      addUnreachable(
        resolvedFileName,
        resourceKind || 'document',
        `Content (${clean.length.toLocaleString()} chars) exceeded ${MAX_CONTENT_CHARS.toLocaleString()} char per-item staging limit`
      );
    }

    seenSignatures.add(sig);
    seenPaths.add(resolvedFilePath.toLowerCase());

    items.push({
      title: title || resolvedFileName,
      fileName: resolvedFileName,
      filePath: resolvedFilePath,
      fileType: fileType || inferFileType(resolvedFileName, 'md'),
      content: finalContent,
      source: detectedSource,
      projectName: projectName || undefined,
      provenanceUrl: provenanceUrl || pageUrl,
      resourceKind: resourceKind || 'document',
      tags: Array.from(
        new Set([
          'companion-capture',
          resourceKind || 'document',
          detectedSource,
          ...(tags || []),
        ])
      ),
    });
    metrics.captured++;
    return true;
  }

  // A. DELIBERATE GITHUB REPOSITORY SCANNING
  if (ghInfo?.isGitHubRepo) {
    const repoFullName = `${ghInfo.owner}/${ghInfo.repo}`;
    const aboutEl =
      document.querySelector('.BorderGrid-cell p.f4, [data-testid="repository-description"], .repository-content .f4') ||
      document.querySelector('meta[name="description"]');
    const description =
      aboutEl?.getAttribute?.('content') ||
      aboutEl?.innerText?.trim() ||
      `GitHub repository ${repoFullName}`;
    const topics = Array.from(document.querySelectorAll('a.topic-tag, [data-testid="topic-tag"]'))
      .map((el) => el.innerText?.trim())
      .filter(Boolean)
      .slice(0, 15);
    const branchEl = document.querySelector(
      '[data-hotkey="w"] span, #branch-picker-repos-header-ref-selector span, summary[title="Switch branches or tags"] span'
    );
    const detectedBranch =
      branchEl?.innerText?.trim() || (ghInfo.branch !== 'HEAD' ? ghInfo.branch : 'main');

    const treeLinks = Array.from(
      document.querySelectorAll(
        'a[href*="/blob/"], a[href*="/tree/"], [data-testid="tree-item-file-name"], .react-directory-filename-column a'
      )
    );
    const treeEntries = [];
    const seenTreePaths = new Set();

    for (const linkEl of treeLinks) {
      const href = (linkEl.getAttribute('href') || '').trim();
      const nameText = (linkEl.innerText || '').trim();
      if (!href && !nameText) continue;
      const fullUrl = href.startsWith('/') ? `${origin}${href}` : href;
      const parsedLink = fullUrl ? parseGitHubRepoUrl(fullUrl) : null;
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

    const readmeEl = document.querySelector(
      '[data-testid="readme"] article, article.markdown-body, #readme .markdown-body, readme-toc article'
    );
    const readmeText = readmeEl?.innerText?.trim() || '';
    if (readmeText && readmeText.length >= 20) {
      addItem({
        title: `${repoFullName} — README.md`,
        fileName: 'README.md',
        filePath: ghInfo.relativePath ? `${repoFullName}/${ghInfo.relativePath}/README.md` : `${repoFullName}/README.md`,
        fileType: 'md',
        content: `# ${repoFullName} — README\n\n> Provenance: ${pageUrl}\n\n${readmeText}`,
        resourceKind: 'document',
        tags: ['github-readme', 'documentation'],
      });
    }

    if (ghInfo.viewType === 'blob' && ghInfo.relativePath) {
      const blobFileName = ghInfo.relativePath.split('/').pop() || 'file.txt';
      if (BINARY_EXT_RE.test(blobFileName)) {
        metrics.discovered++;
        metrics.skipped++;
        addUnreachable(
          ghInfo.relativePath,
          blobFileName.split('.').pop()?.toLowerCase() || 'binary',
          'Binary repository file cannot be ingested as plain text via DOM scanner'
        );
      } else {
        const blobCodeEl =
          document.querySelector(
            'textarea#read-only-cursor-text-area, [data-testid="raw-blob-content"], .blob-wrapper table, .react-code-lines, article.markdown-body'
          ) || document.querySelector('pre');
        const blobText = (blobCodeEl?.value ?? blobCodeEl?.innerText ?? '').trim();
        if (blobText && blobText.length >= 12) {
          const inferredType = inferFileType(blobFileName, 'code');
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

    let fetchedCount = 0;
    for (const entry of treeEntries) {
      if (entry.kind === 'tree') continue;
      if (/^readme(\.md|\.txt|\.rst)?$/i.test(entry.name) && readmeText && readmeText.length >= 20) {
        continue;
      }
      if (BINARY_EXT_RE.test(entry.name)) {
        metrics.discovered++;
        metrics.skipped++;
        addUnreachable(
          entry.path,
          entry.name.split('.').pop()?.toLowerCase() || 'binary',
          'Binary file in repository tree — skipped during text scan'
        );
        continue;
      }
      const isReadable =
        READABLE_TEXT_EXT_RE.test(entry.name) ||
        /^(dockerfile|makefile|license|changelog|contributing|authors|gemfile|procfile)$/i.test(entry.name);
      if (!isReadable) {
        metrics.discovered++;
        metrics.skipped++;
        addUnreachable(
          entry.path,
          entry.name.split('.').pop()?.toLowerCase() || 'unknown',
          'Unrecognized or non-text file extension in repository tree — not scanned'
        );
        continue;
      }
      if (fetchedCount >= MAX_GITHUB_FILE_FETCHES) {
        metrics.discovered++;
        metrics.skipped++;
        addUnreachable(
          entry.path,
          entry.name.split('.').pop()?.toLowerCase() || 'file',
          `Not scanned (scan budget capped at ${MAX_GITHUB_FILE_FETCHES} files per pass — open file directly to capture)`
        );
        continue;
      }
      fetchedCount++;
      const rawUrl = `${origin}/${ghInfo.owner}/${ghInfo.repo}/raw/${entry.branch}/${entry.path}`;
      try {
        const res = await fetch(rawUrl, { credentials: 'include' });
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
        const inferredType = inferFileType(entry.name, 'code');
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
      } catch (err) {
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

  // B. AI WORKSPACE & PROJECT RESOURCES
  document
    .querySelectorAll(
      '[data-testid*="project-instructions"], [data-testid*="custom-instructions"], [aria-label*="Project instructions" i], [aria-label*="Custom instructions" i]'
    )
    .forEach((el, idx) => {
      const text = el.innerText?.trim() || el.value?.trim();
      if (text && text.length >= 15) {
        addItem({
          title: projectName ? `${projectName} — Project Instructions` : `Project Instructions ${idx + 1}`,
          fileName: `project_instructions_${idx + 1}.md`,
          fileType: 'md',
          content: `# ${projectName || rawTitle} — Project Instructions\n\n> Provenance: ${pageUrl}\n\n${text}`,
          resourceKind: 'project_instructions',
          tags: ['project-instructions'],
        });
      }
    });

  document
    .querySelectorAll(
      '[data-testid*="artifact"], [role="complementary"] pre, [aria-label*="Artifact" i], [aria-label*="Canvas" i], .artifact-content'
    )
    .forEach((el, idx) => {
      const text = el.innerText?.trim();
      if (text && text.length >= 25) {
        const headingEl = el.querySelector('h1, h2, h3, [class*="title"]');
        const artifactTitle =
          headingEl?.innerText?.trim() || `${rawTitle} — Artifact ${idx + 1}`;
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

  document
    .querySelectorAll(
      '[data-testid*="project-knowledge"], [data-testid*="file-card"], [data-testid*="attachment"], [aria-label*=".pdf" i], [aria-label*=".docx" i], [aria-label*=".xlsx" i], [aria-label*=".pptx" i], [aria-label*=".md" i], [aria-label*=".txt" i]'
    )
    .forEach((el, idx) => {
      const label =
        el.getAttribute('aria-label')?.trim() ||
        el.querySelector('[class*="name"], [class*="title"], span')?.innerText?.trim() ||
        `Project Attachment ${idx + 1}`;
      const bodyText = el.innerText?.trim() || '';
      const cleanLabel = label.split('\n')[0].trim();
      const isBinaryExtension = BINARY_EXT_RE.test(cleanLabel);

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

  if (!ghInfo || ghInfo.viewType !== 'blob') {
    const codeBlocks = Array.from(document.querySelectorAll('pre code, pre'));
    codeBlocks.slice(0, 10).forEach((codeEl, idx) => {
      const codeText = codeEl.innerText?.trim();
      if (!codeText || codeText.length < 60) return;
      const langMatch = (codeEl.className || '').match(/language-([a-z0-9_+-]+)/i);
      const lang = langMatch ? langMatch[1].toLowerCase() : 'txt';
      const extMap = {
        typescript: 'ts', ts: 'ts', tsx: 'tsx', javascript: 'js', js: 'js',
        python: 'py', py: 'py', json: 'json', sql: 'sql', bash: 'sh',
        sh: 'sh', html: 'html', css: 'css', markdown: 'md', md: 'md',
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

  const turns = [];
  if (host.includes('claude.ai')) {
    document
      .querySelectorAll('[data-testid="user-message"], [data-testid="assistant-message"]')
      .forEach((el) => {
        const isUser = el.getAttribute('data-testid') === 'user-message';
        const text = el.innerText?.trim();
        if (text) turns.push({ role: isUser ? 'User' : 'Assistant', text });
      });
  } else if (host.includes('chatgpt.com')) {
    document.querySelectorAll('[data-message-author-role]').forEach((el) => {
      const role = el.getAttribute('data-message-author-role') === 'user' ? 'User' : 'Assistant';
      const text = el.innerText?.trim();
      if (text) turns.push({ role, text });
    });
  } else if (host.includes('gemini.google.com')) {
    document
      .querySelectorAll('user-query, model-response, .query-text, .model-response-text')
      .forEach((el) => {
        const isUser =
          el.tagName.toLowerCase() === 'user-query' || el.classList.contains('query-text');
        const text = el.innerText?.trim();
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
    const main = document.querySelector('main') || document.querySelector('article') || document.body;
    const text = main?.innerText?.trim();
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

function toMarkdown({ title, turns }) {
  const lines = [`# ${title}`];
  for (const t of turns) {
    const label = t.role === 'human' || t.role === 'user' ? 'User' : 'Assistant';
    lines.push(`#### ${label}\n${t.text}`);
  }
  return lines.join('\n\n');
}

function sourceForHost(url) {
  if (url.includes('claude.ai')) return 'claude';
  if (url.includes('chatgpt.com')) return 'gpt';
  if (url.includes('gemini.google.com')) return 'gemini';
  if (url.includes('github.com')) return 'github';
  return 'claude';
}

// 1. INJECT MEMORY INTO CHAT BUTTON
injectBtn.addEventListener('click', async () => {
  injectBtn.disabled = true;
  setUnreachableNotice([]);
  setScanMetrics(null);
  setStatus('Fetching brain facts...', 'info');

  try {
    const brain = brainSelect.value || 'coding';
    const res = await fetch(`${apiUrlInput.value}/api/facts?brain=${encodeURIComponent(brain)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(await readBackendError(res));
    }
    const facts = await res.json();

    if (!facts || facts.length === 0) {
      setStatus(`No facts found in brain '${brain}'. Add facts first!`, 'err');
      injectBtn.disabled = false;
      return;
    }

    const contextPrimer = buildContextPrimer(brain, facts);

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab detected');

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectTextIntoChat,
      args: [contextPrimer],
    });

    if (result?.success) {
      setStatus(`✓ Injected ${facts.length} memory facts into chat prompt!`, 'ok');
      await chrome.storage.local.set({ apiUrl: apiUrlInput.value, lastBrain: brain });
    } else {
      await navigator.clipboard.writeText(contextPrimer);
      setStatus(`Notice: Copied ${facts.length} facts to clipboard (could not auto-focus prompt box). Paste it into chat!`, 'info');
    }
  } catch (err) {
    setStatus(`Failed: ${err.message}`, 'err');
  } finally {
    injectBtn.disabled = false;
  }
});

// 2. STAGE PROJECT / GITHUB REPO & RESOURCES TO REVIEW QUEUE BUTTON
if (captureProjectBtn) {
  captureProjectBtn.addEventListener('click', async () => {
    captureProjectBtn.disabled = true;
    setUnreachableNotice([]);
    setScanMetrics(null);
    setStatus('Scanning active tab (project docs, GitHub repo files, artifacts & chat)...', 'info');

    try {
      const tokenValue = deviceTokenInput?.value?.trim() || '';
      if (!tokenValue) {
        throw new Error(
          'Device Token is required for staging captures. Open Capture Hub → Browser Companion to issue a brn_live_... token and paste it below.'
        );
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab detected');

      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractProjectAndResources,
      });

      if (result?.metrics) {
        setScanMetrics(result.metrics);
      }

      if (!result || (!result.items?.length && !result.unreachableResources?.length)) {
        setStatus('No readable project documents, GitHub files, artifacts, or chat turns detected on this tab.', 'err');
        captureProjectBtn.disabled = false;
        return;
      }

      setUnreachableNotice(result.unreachableResources || []);

      if (!result.items || result.items.length === 0) {
        setStatus(
          `Found ${result.unreachableResources.length} binary or unscanned resource(s) that cannot be read as text. Download and import them in Capture Hub.`,
          'err'
        );
        captureProjectBtn.disabled = false;
        return;
      }

      const brain = brainSelect.value || 'coding';
      const source = result.source || sourceForHost(result.url || '');

      setStatus(`Staging ${result.items.length} item(s) to Capture Hub Review Queue...`, 'info');
      const res = await fetch(`${apiUrlInput.value}/api/companion/captures`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          brain,
          source,
          projectName: result.projectName || '',
          provenanceUrl: result.url || '',
          items: result.items.map((item) => ({
            ...item,
            brain,
            source: item.source || source,
          })),
          unreachableResources: result.unreachableResources || [],
        }),
      });

      if (!res.ok) {
        throw new Error(await readBackendError(res));
      }
      const staged = await res.json();

      await chrome.storage.local.set({
        apiUrl: apiUrlInput.value,
        lastBrain: brain,
        deviceToken: tokenValue,
      });

      setStatus(
        `✓ Staged ${staged.stagedCount || result.items.length} resource(s) into '${brain}' Review Queue! Open Capture Hub → Import & Review to inspect and commit.`,
        'ok'
      );
    } catch (err) {
      setStatus(`Capture failed: ${err.message}`, 'err');
    } finally {
      captureProjectBtn.disabled = false;
    }
  });
}

// 3. QUICK-SAVE CONVERSATION BUTTON
saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  setUnreachableNotice([]);
  setScanMetrics(null);
  setStatus('Extracting chat dialogue...', 'info');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab detected');

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractConversation,
    });

    if (!result || !result.turns.length) {
      setStatus('No chat text detected on this tab. Open a ChatGPT, Claude, or Gemini conversation.', 'err');
      saveBtn.disabled = false;
      return;
    }

    const content = toMarkdown(result);
    const source = sourceForHost(result.url);
    const brain = brainSelect.value || 'coding';

    setStatus('Saving to Brain...', 'info');
    const res = await fetch(`${apiUrlInput.value}/api/ingest`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        brain,
        content,
        source,
        file_name: `${result.title}.md`,
        file_path: `${source}-web/${result.title}.md`,
      }),
    });

    if (!res.ok) {
      throw new Error(await readBackendError(res));
    }
    const saved = await res.json();

    await chrome.storage.local.set({
      apiUrl: apiUrlInput.value,
      lastBrain: brain,
      deviceToken: deviceTokenInput ? deviceTokenInput.value : '',
    });
    setStatus(`✓ Saved to '${brain}' (${saved.action || 'updated'}) — ${result.turns.length} turn(s) recorded!`, 'ok');
  } catch (err) {
    setStatus(`Failed: ${err.message}`, 'err');
  } finally {
    saveBtn.disabled = false;
  }
});

// 4. COPY SNAPSHOT BUTTON
copyBtn.addEventListener('click', async () => {
  try {
    const brain = brainSelect.value || 'coding';
    const res = await fetch(`${apiUrlInput.value}/api/facts?brain=${encodeURIComponent(brain)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      throw new Error(await readBackendError(res));
    }
    const facts = await res.json();
    const contextPrimer = buildContextPrimer(brain, facts);
    await navigator.clipboard.writeText(contextPrimer);
    setStatus(`✓ Copied context snapshot for '${brain}' to clipboard!`, 'ok');
  } catch (err) {
    setStatus(`Copy failed: ${err.message}`, 'err');
  }
});

apiUrlInput.addEventListener('change', () => {
  chrome.storage.local.set({ apiUrl: apiUrlInput.value });
  checkServer();
});

if (deviceTokenInput) {
  deviceTokenInput.addEventListener('change', () => {
    chrome.storage.local.set({ deviceToken: deviceTokenInput.value });
    checkServer();
  });
}

brainSelect.addEventListener('change', () => {
  chrome.storage.local.set({ lastBrain: brainSelect.value });
});

init();
