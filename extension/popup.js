// Web AI Companion: ChatGPT, Claude, and Gemini Web Connector
// Runs in the extension's popup context

const apiUrlInput = document.getElementById('apiUrl');
const deviceTokenInput = document.getElementById('deviceToken');
const brainSelect = document.getElementById('brainSelect');
const injectBtn = document.getElementById('injectBtn');
const captureProjectBtn = document.getElementById('captureProjectBtn');
const saveBtn = document.getElementById('saveBtn');
const copyBtn = document.getElementById('copyBtn');
const statusEl = document.getElementById('status');
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
  statusEl.textContent = text;
  statusEl.className = kind || '';
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
  unreachableNoticeEl.textContent = `Note: ${unreachableResources.length} attachment(s) could not be read directly from the browser DOM: ${names}${extra}. Download and drop binary files into Capture Hub → Import & Review.`;
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
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    serverDot.className = 'server-status offline';
    serverText.textContent = 'Offline (Check Brain URL)';
  }
}

async function init() {
  const stored = await chrome.storage.local.get(['apiUrl', 'lastBrain', 'deviceToken']);
  if (stored.apiUrl) apiUrlInput.value = stored.apiUrl;
  if (stored.lastBrain) brainSelect.value = stored.lastBrain;
  if (stored.deviceToken && deviceTokenInput) deviceTokenInput.value = stored.deviceToken;

  // Check active tab host
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      if (tab.url.includes('chatgpt.com')) targetSite.textContent = 'Active: ChatGPT Web';
      else if (tab.url.includes('claude.ai')) targetSite.textContent = 'Active: Claude Web';
      else if (tab.url.includes('gemini.google.com')) targetSite.textContent = 'Active: Gemini Web';
      else if (tab.url.includes('github.com')) targetSite.textContent = 'Active: GitHub';
      else targetSite.textContent = 'Web Page';
    }
  } catch {}

  await checkServer();
}

/**
 * Builds formatted context block from a brain's facts
 */
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

/**
 * Script injected into the active page to insert text into the chat prompt
 */
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

/**
 * Script injected into the page to extract dialogue turns
 */
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
 * Script injected into the active tab to capture project-associated documents,
 * custom instructions, Claude Artifacts / ChatGPT Canvas blocks, code blocks,
 * and conversation context with full provenance. Also detects opaque binary
 * attachments that cannot be read directly from the browser DOM.
 */
function extractProjectAndResources() {
  const host = window.location.hostname;
  const pageUrl = window.location.href;
  const rawTitle = document.title
    ? document.title.replace(/\s*[-|·]\s*(ChatGPT|Claude|Gemini|GitHub).*$/i, '').trim()
    : 'Captured Workspace';

  let detectedSource = 'claude';
  if (host.includes('chatgpt.com')) detectedSource = 'gpt';
  else if (host.includes('claude.ai')) detectedSource = 'claude';
  else if (host.includes('gemini.google.com')) detectedSource = 'gemini';
  else if (host.includes('github.com')) detectedSource = 'github';

  // Detect active Project / Workspace name when inside Claude Projects, ChatGPT Projects, or GitHub repos
  let projectName = '';
  const projectHeading =
    document.querySelector('[data-testid="project-title"], [data-testid="project-name"], nav a[href*="/project/"], nav a[href*="/g/"]') ||
    document.querySelector('header h1, [role="navigation"] h2');
  if (projectHeading && projectHeading.innerText?.trim()) {
    projectName = projectHeading.innerText.trim().slice(0, 80);
  } else if (pageUrl.includes('/project/') || pageUrl.includes('/projects/')) {
    projectName = rawTitle;
  }

  const items = [];
  const unreachableResources = [];
  const seenSignatures = new Set();

  function addItem({ title, fileName, filePath, fileType, content, resourceKind, tags }) {
    const clean = (content || '').trim();
    if (!clean || clean.length < 12) return;
    const sig = `${resourceKind}:${title}:${clean.slice(0, 120)}:${clean.length}`;
    if (seenSignatures.has(sig)) return;
    seenSignatures.add(sig);

    const slug =
      (title || 'resource')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase() || `resource_${items.length + 1}`;
    const resolvedFileName = fileName || `${slug}.md`;
    const folderPrefix = projectName
      ? `${detectedSource}-project/${projectName.replace(/[^a-zA-Z0-9_-]+/g, '_')}`
      : `${detectedSource}-companion`;

    items.push({
      title: title || resolvedFileName,
      fileName: resolvedFileName,
      filePath: filePath || `${folderPrefix}/${resolvedFileName}`,
      fileType: fileType || 'md',
      content: clean,
      source: detectedSource,
      projectName: projectName || undefined,
      provenanceUrl: pageUrl,
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
  }

  // 1. Capture Project Instructions / Custom System Prompts if visible in the DOM
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

  // 2. Capture Claude Artifacts / ChatGPT Canvas / Side-panel Documents
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

  // 3. Capture Open Project Knowledge Documents or Modal Previews vs Opaque Attachment Cards
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
      const isBinaryExtension = /\.(pdf|docx|xlsx|pptx|zip|png|jpg|jpeg)$/i.test(label);

      // If the element only shows a filename/size chip (< 120 chars) for a binary file, report it honestly as unreachable from DOM
      if (isBinaryExtension && bodyText.length < 160) {
        unreachableResources.push({
          name: label.split('\n')[0].trim(),
          kind: label.split('.').pop()?.toLowerCase() || 'binary',
          reason: 'Binary attachment card is not expanded in page DOM',
        });
      } else if (bodyText.length >= 80) {
        addItem({
          title: label.split('\n')[0].trim(),
          fileName: /\.[a-z0-9]{1,5}$/i.test(label.split('\n')[0].trim())
            ? label.split('\n')[0].trim()
            : `project_doc_${idx + 1}.md`,
          fileType: 'md',
          content: `# ${label.split('\n')[0].trim()}\n\n> Provenance: ${pageUrl}\n\n${bodyText}`,
          resourceKind: 'document',
          tags: ['project-document'],
        });
      }
    });

  // 4. Capture substantial Code Blocks (> 60 chars) as dedicated code resources
  const codeBlocks = Array.from(document.querySelectorAll('pre code, pre'));
  codeBlocks.slice(0, 8).forEach((codeEl, idx) => {
    const codeText = codeEl.innerText?.trim();
    if (!codeText || codeText.length < 60) return;
    const langMatch = (codeEl.className || '').match(/language-([a-z0-9_+-]+)/i);
    const lang = langMatch ? langMatch[1].toLowerCase() : 'txt';
    const extMap = {
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
      fileType: ext === 'md' ? 'md' : ext === 'json' ? 'json' : 'code',
      content: codeText,
      resourceKind: 'code',
      tags: ['code-block', lang],
    });
  });

  // 5. Capture Conversation Turns (or Main Page Article)
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
  setStatus('Fetching brain facts...', 'info');

  try {
    const brain = brainSelect.value || 'coding';
    const res = await fetch(`${apiUrlInput.value}/api/facts?brain=${encodeURIComponent(brain)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`Could not load facts for '${brain}'`);
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

// 2. STAGE PROJECT & RESOURCES TO REVIEW QUEUE BUTTON
if (captureProjectBtn) {
  captureProjectBtn.addEventListener('click', async () => {
    captureProjectBtn.disabled = true;
    setUnreachableNotice([]);
    setStatus('Scanning project documents, artifacts & conversation...', 'info');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab detected');

      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractProjectAndResources,
      });

      if (!result || (!result.items?.length && !result.unreachableResources?.length)) {
        setStatus('No readable project documents, artifacts, or chat turns detected on this tab.', 'err');
        captureProjectBtn.disabled = false;
        return;
      }

      setUnreachableNotice(result.unreachableResources || []);

      if (!result.items || result.items.length === 0) {
        setStatus(
          `Found ${result.unreachableResources.length} binary attachment card(s) that cannot be read from the page DOM. Download and import them in Capture Hub.`,
          'err'
        );
        captureProjectBtn.disabled = false;
        return;
      }

      const brain = brainSelect.value || 'coding';
      const source = sourceForHost(result.url || '');

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

      if (!res.ok) throw new Error(`Backend returned HTTP ${res.status}`);
      const staged = await res.json();

      await chrome.storage.local.set({
        apiUrl: apiUrlInput.value,
        lastBrain: brain,
        deviceToken: deviceTokenInput ? deviceTokenInput.value : '',
      });

      setStatus(
        `✓ Staged ${staged.stagedCount || result.items.length} project resource(s) into '${brain}' Review Queue! Open Capture Hub → Import & Review to inspect and commit.`,
        'ok'
      );
    } catch (err) {
      setStatus(`Project capture failed: ${err.message}`, 'err');
    } finally {
      captureProjectBtn.disabled = false;
    }
  });
}

// 3. QUICK-SAVE CONVERSATION BUTTON
saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  setUnreachableNotice([]);
  setStatus('Extracting chat dialogue...', 'info');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab detected');

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractConversation,
    });

    if (!result || !result.turns.length) {
      setStatus("No chat text detected on this tab. Open a ChatGPT, Claude, or Gemini conversation.", 'err');
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

    if (!res.ok) throw new Error(`Backend returned HTTP ${res.status}`);
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
