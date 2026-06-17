// ============================================================
// TB Step by Step — Guided wizard
// Status driven by /api/status. State held in module scope.
// ============================================================

// ----- Status state (mirrored from /api/status) -----
const statusState = {
  summary: {
    model_gate: 'pending',
    step1_new_prompt: 'pending',
    step2_outline: 'pending',
    step2_confirm: 'pending',
    final_combine: 'pending'
  },
  state: {
    model_configured: false,
    model_test_passed: false,
    tender_file_loaded: false,
    new_prompt_generated: false,
    outline_generated: false,
    step2_confirmed: false,
    outline_confirmed: false,
    completed_sections: []
  },
  current_step: 'Configure Model API',
  completed_sections_count: 0,
  total_sections_count: 0,
  files: []
};

let viewerTitle = '';
let viewerTitleEl = null;
let previewDeleteBtn = null;

// ----- Step definitions (order matters) -----
const STEPS = [
  { id: 'model',    label: T('steps.model',    '配置模型'),          eyebrow: 'Step 1 of 8' },
  { id: 'upload',   label: T('steps.upload',   '上传招标文件'),      eyebrow: 'Step 2 of 8' },
  { id: 'step1',    label: T('steps.step1',    '生成 new-prompt'),  eyebrow: 'Step 3 of 8' },
  { id: 'outline',  label: T('steps.outline',  '生成大纲'),          eyebrow: 'Step 4 of 8' },
  { id: 'confirm',  label: T('steps.confirm',  '确认大纲'),          eyebrow: 'Step 5 of 8' },
  { id: 'sections', label: T('steps.sections', '撰写章节'),          eyebrow: 'Step 6 of 8' },
  { id: 'combine',  label: T('steps.combine',  '合并最终文档'),      eyebrow: 'Step 7 of 8' },
  { id: 'export',   label: T('steps.export',   '导出'),              eyebrow: 'Step 8 of 8' }
];

let currentStepIndex = 0;
let modelConfigSnapshot = null;
let availableSectionsCache = [];

// ============================================================
// Core helpers
// ============================================================

// Shortcut accessor for centralized UI text, with English fallback.
// Never throws — returns fallback for any bad key or missing window.UI_TEXT.
function T(key, fallback) {
  if (!key || typeof key !== 'string') return fallback ?? '';
  try {
    const val = window.UI_TEXT;
    if (!val || typeof val !== 'object') return fallback ?? '';
    const parts = key.split('.');
    let cur = val;
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return fallback ?? '';
      cur = cur[p];
    }
    return cur != null && typeof cur !== 'undefined' ? String(cur) : (fallback ?? '');
  } catch (_) {
    return fallback ?? '';
  }
}

async function request(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(`Expected JSON but received ${contentType}: ${text.slice(0, 200)}`);
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showError(error) {
  const viewer = document.querySelector('#viewer');
  if (viewer) viewer.textContent = error.message;
  console.error(error);
}

// ============================================================
// Toast / notification system
// ============================================================

const TOAST_TIMEOUTS = {
  success: 4500,
  info: 4500,
  error: 8000
};

function getToastContainer() {
  return document.querySelector('#toast-container');
}

function showToast(type, message) {
  const safe = (typeof message === 'string' && message.length > 0)
    ? message
    : (type === 'error' ? '发生未知错误。' : '操作完成。');

  // Defensive: never leak secrets in toasts
  const clean = safe
    .replace(/sk-[A-Za-z0-9_\-]+/g, '[redacted]')
    .replace(/(api[_-]?key[\s=:]["']?)[^\s"',]+/gi, '$1[redacted]');

  const container = getToastContainer();
  if (!container) {
    console[type === 'error' ? 'error' : 'log'](`[toast:${type}]`, clean);
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  icon.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = clean;

  const close = document.createElement('button');
  close.className = 'toast-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.textContent = '×';
  close.addEventListener('click', () => dismissToast(toast));

  toast.append(icon, text, close);
  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  // Auto-dismiss
  const timeout = TOAST_TIMEOUTS[type] ?? 5000;
  setTimeout(() => dismissToast(toast), timeout);
}

function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.remove('toast-visible');
  toast.classList.add('toast-leaving');
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 220);
}

function toastFromError(prefix, error) {
  const msg = error && error.message ? error.message : String(error);
  showToast('error', `${prefix}: ${msg}`);
}

// ============================================================
// Status fetching
// ============================================================

async function loadStatus() {
  const data = await request('/api/status');
  statusState.summary = data.summary;
  statusState.state = data.state;
  statusState.current_step = data.current_step;
  statusState.completed_sections_count = data.completed_sections_count;
  statusState.total_sections_count = data.total_sections_count;
  return data;
}

async function loadFiles() {
  const data = await request('/api/output');
  statusState.files = data.files;
  return data;
}

async function refreshAll() {
  try {
    await Promise.all([loadStatus(), loadFiles()]);
  } catch (error) {
    showError(error);
  }
  updateStepNav();
  updateFileTree();
  renderCurrentStep();
}

// ============================================================
// Step gating: per-step status
// ============================================================

function stepStatus(stepId) {
  const s = statusState.summary;
  switch (stepId) {
    case 'model':    return s.model_gate === 'completed' ? 'completed' : 'available';
    case 'upload':   return s.model_gate !== 'completed' ? 'locked'
                       : (statusState.state.tender_file_loaded || s.step1_new_prompt === 'completed' ? 'completed' : 'available');
    case 'step1':    return s.model_gate !== 'completed' ? 'locked'
                       : s.step1_new_prompt === 'completed' ? 'completed' : 'available';
    case 'outline':  return s.step1_new_prompt !== 'completed' ? 'locked'
                       : s.step2_outline === 'completed' ? 'completed' : 'available';
    case 'confirm':  return s.step2_outline !== 'completed' ? 'locked'
                       : s.step2_confirm === 'completed' ? 'completed' : 'available';
    case 'sections': return s.step2_confirm !== 'completed' ? 'locked' : 'available';
    case 'combine':  return statusState.completed_sections_count < 1 ? 'locked' : 'available';
    case 'export':   return s.final_combine !== 'completed' ? 'locked' : 'available';
    default:         return 'locked';
  }
}

function canContinueFromStep(stepId) {
  switch (stepId) {
    case 'model':    return statusState.summary.model_gate === 'completed';
    case 'upload':   return statusState.state.tender_file_loaded || statusState.summary.step1_new_prompt === 'completed';
    case 'step1':    return statusState.summary.step1_new_prompt === 'completed';
    case 'outline':  return statusState.summary.step2_outline === 'completed';
    case 'confirm':  return statusState.summary.step2_confirm === 'completed';
    case 'sections': return statusState.completed_sections_count >= 1;
    case 'combine':  return statusState.summary.final_combine === 'completed' || statusState.files.some(f => f.name === 'final-combined.md');
    case 'export':   return statusState.summary.final_combine === 'completed' || statusState.files.some(f => f.name === 'final-combined.md');
    default:         return false;
  }
}

// ============================================================
// UI updates
// ============================================================

function updateStepNav() {
  const items = document.querySelectorAll('.step-item');
  items.forEach((el) => {
    const stepId = el.dataset.step;
    const idx = STEPS.findIndex(s => s.id === stepId);
    const state = stepStatus(stepId);

    el.classList.remove('is-active', 'is-completed', 'is-locked', 'is-available');
    el.classList.add(`is-${state}`);
    if (idx === currentStepIndex) el.classList.add('is-active');

    const marker = el.querySelector('.step-marker');
    if (marker) {
      marker.textContent = state === 'completed' ? '✓' : String(idx + 1);
    }

    el.onclick = () => {
      // Allow jumping to any completed step or current step
      if (state === 'locked' && idx !== currentStepIndex) return;
      currentStepIndex = idx;
      renderCurrentStep();
      updateStepNav();
    };
  });
}

function updateFileTree() {
  const files = statusState.files;
  const has = (name) => files.some(f => f.name === name);
  const sectionFiles = files.filter(f => typeof f.source === 'string' && f.source.startsWith('sections/'));
  const sectionCount = sectionFiles.length;

  const setRow = (selector, present, value) => {
    const el = document.querySelector(selector);
    if (!el) return;
    const status = el.querySelector('.file-status');
    if (status) {
      status.textContent = present ? value : '—';
      status.dataset.state = present ? 'completed' : 'pending';
    }
  };

  setRow('[data-file="input-tender"]', statusState.state.tender_file_loaded, '已上传');
  setRow('[data-file="new-prompt"]', has('new-prompt.md'), '已生成');
  setRow('[data-file="outline"]', has('outline.md'), '已生成');
  setRow('[data-file="sections"]', sectionCount > 0, `${sectionCount} 个`);
  setRow('[data-file="final-combined"]', has('final-combined.md'), '已合并');
  setRow('[data-file="final-docx"]', has('final-combined.md'), '可导出');

  // Build expandable section children under the sections row
  const sectionsRow = document.querySelector('[data-file="sections"]');
  if (!sectionsRow) return;
  const fileNameEl = sectionsRow.querySelector('.file-name');
  if (!fileNameEl) return;
  // Remove old toggle + children
  sectionsRow.querySelectorAll('.sections-toggle, .sections-children').forEach(el => el.remove());

  const childContainer = document.createElement('ul');
  childContainer.className = 'sections-children';
  childContainer.setAttribute('role', 'list');

  // Build section child rows
  sectionFiles.forEach(f => {
    const child = document.createElement('li');
    child.className = 'section-child-row';
    const shortName = f.source.replace('sections/', '');
    child.innerHTML = `<span class="section-child-name">📄 ${shortName}</span><span class="section-child-action">预览</span>`;
    child.addEventListener('click', () => loadSectionPreview(f.name));
    childContainer.appendChild(child);
  });

  // Toggle button
  const toggle = document.createElement('button');
  toggle.className = 'sections-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Expand sections');
  toggle.textContent = '▸';

  const toggleContainer = document.createElement('span');
  toggleContainer.className = 'sections-toggle-wrap';
  toggleContainer.appendChild(toggle);

  let expanded = false;
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    expanded = !expanded;
    toggle.textContent = expanded ? '▾' : '▸';
    childContainer.style.display = expanded ? '' : 'none';
  });

  // Append toggle after file-name (before status if present, or at end)
  const statusEl = sectionsRow.querySelector('.file-status');
  if (statusEl) {
    sectionsRow.insertBefore(toggleContainer, statusEl);
  } else {
    sectionsRow.appendChild(toggleContainer);
  }

  // Append children AFTER the sections li (not inside it)
  sectionsRow.parentElement.insertBefore(childContainer, sectionsRow.nextSibling);
}

async function loadSectionPreview(sectionFilename) {
  const viewer = document.querySelector('#viewer');
  if (!viewer) return;
  viewerTitle = sectionFilename;
  if (!viewerTitleEl) viewerTitleEl = document.querySelector('#viewer-title');
  if (!previewDeleteBtn) previewDeleteBtn = document.querySelector('#preview-delete');
  if (previewDeleteBtn) previewDeleteBtn.style.display = sectionFilename.startsWith('section-') ? '' : 'none';
  if (viewerTitleEl) viewerTitleEl.textContent = `章节：${sectionFilename}`;
  viewer.textContent = '加载中…';
  try {
    const data = await request(`/api/output/${encodeURIComponent(sectionFilename)}`);
    viewer.textContent = typeof data.content === 'string' ? data.content : JSON.stringify(data.content, null, 2);
  } catch (error) {
    viewer.textContent = `无法加载预览：${error.message}`;
  }
}

function setStepHeader(stepDef, instruction) {
  document.querySelector('#step-eyebrow').textContent = stepDef.eyebrow;
  document.querySelector('#step-title').textContent = stepDef.label;
  document.querySelector('#step-instruction').textContent = instruction;
}

function setStepFooter(canBack, canContinue) {
  const back = document.querySelector('#step-back');
  const cont = document.querySelector('#step-continue');
  back.disabled = !canBack;
  cont.disabled = !canContinue;
}

// ============================================================
// Step renderers — each fills #step-body and returns nothing
// ============================================================

const RENDERERS = {
  model() {
    const body = document.querySelector('#step-body');
    body.innerHTML = `
      <form id="model-config-form" class="card-form">
        <div class="form-grid">
          <label class="form-field">
            <span class="field-label">Provider</span>
            <select id="model-provider">
              <option value="openai">openai</option>
              <option value="deepseek">deepseek</option>
              <option value="glm">glm</option>
              <option value="claude-compatible">claude-compatible</option>
              <option value="custom">custom</option>
            </select>
          </label>
          <label class="form-field">
            <span class="field-label">Base URL</span>
            <input id="model-base-url" type="url" required>
          </label>
          <label class="form-field">
            <span class="field-label">Model</span>
            <input id="model-name" type="text" required>
          </label>
          <label class="form-field">
            <span class="field-label">API Key Env Var</span>
            <input id="model-api-key-env" type="text" required>
          </label>
          <label class="form-field">
            <span class="field-label">API Key Value</span>
            <input id="model-api-key-value" type="password" autocomplete="new-password" placeholder="仅保存时发送">
          </label>
          <label class="form-field">
            <span class="field-label">Temperature</span>
            <input id="model-temperature" type="number" min="0" max="2" step="0.1" required>
          </label>
          <label class="form-field">
            <span class="field-label">Max Tokens</span>
            <input id="model-max-tokens" type="number" min="1" step="1" required>
          </label>
          <label class="form-field">
            <span class="field-label">Timeout Seconds</span>
            <input id="model-timeout-seconds" type="number" min="1" step="1" required>
          </label>
        </div>
        <div class="form-actions">
          <button id="model-save-test" type="submit" class="primary">Save &amp; Test</button>
        </div>
        <p id="model-config-result" class="result-line">点击 Save &amp; Test 后将执行真实 API 测试。</p>
        <p id="model-config-status" class="status-line">读取中…</p>
      </form>
    `;
    wireModelConfigForm();
    populateModelConfigFromStatus();
  },

  upload() {
    const body = document.querySelector('#step-body');
    body.innerHTML = `
      <div class="card-form">
        <p class="hint">仅支持 <code>.docx</code>，保存到 <code>input/</code> 目录。</p>
        <form id="upload-form" class="upload-zone">
          <input id="tender-file" type="file" accept=".docx" required hidden>
          <label for="tender-file" class="upload-drop">
            <span class="upload-icon">📄</span>
            <span class="upload-text">点击或拖入 .docx 招标文件</span>
            <span class="upload-sub" id="upload-filename">未选择文件</span>
          </label>
          <div class="form-actions">
            <button id="upload-submit" type="submit" class="primary">上传到 input/</button>
          </div>
        </form>
        <p id="upload-result" class="result-line"></p>
      </div>
    `;
    wireUploadForm();
  },

  step1() {
    const body = document.querySelector('#step-body');
    body.innerHTML = `
      <div class="card-form">
        <p class="hint">读取招标文件并生成 <code>output/new-prompt.md</code>。需要模型已通过测试且招标文件已上传。</p>
        <div class="form-actions">
          <button id="run-step1" class="primary">${T('buttons.runStep1', 'Run Step 1')}</button>
        </div>
        <p id="step1-result" class="result-line"></p>
      </div>
    `;
    wireStep1();
  },

  outline() {
    const body = document.querySelector('#step-body');
    body.innerHTML = `
      <div class="card-form">
        <p class="hint">基于 <code>new-prompt.md</code> 与招标文件生成三级目录大纲。</p>
        <div class="form-actions">
          <button id="run-step2-outline" class="primary">${T('buttons.generateOutline', 'Generate Outline')}</button>
        </div>
        <p id="step2-outline-result" class="result-line"></p>
      </div>
    `;
    wireStep2Outline();
  },

  confirm() {
    const body = document.querySelector('#step-body');
    body.innerHTML = `
      <div class="card-form">
        <p class="hint">请先在右侧文件面板查看 <code>outline.md</code>。确认后，章节撰写将以该大纲为依据。</p>
        <div class="form-actions">
          <button id="confirm-outline" class="primary">${T('buttons.confirmOutline', 'Confirm Outline')}</button>
        </div>
        <p id="step2-confirm-result" class="result-line"></p>
      </div>
    `;
    wireConfirmOutline();
  },

  sections() {
    const body = document.querySelector('#step-body');
    body.innerHTML = `
      <div class="card-form">
        <p class="hint">选择单个章节、多个章节，或一次性生成所有剩余章节。生成过程中可观察进度。</p>

        <div class="sub-card">
          <h4>单个章节</h4>
          <select id="section-select" class="full-select" disabled>
            <option value="">加载中…</option>
          </select>
          <div class="form-actions">
            <button id="generate-section" class="primary" disabled>${T('buttons.generateSection', 'Generate Selected Section')}</button>
          </div>
          <p id="step2-section-result" class="result-line"></p>
        </div>

        <div class="sub-card">
          <h4>多个章节（勾选）</h4>
          <div class="checkbox-controls">
            <button type="button" id="select-all-sections" class="ghost small">Select All</button>
            <button type="button" id="clear-all-sections" class="ghost small">Clear</button>
          </div>
          <div id="sections-checkbox-list" class="checkbox-list" role="group" aria-label="Available sections">
            <p class="empty-state">加载中…</p>
          </div>
          <div class="form-actions">
            <button id="generate-selected-sections" class="primary" disabled>${T('buttons.generateSelectedSections', 'Generate Selected Sections')}</button>
          </div>
          <p id="selected-generation-result" class="result-line"></p>
        </div>

        <div class="sub-card">
          <h4>所有剩余章节</h4>
          <div class="form-actions">
            <button id="generate-all-sections" class="primary" disabled>${T('buttons.generateAllSections', 'Generate All Remaining Sections')}</button>
          </div>
          <p id="batch-generation-result" class="result-line"></p>
        </div>
      </div>
    `;
    wireSections();
  },

  combine() {
    const body = document.querySelector('#step-body');
    const hasFinal = statusState.files.some(f => f.name === 'final-combined.md');
    body.innerHTML = `
      <div class="card-form">
        <p class="hint">按大纲顺序合并所有已生成章节。允许部分章节缺失（将插入占位符）。</p>
        <div class="form-actions">
          <button id="final-combine-button" class="primary">${T('buttons.combineFinal', 'Combine Final Document')}</button>
        </div>
        <p id="final-combine-result" class="result-line"></p>
        ${hasFinal ? '<p class="hint success-hint">已存在 final-combined.md。可继续生成，或前往导出。</p>' : ''}
      </div>
    `;
    wireFinalCombine();
  },

  export() {
    const body = document.querySelector('#step-body');
    const hasFinal = statusState.files.some(f => f.name === 'final-combined.md');
    body.innerHTML = `
      <div class="card-form">
        <p class="hint">下载合并后的最终正文。DOCX 是投标常用的 Word 格式，MD 是可读源文件。</p>
        <div class="form-actions">
          <a id="export-docx" class="primary export-btn" href="/api/final/download-docx" download="final-combined.docx">⬇ ${T('buttons.downloadDocx', 'Download Word 文档')}</a>
          <a id="export-md" class="ghost export-btn" href="/api/final/download" download="final-combined.md">${T('buttons.downloadMd', 'Download Markdown 源文件')}</a>
        </div>
        ${hasFinal ? '' : '<p class="result-line">请先回到上一步生成 final-combined.md。</p>'}
      </div>
    `;

    if (hasFinal) {
      const docx = body.querySelector('#export-docx');
      const md = body.querySelector('#export-md');
      docx?.addEventListener('click', () => showToast('info', 'Downloading final-combined.docx…'));
      md?.addEventListener('click', () => showToast('info', 'Downloading final-combined.md…'));
    }
  }
};

// ============================================================
// Step wiring — reuses logic from previous app.js
// ============================================================

const providerDefaults = {
  openai: { base_url: 'https://api.openai.com/v1', model: 'gpt-4o', api_key_env: 'OPENAI_API_KEY' },
  deepseek: { base_url: 'https://api.deepseek.com', model: 'deepseek-chat', api_key_env: 'DEEPSEEK_API_KEY' },
  glm: { base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus', api_key_env: 'GLM_API_KEY' },
  'claude-compatible': { base_url: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-latest', api_key_env: 'CLAUDE_API_KEY' },
  custom: { base_url: '', model: '', api_key_env: 'CUSTOM_API_KEY' }
};

function populateModelConfigFromStatus() {
  const data = modelConfigSnapshot;
  if (!data) return;
  const defaults = providerDefaults[data.provider] || providerDefaults.deepseek;
  document.querySelector('#model-provider').value = data.provider || 'deepseek';
  document.querySelector('#model-base-url').value = data.base_url || defaults.base_url;
  document.querySelector('#model-name').value = data.model || defaults.model;
  document.querySelector('#model-api-key-env').value = data.api_key_env || defaults.api_key_env;
  document.querySelector('#model-temperature').value = String(data.temperature ?? '0.2');
  document.querySelector('#model-max-tokens').value = String(data.max_tokens ?? '6000');
  document.querySelector('#model-timeout-seconds').value = String(data.timeout_seconds ?? '120');
  document.querySelector('#model-api-key-value').value = '';
  const statusEl = document.querySelector('#model-config-status');
  if (statusEl) {
    if (!data.configured) {
      statusEl.textContent = '尚未保存模型配置。';
    } else {
      const txt = data.model_test_passed ? '已通过真实模型测试' : '已保存但未测试';
      statusEl.textContent = `${data.provider} / ${data.model} / ${txt}`;
    }
  }
}

function applyProviderDefaults(provider) {
  const d = providerDefaults[provider];
  if (!d) return;
  document.querySelector('#model-base-url').value = d.base_url;
  document.querySelector('#model-name').value = d.model;
  document.querySelector('#model-api-key-env').value = d.api_key_env;
}

function wireModelConfigForm() {
  const form = document.querySelector('#model-config-form');
  if (!form) return;
  document.querySelector('#model-provider').addEventListener('change', (e) => applyProviderDefaults(e.currentTarget.value));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.querySelector('#model-save-test');
    const result = document.querySelector('#model-config-result');
    btn.disabled = true;
    result.textContent = 'Testing model connection...';
    try {
      const data = await request('/api/model-config/save-and-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: document.querySelector('#model-provider').value,
          base_url: document.querySelector('#model-base-url').value,
          model: document.querySelector('#model-name').value,
          api_key_env: document.querySelector('#model-api-key-env').value,
          api_key_value: document.querySelector('#model-api-key-value').value,
          temperature: Number(document.querySelector('#model-temperature').value),
          max_tokens: Number(document.querySelector('#model-max-tokens').value),
          timeout_seconds: Number(document.querySelector('#model-timeout-seconds').value)
        })
      });
      document.querySelector('#model-api-key-value').value = '';
      result.textContent = data.success ? 'Model test passed.' : `Model test failed: ${data.error || 'Unknown error'}`;
      if (data.success) {
        showToast('success', 'Model configuration saved and tested.');
      } else {
        showToast('error', `Model test failed: ${data.error || 'Unknown error'}`);
      }
      await refreshAll();
    } catch (error) {
      result.textContent = error.message;
      toastFromError('Model test failed', error);
    } finally {
      btn.disabled = false;
    }
  });
}

function wireUploadForm() {
  const fileInput = document.querySelector('#tender-file');
  const filenameLabel = document.querySelector('#upload-filename');
  fileInput.addEventListener('change', () => {
    filenameLabel.textContent = fileInput.files[0]?.name || '未选择文件';
  });
  document.querySelector('#upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = fileInput.files[0];
    if (!file) return;
    const result = document.querySelector('#upload-result');
    const btn = document.querySelector('#upload-submit');
    btn.disabled = true;
    result.textContent = '正在上传…';
    try {
      const body = new FormData();
      body.append('tender', file);
      const data = await request('/api/upload', { method: 'POST', body });
      result.textContent = `已上传：${data.display_name || data.filename}`;
      showToast('success', `Tender uploaded: ${data.display_name || data.filename}`);
      await refreshAll();
    } catch (error) {
      result.textContent = error.message;
      toastFromError('Upload failed', error);
    } finally {
      btn.disabled = false;
    }
  });
}

function wireStep1() {
  const btn = document.querySelector('#run-step1');
  const result = document.querySelector('#step1-result');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    result.textContent = 'Running Step 1…';
    try {
      const data = await request('/api/step1/run', { method: 'POST' });
      result.textContent = data.success ? 'Step 1 完成。' : `Step 1 失败：${data.error || 'Unknown error'}`;
      if (data.success) showToast('success', 'Step 1 completed successfully.');
      else showToast('error', `Step 1 failed: ${data.error || 'Unknown error'}`);
      await refreshAll();
    } catch (error) {
      result.textContent = error.message;
      toastFromError('Step 1 failed', error);
    } finally {
      btn.disabled = false;
    }
  });
}

function wireStep2Outline() {
  const btn = document.querySelector('#run-step2-outline');
  const result = document.querySelector('#step2-outline-result');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    result.textContent = '正在生成大纲…';
    try {
      const data = await request('/api/step2/outline', { method: 'POST' });
      result.textContent = data.success ? '大纲已生成。' : `生成失败：${data.error || 'Unknown error'}`;
      if (data.success) showToast('success', 'Outline generated successfully.');
      else showToast('error', `Outline generation failed: ${data.error || 'Unknown error'}`);
      await refreshAll();
    } catch (error) {
      result.textContent = error.message;
      toastFromError('Outline generation failed', error);
    } finally {
      btn.disabled = false;
    }
  });
}

function wireConfirmOutline() {
  const btn = document.querySelector('#confirm-outline');
  const result = document.querySelector('#step2-confirm-result');
  btn.addEventListener('click', async () => {
    if (!window.confirm('请确认你已经审阅并批准 output/outline.md。后续章节将按此大纲撰写。')) return;
    btn.disabled = true;
    result.textContent = '确认中…';
    try {
      const data = await request('/api/step2/confirm', { method: 'POST' });
      result.textContent = data.success ? '大纲已确认。' : `确认失败：${data.error || 'Unknown error'}`;
      if (data.success) showToast('success', 'Outline confirmed.');
      else showToast('error', `Confirmation failed: ${data.error || 'Unknown error'}`);
      await refreshAll();
    } catch (error) {
      result.textContent = error.message;
      toastFromError('Outline confirmation failed', error);
    } finally {
      btn.disabled = false;
    }
  });
}

function wireSections() {
  const sel = document.querySelector('#section-select');
  const gen = document.querySelector('#generate-section');
  const result = document.querySelector('#step2-section-result');
  const multi = document.querySelector('#sections-checkbox-list');
  const selAll = document.querySelector('#select-all-sections');
  const clrAll = document.querySelector('#clear-all-sections');
  const genSel = document.querySelector('#generate-selected-sections');
  const selResult = document.querySelector('#selected-generation-result');
  const genAll = document.querySelector('#generate-all-sections');
  const allResult = document.querySelector('#batch-generation-result');

  gen.addEventListener('click', async () => {
    const filename = sel.value;
    if (!filename) { result.textContent = '请选择一个章节'; return; }
    gen.disabled = true;
    result.textContent = '生成中…';
    try {
      const data = await request('/api/step2/section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section_filename: filename })
      });
      result.textContent = data.success ? `已生成 ${data.output_file}` : `失败：${data.error || 'Unknown error'}`;
      if (data.success) showToast('success', `Section generated: ${data.output_file}`);
      else showToast('error', `Section generation failed: ${data.error || 'Unknown error'}`);
      await refreshAll();
    } catch (error) {
      result.textContent = error.message;
      toastFromError('Section generation failed', error);
    } finally {
      gen.disabled = false;
    }
  });

  selAll?.addEventListener('click', () => {
    document.querySelectorAll('.section-checkbox').forEach(cb => { cb.checked = true; });
  });
  clrAll?.addEventListener('click', () => {
    document.querySelectorAll('.section-checkbox').forEach(cb => { cb.checked = false; });
  });

  genSel.addEventListener('click', async () => {
    const selected = Array.from(document.querySelectorAll('.section-checkbox:checked')).map(cb => cb.value);
    if (selected.length === 0) { selResult.textContent = '请至少勾选一个章节'; return; }
    if (!window.confirm(`将按大纲顺序生成 ${selected.length} 个章节。继续？`)) return;
    genSel.disabled = true; gen.disabled = true; genAll.disabled = true;
    selResult.textContent = '启动中…';
    try {
      const start = await request('/api/step2/sections/generate-selected', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: selected })
      });
      if (!start.success) {
        selResult.textContent = `启动失败：${start.message}`;
        showToast('error', `Could not start selected generation: ${start.message}`);
        return;
      }
      showToast('info', `Generating ${selected.length} selected sections…`);
      await pollProgress('/api/step2/sections/generate-selected/status', selResult);
      // Final toast based on the result line content
      const finalText = selResult.textContent || '';
      if (finalText.startsWith('完成')) {
        showToast('success', finalText);
      } else if (finalText.startsWith('失败') || finalText.startsWith('超时')) {
        showToast('error', finalText);
      }
    } catch (error) {
      selResult.textContent = error.message;
      toastFromError('Selected generation failed', error);
    } finally {
      genSel.disabled = false; gen.disabled = false; genAll.disabled = false;
      await refreshAll();
    }
  });

  genAll.addEventListener('click', async () => {
    if (!window.confirm('将顺序生成所有剩余章节，可能耗时数分钟。继续？')) return;
    genAll.disabled = true; gen.disabled = false; genSel.disabled = true;
    allResult.textContent = '启动中…';
    try {
      const start = await request('/api/step2/sections/generate-all', { method: 'POST' });
      if (!start.success) {
        allResult.textContent = `启动失败：${start.message}`;
        showToast('error', `Could not start batch generation: ${start.message}`);
        return;
      }
      showToast('info', 'Batch section generation started…');
      await pollProgress('/api/step2/sections/generate-all/status', allResult);
      const finalText = allResult.textContent || '';
      if (finalText.startsWith('完成')) {
        showToast('success', finalText);
      } else if (finalText.startsWith('失败') || finalText.startsWith('超时')) {
        showToast('error', finalText);
      }
    } catch (error) {
      allResult.textContent = error.message;
      toastFromError('Batch generation failed', error);
    } finally {
      genAll.disabled = false; genSel.disabled = false;
      await refreshAll();
    }
  });

  // populate sections
  loadAvailableSections();
}

async function loadAvailableSections() {
  try {
    const data = await request('/api/step2/sections');
    availableSectionsCache = data.sections || [];
    const sel = document.querySelector('#section-select');
    const multi = document.querySelector('#sections-checkbox-list');
    const gen = document.querySelector('#generate-section');
    const genSel = document.querySelector('#generate-selected-sections');
    const genAll = document.querySelector('#generate-all-sections');

    if (!data.success || !data.sections || data.sections.length === 0) {
      sel.innerHTML = '<option value="">无可用章节</option>';
      multi.innerHTML = '<p class="empty-state">无可用章节</p>';
      gen.disabled = true;
      genSel.disabled = true;
      genAll.disabled = true;
      return;
    }

    sel.innerHTML = '<option value="">请选择章节</option>';
    multi.innerHTML = '';
    data.sections.forEach(s => {
      const indent = '  '.repeat(s.level - 1);
      const prefix = s.needs_research ? '🔍 ' : '';
      const label = `${indent}${prefix}${s.title}`;

      const o = document.createElement('option');
      o.value = s.output_filename;
      o.textContent = label;
      sel.appendChild(o);

      const row = document.createElement('label');
      row.className = 'checkbox-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = s.output_filename;
      cb.className = 'section-checkbox';
      const span = document.createElement('span');
      span.className = 'checkbox-label';
      span.textContent = label;
      row.append(cb, span);
      multi.appendChild(row);
    });
    sel.disabled = false;
    gen.disabled = false;
    genSel.disabled = false;
    genAll.disabled = false;
  } catch (error) {
    showError(error);
  }
}

async function pollProgress(url, resultEl) {
  let completed = false;
  for (let i = 0; i < 3600 && !completed; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const p = await request(url);
    if (p.status === 'completed') {
      resultEl.textContent = `完成：${p.completed}/${p.total}`;
      completed = true;
    } else if (p.status === 'failed') {
      resultEl.textContent = `失败于 "${p.failed_at}"：${p.error || 'Unknown error'}`;
      completed = true;
    } else if (p.status === 'running') {
      resultEl.textContent = `生成中 ${p.completed + 1} / ${p.total}: ${p.current_section || '...'}`;
    }
  }
  if (!completed) resultEl.textContent = '超时（1 小时）';
}

function wireFinalCombine() {
  const btn = document.querySelector('#final-combine-button');
  const result = document.querySelector('#final-combine-result');
  btn.addEventListener('click', async () => {
    const isPartial = statusState.total_sections_count > 0 &&
                      statusState.completed_sections_count < statusState.total_sections_count;
    if (isPartial) {
      if (!window.confirm('部分章节尚未生成。是否仅合并已完成的章节？')) {
        result.textContent = '已取消。';
        return;
      }
    }
    btn.disabled = true;
    result.textContent = '合并中…';
    try {
      const data = await request('/api/final/combine', { method: 'POST' });
      if (!data.success) {
        result.textContent = `合并失败：${data.error || 'Unknown error'}`;
        showToast('error', `Final combine failed: ${data.error || 'Unknown error'}`);
        return;
      }
      result.textContent = `已合并 ${data.combined_sections}/${data.total_sections} → ${data.output_file}`;
      const placeholderSuffix = data.missing_sections && data.missing_sections.length
        ? ` (${data.missing_sections.length} placeholders inserted)`
        : '';
      showToast('success', `Combined ${data.combined_sections}/${data.total_sections} sections → ${data.output_file}${placeholderSuffix}`);
      await refreshAll();
      // preview the result
      try {
        const fileData = await request(`/api/output/${encodeURIComponent('final-combined.md')}`);
        const viewer = document.querySelector('#viewer');
        viewer.textContent = typeof fileData.content === 'string' ? fileData.content : JSON.stringify(fileData.content, null, 2);
      } catch (e) { /* ignore */ }
    } catch (error) {
      result.textContent = error.message;
      toastFromError('Final combine failed', error);
    } finally {
      btn.disabled = false;
    }
  });
}

// ============================================================
// Reset + initial setup
// ============================================================

async function resetRuntime(mode) {
  const message = mode === 'all'
    ? '【重置全部】\n\n将清空所有工作流文件，并删除 config/model.json。\n.env 默认保留。\n\n继续？'
    : '【仅重置工作流】\n\n将清空工作流文件（input、output、logs、sections）。\nconfig/model.json 与 .env 保留。\n\n继续？';
  if (!window.confirm(message)) return;
  try {
    await request('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    // Jump back to first incomplete step
    currentStepIndex = 0;
    await refreshAll();
    for (let i = 0; i < STEPS.length; i++) {
      if (stepStatus(STEPS[i].id) !== 'completed') {
        currentStepIndex = i;
        break;
      }
    }
    updateStepNav();
    renderCurrentStep();
    showToast('success', mode === 'all'
      ? 'Everything reset. Model configuration cleared.'
      : 'Workflow reset. Model configuration kept.');
  } catch (error) {
    showError(error);
    toastFromError('Reset failed', error);
  }
}

async function resetEverything() {
  // First confirmation: explain scope
  const first = window.confirm(
    '【重置全部】\n\n' +
    '将清空所有工作流文件，并删除 config/model.json。\n' +
    '.env 默认保留（包含你的 API Key）。\n\n' +
    '继续？'
  );
  if (!first) return;

  // Second confirmation: stronger, asks about .env explicitly
  const deleteEnv = window.confirm(
    '是否同时删除 .env 文件？\n\n' +
    '点 "确定" = 删除 .env（API Key 会被永久移除，需重新填写）。\n' +
    '点 "取消" = 保留 .env。'
  );
  if (deleteEnv) {
    // .env deletion is intentionally not exposed via the reset API.
    // This path warns the user and aborts — they should remove .env manually if needed.
    window.alert('出于安全考虑，Web UI 不会删除 .env。如需删除，请手动操作。已改为仅重置工作流与模型配置。');
  }

  await resetRuntime('all');
}

// ============================================================
// Routing
// ============================================================

const STEP_INSTRUCTIONS = {
  model:    T('instructions.model',    '在开始撰写前，需要先配置并测试真实的模型 API。'),
  upload:   T('instructions.upload',   '请将新招标文件（.docx）上传到 input/ 目录。'),
  step1:    T('instructions.step1',    '读取招标文件，生成 new-prompt.md。'),
  outline:  T('instructions.outline',  '基于 new-prompt.md 和招标文件生成三级目录大纲。'),
  confirm:  T('instructions.confirm',  '审阅右侧 outline.md，确认后章节撰写将以该大纲为依据。'),
  sections: T('instructions.sections', '选择单个、多个或全部剩余章节生成。'),
  combine:  T('instructions.combine', '按大纲顺序合并所有已生成章节，缺失部分将插入占位符。'),
  export:   T('instructions.export',   '下载最终合并文档的 DOCX 或 Markdown 版本。')
};

function renderCurrentStep() {
  const def = STEPS[currentStepIndex];
  if (!def) return;
  setStepHeader(def, STEP_INSTRUCTIONS[def.id]);
  const renderer = RENDERERS[def.id];
  if (renderer) renderer();
  setStepFooter(currentStepIndex > 0, canContinueFromStep(def.id));
}

// ============================================================
// Boot
// ============================================================

async function boot() {
  // Apply window.UI_TEXT to elements with data-i18n-key attributes
  try {
    document.querySelectorAll('[data-i18n-key]').forEach(el => {
      try {
        const key = el.getAttribute('data-i18n-key');
        const fallback = el.textContent.trim();
        el.textContent = T(key, fallback);
      } catch (_) { /* skip individual element errors */ }
    });
  } catch (_) { /* skip if querySelectorAll fails */ }

  // Top-level reset buttons
  document.querySelector('#reset-workflow').addEventListener('click', () => {
    resetRuntime('workflow');
  });
  document.querySelector('#reset-everything').addEventListener('click', () => {
    resetEverything();
  });
  document.querySelector('#refresh-status').addEventListener('click', refreshAll);

  // Step nav
  document.querySelector('#step-back').addEventListener('click', () => {
    if (currentStepIndex > 0) {
      currentStepIndex--;
      updateStepNav();
      renderCurrentStep();
    }
  });
  document.querySelector('#step-continue').addEventListener('click', () => {
    const def = STEPS[currentStepIndex];
    if (canContinueFromStep(def.id) && currentStepIndex < STEPS.length - 1) {
      currentStepIndex++;
      updateStepNav();
      renderCurrentStep();
    }
  });

  // File tree clicks → preview
  document.querySelectorAll('.file-row').forEach(row => {
    row.addEventListener('click', async () => {
      const key = row.dataset.file;
      const map = {
        'input-tender': null, // server has no listing; skip
        'new-prompt': 'new-prompt.md',
        'outline': 'outline.md',
        'final-combined': 'final-combined.md'
      };
      const file = key === 'sections' ? null : map[key];
      if (key === 'sections') return; // sections expand/collapse handled separately
      if (!file) return;
      await loadSectionPreview(file);
    });
  });

  // Preview title + delete button
  viewerTitleEl = document.querySelector('#viewer-title');
  previewDeleteBtn = document.querySelector('#preview-delete');
  if (previewDeleteBtn) {
    previewDeleteBtn.addEventListener('click', async () => {
      if (!viewerTitle || !viewerTitle.startsWith('section-')) return;
      if (!window.confirm(`删除章节 "${viewerTitle}"？此操作不可撤销。`)) return;
      try {
        await request(`/api/sections/${encodeURIComponent(viewerTitle)}`, { method: 'DELETE' });
        document.querySelector('#viewer').textContent = 'Select a file to preview.';
        if (viewerTitleEl) viewerTitleEl.textContent = 'Preview';
        if (previewDeleteBtn) previewDeleteBtn.style.display = 'none';
        viewerTitle = '';
        await Promise.all([loadStatus(), loadFiles()]);
        updateFileTree();
      } catch (error) {
        showError(error);
      }
    });
  }

  // Initial load: status + files + model config
  try {
    const [, , cfg] = await Promise.all([
      loadStatus(),
      loadFiles(),
      request('/api/model-config/status')
    ]);
    modelConfigSnapshot = cfg;
    // jump to first incomplete step
    for (let i = 0; i < STEPS.length; i++) {
      if (stepStatus(STEPS[i].id) !== 'completed') {
        currentStepIndex = i;
        break;
      }
    }
  } catch (error) {
    showError(error);
  }

  updateStepNav();
  updateFileTree();
  renderCurrentStep();
}

boot();
