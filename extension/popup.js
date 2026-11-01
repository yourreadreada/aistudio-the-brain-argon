// Web AI Companion: ChatGPT, Claude, and Gemini Web Connector
// Runs in the extension's popup context

const apiUrlInput = document.getElementById('apiUrl');
const brainSelect = document.getElementById('brainSelect');
const injectBtn = document.getElementById('injectBtn');
const saveBtn = document.getElementById('saveBtn');
const copyBtn = document.getElementById('copyBtn');
const statusEl = document.getElementById('status');
const serverDot = document.getElementById('serverDot');
const serverText = document.getElementById('serverText');
const targetSite = document.getElementById('targetSite');

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind || '';
}

async function checkServer() {
  try {
    const res = await fetch(`${apiUrlInput.value}/api/brains`, { signal: AbortSignal.timeout(2000) });
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
    serverText.textContent = 'Offline (Start python -m brain.web)';
  }
}

async function init() {
  const stored = await chrome.storage.local.get(['apiUrl', 'lastBrain']);
  if (stored.apiUrl) apiUrlInput.value = stored.apiUrl;
  if (stored.lastBrain) brainSelect.value = stored.lastBrain;

  // Check active tab host
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      if (tab.url.includes('chatgpt.com')) targetSite.textContent = 'Active: ChatGPT Web';
      else if (tab.url.includes('claude.ai')) targetSite.textContent = 'Active: Claude Web';
      else if (tab.url.includes('gemini.google.com')) targetSite.textContent = 'Active: Gemini Web';
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
    // ChatGPT prompt textarea or contenteditable
    inputEl =
      document.querySelector('#prompt-textarea') ||
      document.querySelector('textarea[data-id="root"]') ||
      document.querySelector('div[contenteditable="true"]');
  } else if (host.includes('claude.ai')) {
    // Claude.ai prompt box
    inputEl =
      document.querySelector('div[contenteditable="true"]') ||
      document.querySelector('fieldset div[contenteditable="true"]');
  } else if (host.includes('gemini.google.com')) {
    // Gemini web prompt box
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
    // Contenteditable div
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
    // Claude message turns
    const userNodes = document.querySelectorAll('[data-testid="user-message"]');
    const assistantNodes = document.querySelectorAll(
      '[data-testid="assistant-message"], .font-claude-message, div.standard-markdown'
    );
    // Gather sequentially if possible
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
    // ChatGPT conversation turns
    document.querySelectorAll('[data-message-author-role]').forEach((el) => {
      const role = el.getAttribute('data-message-author-role') || 'unknown';
      const text = el.innerText?.trim();
      if (text) turns.push({ role, text });
    });
  } else if (host.includes('gemini.google.com')) {
    // Gemini message turns
    document.querySelectorAll('user-query, model-response, .query-text, .model-response-text').forEach((el) => {
      const isUser = el.tagName.toLowerCase() === 'user-query' || el.classList.contains('query-text');
      const text = el.innerText?.trim();
      if (text) turns.push({ role: isUser ? 'user' : 'assistant', text });
    });
  }

  if (turns.length === 0) {
    // Fallback: grab main element or article
    const main = document.querySelector('main') || document.querySelector('article') || document.body;
    const text = main.innerText?.trim();
    if (text) turns.push({ role: 'unknown', text });
  }

  const title = document.title ? document.title.replace(/\s*[-|]\s*(ChatGPT|Claude|Gemini).*$/i, '').trim() : 'Chat';
  return { title, url: window.location.href, turns };
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
  return 'web';
}

// 1. INJECT MEMORY INTO CHAT BUTTON
injectBtn.addEventListener('click', async () => {
  injectBtn.disabled = true;
  setStatus('Fetching brain facts...', 'info');

  try {
    const brain = brainSelect.value || 'coding';
    const res = await fetch(`${apiUrlInput.value}/api/facts?brain=${encodeURIComponent(brain)}`);
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
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(contextPrimer);
      setStatus(`Notice: Copied ${facts.length} facts to clipboard (could not auto-focus prompt box). Paste it into chat!`, 'info');
    }
  } catch (err) {
    setStatus(`Failed: ${err.message}`, 'err');
  } finally {
    injectBtn.disabled = false;
  }
});

// 2. SAVE CONVERSATION BUTTON
saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
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
      headers: { 'Content-Type': 'application/json' },
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

    await chrome.storage.local.set({ apiUrl: apiUrlInput.value, lastBrain: brain });
    setStatus(`✓ Saved to '${brain}' (${saved.action || 'updated'}) — ${result.turns.length} turn(s) recorded!`, 'ok');
  } catch (err) {
    setStatus(`Failed: ${err.message}`, 'err');
  } finally {
    saveBtn.disabled = false;
  }
});

// 3. COPY SNAPSHOT BUTTON
copyBtn.addEventListener('click', async () => {
  try {
    const brain = brainSelect.value || 'coding';
    const res = await fetch(`${apiUrlInput.value}/api/facts?brain=${encodeURIComponent(brain)}`);
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

brainSelect.addEventListener('change', () => {
  chrome.storage.local.set({ lastBrain: brainSelect.value });
});

init();
