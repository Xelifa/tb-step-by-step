const statusCards = document.querySelector('#status-cards');
const currentStep = document.querySelector('#current-step');
const nextCommand = document.querySelector('#next-command');
const commandResult = document.querySelector('#command-result');
const uploadResult = document.querySelector('#upload-result');
const resetResult = document.querySelector('#reset-result');
const step1Result = document.querySelector('#step1-result');
const step2OutlineResult = document.querySelector('#step2-outline-result');
const step2ConfirmResult = document.querySelector('#step2-confirm-result');
const viewer = document.querySelector('#viewer');
const viewerTitle = document.querySelector('#viewer-title');
const modelConfigStatus = document.querySelector('#model-config-status');
const modelConfigResult = document.querySelector('#model-config-result');
const modelConfigForm = document.querySelector('#model-config-form');
const modelSaveTestButton = document.querySelector('#model-save-test');
const modelProviderInput = document.querySelector('#model-provider');
const modelBaseUrlInput = document.querySelector('#model-base-url');
const modelNameInput = document.querySelector('#model-name');
const modelApiKeyEnvInput = document.querySelector('#model-api-key-env');
const modelApiKeyValueInput = document.querySelector('#model-api-key-value');
const modelTemperatureInput = document.querySelector('#model-temperature');
const modelMaxTokensInput = document.querySelector('#model-max-tokens');
const modelTimeoutSecondsInput = document.querySelector('#model-timeout-seconds');
const runStep1Button = document.querySelector('#run-step1');
const runStep2OutlineButton = document.querySelector('#run-step2-outline');
const confirmOutlineButton = document.querySelector('#confirm-outline');
const sectionSelect = document.querySelector('#section-select');
const generateSectionButton = document.querySelector('#generate-section');
const step2SectionResult = document.querySelector('#step2-section-result');
const generateAllSectionsButton = document.querySelector('#generate-all-sections');
const batchGenerationResult = document.querySelector('#batch-generation-result');
const generateSelectedSectionsButton = document.querySelector('#generate-selected-sections');
const selectedGenerationResult = document.querySelector('#selected-generation-result');
const sectionsCheckboxList = document.querySelector('#sections-checkbox-list');
const selectAllSectionsButton = document.querySelector('#select-all-sections');
const clearAllSectionsButton = document.querySelector('#clear-all-sections');

const providerDefaults = {
  openai: {
    base_url: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    api_key_env: 'OPENAI_API_KEY'
  },
  deepseek: {
    base_url: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    api_key_env: 'DEEPSEEK_API_KEY'
  },
  glm: {
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
    api_key_env: 'GLM_API_KEY'
  },
  'claude-compatible': {
    base_url: 'https://api.anthropic.com',
    model: 'claude-3-5-sonnet-latest',
    api_key_env: 'CLAUDE_API_KEY'
  },
  custom: {
    base_url: '',
    model: '',
    api_key_env: 'CUSTOM_API_KEY'
  }
};

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

function card(label, value) {
  const element = document.createElement('article');
  const normalizedValue = String(value).toLowerCase();
  const heading = document.createElement('span');
  const content = document.createElement('strong');
  const accent = document.createElement('i');

  element.className = 'status-card';
  if (normalizedValue.includes('pending') || normalizedValue === '0 / 0') {
    element.dataset.state = 'pending';
  } else if (normalizedValue.includes('complete') || normalizedValue.includes('completed')) {
    element.dataset.state = 'completed';
  } else {
    element.dataset.state = 'active';
  }

  heading.textContent = label;
  content.textContent = value;
  accent.setAttribute('aria-hidden', 'true');
  element.append(accent, heading, content);
  return element;
}

async function loadStatus() {
  const data = await request('/api/status');
  statusCards.replaceChildren(
    card('Model Gate', data.summary.model_gate),
    card('Step 1 new-prompt', data.summary.step1_new_prompt),
    card('Step 2 outline', data.summary.step2_outline),
    card('Step 2 confirm', data.summary.step2_confirm),
    card('Sections', data.summary.sections),
    card('Final combine', data.summary.final_combine)
  );
  currentStep.textContent = data.current_step;
  nextCommand.textContent = data.next_recommended_label;

  // Show/hide Step 1 button based on status
  const modelGatePassed = data.summary.model_gate === 'completed';
  const step1NotComplete = data.summary.step1_new_prompt === 'pending';
  const hasTenderFile = data.state.tender_file_loaded || data.summary.step1_new_prompt === 'completed';

  runStep1Button.style.display = modelGatePassed && hasTenderFile && step1NotComplete ? 'inline-block' : 'none';

  // Show/hide Step 2 Outline button based on status
  const step1Completed = data.summary.step1_new_prompt === 'completed';
  const step2OutlineNotComplete = data.summary.step2_outline === 'pending';

  runStep2OutlineButton.style.display = modelGatePassed && step1Completed && step2OutlineNotComplete ? 'inline-block' : 'none';

  // Show/hide Confirm Outline button based on status
  const step2OutlineCompleted = data.summary.step2_outline === 'completed';
  const step2ConfirmNotComplete = data.summary.step2_confirm === 'pending';

  confirmOutlineButton.style.display = modelGatePassed && step2OutlineCompleted && step2ConfirmNotComplete ? 'inline-block' : 'none';

  // Show/hide Section selector based on status
  const step2ConfirmCompleted = data.summary.step2_confirm === 'completed';
  const hasRemainingSections = data.completed_sections_count < data.total_sections_count;

  if (step2ConfirmCompleted && hasRemainingSections) {
    sectionSelect.disabled = false;
    generateSectionButton.disabled = false;
    generateAllSectionsButton.disabled = false;
    generateSelectedSectionsButton.disabled = false;
    if (selectAllSectionsButton) selectAllSectionsButton.disabled = false;
    if (clearAllSectionsButton) clearAllSectionsButton.disabled = false;
    await loadAvailableSections();
  } else {
    sectionSelect.disabled = true;
    generateSectionButton.disabled = true;
    generateAllSectionsButton.disabled = true;
    generateSelectedSectionsButton.disabled = true;
    if (selectAllSectionsButton) selectAllSectionsButton.disabled = true;
    if (clearAllSectionsButton) clearAllSectionsButton.disabled = true;
    sectionSelect.innerHTML = '<option value="">No sections available</option>';
    sectionsCheckboxList.innerHTML = '<p class="empty-state">No sections available</p>';
  }
}

function applyProviderDefaults(provider) {
  const defaults = providerDefaults[provider];
  if (!defaults) {
    return;
  }

  modelBaseUrlInput.value = defaults.base_url;
  modelNameInput.value = defaults.model;
  modelApiKeyEnvInput.value = defaults.api_key_env;
}

function updateModelConfigStatusText(data) {
  if (!data.configured) {
    modelConfigStatus.textContent = '当前尚未保存模型配置。可直接在此填写并测试真实模型连接。';
    return;
  }

  const statusText = data.model_test_passed ? '已通过真实模型测试' : '已保存但尚未通过模型测试';
  const keyText = data.has_api_key ? '已检测到 API Key' : '尚未检测到 API Key';
  modelConfigStatus.textContent = `${data.provider} / ${data.model} / ${statusText} / ${keyText}`;
}

async function loadModelConfigStatus() {
  const data = await request('/api/model-config/status');
  const defaults = providerDefaults[data.provider] || providerDefaults.deepseek;

  modelProviderInput.value = data.provider || 'deepseek';
  modelBaseUrlInput.value = data.base_url || defaults.base_url;
  modelNameInput.value = data.model || defaults.model;
  modelApiKeyEnvInput.value = data.api_key_env || defaults.api_key_env;
  modelTemperatureInput.value = String(data.temperature ?? '0.2');
  modelMaxTokensInput.value = String(data.max_tokens ?? '6000');
  modelTimeoutSecondsInput.value = String(data.timeout_seconds ?? '120');
  modelApiKeyValueInput.value = '';

  updateModelConfigStatusText(data);
}

function addFileButtons(containerId, files, kind) {
  const container = document.querySelector(containerId);
  container.replaceChildren();
  if (!files.length) {
    const emptyState = document.createElement('p');
    emptyState.className = 'empty-state';
    emptyState.textContent = '暂无文件';
    container.append(emptyState);
    return;
  }
  for (const file of files) {
    const name = typeof file === 'string' ? file : file.name;
    const source = typeof file === 'string' ? file : file.source;
    const button = document.createElement('button');
    button.className = 'file-button';
    button.textContent = source;
    button.addEventListener('click', async () => {
      const data = await request(`/api/${kind}/${encodeURIComponent(name)}`);
      viewerTitle.textContent = `${kind === 'logs' ? '日志' : '输出'}：${source}`;
      viewer.textContent = typeof data.content === 'string'
        ? data.content
        : JSON.stringify(data.content, null, 2);
    });
    container.append(button);
  }
}

async function loadFiles() {
  const [outputs, logs] = await Promise.all([
    request('/api/output'),
    request('/api/logs')
  ]);
  addFileButtons('#output-list', outputs.files, 'output');
  addFileButtons('#log-list', logs.files, 'logs');
}

document.querySelector('#refresh-status').addEventListener('click', () => loadStatus().catch(showError));

modelProviderInput.addEventListener('change', event => {
  applyProviderDefaults(event.currentTarget.value);
});

modelConfigForm.addEventListener('submit', async event => {
  event.preventDefault();
  modelSaveTestButton.disabled = true;
  modelConfigResult.textContent = 'Testing model connection...';

  try {
    const data = await request('/api/model-config/save-and-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: modelProviderInput.value,
        base_url: modelBaseUrlInput.value,
        model: modelNameInput.value,
        api_key_env: modelApiKeyEnvInput.value,
        api_key_value: modelApiKeyValueInput.value,
        temperature: Number(modelTemperatureInput.value),
        max_tokens: Number(modelMaxTokensInput.value),
        timeout_seconds: Number(modelTimeoutSecondsInput.value)
      })
    });

    modelApiKeyValueInput.value = '';
    modelConfigResult.textContent = data.success
      ? 'Model test passed.'
      : `Model test failed: ${data.error || 'Unknown error'}`;

    await Promise.all([loadModelConfigStatus(), loadStatus(), loadFiles()]);
  } catch (error) {
    modelConfigResult.textContent = error.message;
  } finally {
    modelSaveTestButton.disabled = false;
  }
});

document.querySelector('#reset-runtime').addEventListener('click', async event => {
  const button = event.currentTarget;
  const mode = document.querySelector('input[name="reset-mode"]:checked').value;
  const confirmationMessage = mode === 'all'
    ? 'This will clear runtime files and remove config/model.json. .env will be kept. Continue?'
    : 'This will clear runtime files and restart the dashboard from a fresh project state. Continue?';

  if (!window.confirm(confirmationMessage)) {
    return;
  }

  button.disabled = true;
  resetResult.textContent = '正在重置...';

  try {
    const data = await request('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    resetResult.textContent = data.message;
    commandResult.textContent = '尚未运行命令。';
    uploadResult.textContent = '';
    modelApiKeyValueInput.value = '';
    viewerTitle.textContent = '只读查看器';
    viewer.textContent = '选择输出文件或日志进行查看。';
    modelConfigResult.textContent = '保存后将自动执行真实模型测试。';
    await Promise.all([loadModelConfigStatus(), loadStatus(), loadFiles()]);
  } catch (error) {
    resetResult.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelectorAll('[data-command]').forEach(button => {
  button.addEventListener('click', async () => {
    const command = button.dataset.command;
    button.disabled = true;
    commandResult.textContent = `正在运行 npm run ${command}...`;
    try {
      const data = await request(`/api/run/${command}`, { method: 'POST' });
      commandResult.textContent = [data.stdout, data.stderr].filter(Boolean).join('\n') || '命令执行完成。';
      await loadStatus();
    } catch (error) {
      commandResult.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
});

document.querySelector('#upload-form').addEventListener('submit', async event => {
  event.preventDefault();
  const file = document.querySelector('#tender-file').files[0];
  const body = new FormData();
  body.append('tender', file);
  uploadResult.textContent = '正在上传...';
  try {
    const data = await request('/api/upload', { method: 'POST', body });
    uploadResult.textContent = `已上传：${data.display_name || data.filename}`;
    await loadStatus();
  } catch (error) {
    uploadResult.textContent = error.message;
  }
});

runStep1Button.addEventListener('click', async () => {
  runStep1Button.disabled = true;
  step1Result.textContent = 'Running Step 1...';

  try {
    const data = await request('/api/step1/run', { method: 'POST' });
    step1Result.textContent = data.success ? 'Step 1 completed successfully' : `Step 1 failed: ${data.error || 'Unknown error'}`;
    await Promise.all([loadStatus(), loadFiles()]);
  } catch (error) {
    step1Result.textContent = error.message;
  } finally {
    runStep1Button.disabled = false;
  }
});

runStep2OutlineButton.addEventListener('click', async () => {
  runStep2OutlineButton.disabled = true;
  step2OutlineResult.textContent = 'Generating outline...';

  try {
    const data = await request('/api/step2/outline', { method: 'POST' });
    step2OutlineResult.textContent = data.success ? 'Step 2 outline generated successfully' : `Step 2 outline failed: ${data.error || 'Unknown error'}`;
    await Promise.all([loadStatus(), loadFiles()]);
  } catch (error) {
    step2OutlineResult.textContent = error.message;
  } finally {
    runStep2OutlineButton.disabled = false;
  }
});

confirmOutlineButton.addEventListener('click', async () => {
  const confirmed = window.confirm('Please confirm that you have reviewed and approved output/outline.md. Future section writing will follow this outline.');

  if (!confirmed) {
    return;
  }

  confirmOutlineButton.disabled = true;
  step2ConfirmResult.textContent = 'Confirming outline...';

  try {
    const data = await request('/api/step2/confirm', { method: 'POST' });
    step2ConfirmResult.textContent = data.success ? 'Outline confirmed successfully' : `Confirmation failed: ${data.error || 'Unknown error'}`;
    await loadStatus();
  } catch (error) {
    step2ConfirmResult.textContent = error.message;
  } finally {
    confirmOutlineButton.disabled = false;
  }
});

async function loadAvailableSections() {
  try {
    const data = await request('/api/step2/sections');
    if (!data.success || !data.sections || data.sections.length === 0) {
      sectionSelect.innerHTML = '<option value="">No sections available</option>';
      sectionsCheckboxList.innerHTML = '<p class="empty-state">No sections available</p>';
      return;
    }

    sectionSelect.innerHTML = '<option value="">Select a section...</option>';
    sectionsCheckboxList.innerHTML = '';
    data.sections.forEach(section => {
      const indent = '  '.repeat(section.level - 1);
      const prefix = section.needs_research ? '🔍 ' : '';
      const label = `${indent}${prefix}${section.title}`;

      const single = document.createElement('option');
      single.value = section.output_filename;
      single.textContent = label;
      sectionSelect.appendChild(single);

      const row = document.createElement('label');
      row.className = 'checkbox-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = section.output_filename;
      checkbox.className = 'section-checkbox';

      const text = document.createElement('span');
      text.className = 'checkbox-label';
      text.textContent = label;

      row.append(checkbox, text);
      sectionsCheckboxList.appendChild(row);
    });
  } catch (error) {
    sectionSelect.innerHTML = '<option value="">Error loading sections</option>';
    sectionsCheckboxList.innerHTML = '<p class="empty-state">Error loading sections</p>';
  }
}

generateSectionButton.addEventListener('click', async () => {
  const sectionFilename = sectionSelect.value;

  if (!sectionFilename) {
    step2SectionResult.textContent = 'Please select a section first';
    return;
  }

  generateSectionButton.disabled = true;
  sectionSelect.disabled = true;
  step2SectionResult.textContent = 'Generating section...';

  try {
    const data = await request('/api/step2/section', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section_filename: sectionFilename })
    });

    step2SectionResult.textContent = data.success
      ? `Section generated: ${data.output_file}`
      : `Generation failed: ${data.error || 'Unknown error'}`;

    if (data.success) {
      await Promise.all([loadStatus(), loadFiles()]);
    }
  } catch (error) {
    step2SectionResult.textContent = error.message;
  } finally {
    generateSectionButton.disabled = false;
    sectionSelect.disabled = false;
  }
});

generateAllSectionsButton.addEventListener('click', async () => {
  const confirmed = window.confirm('This will generate all remaining sections sequentially. This may take several minutes. Continue?');

  if (!confirmed) {
    return;
  }

  generateAllSectionsButton.disabled = true;
  generateSectionButton.disabled = true;
  sectionSelect.disabled = true;
  batchGenerationResult.textContent = 'Starting batch generation...';

  try {
    // Start batch generation
    const startData = await request('/api/step2/sections/generate-all', { method: 'POST' });

    if (!startData.success) {
      batchGenerationResult.textContent = `Failed to start: ${startData.message}`;
      return;
    }

    batchGenerationResult.textContent = 'Batch generation started. Polling progress...';

    // Poll for progress
    let completed = false;
    let pollCount = 0;
    const maxPolls = 3600; // 1 hour at 1 poll per second

    while (!completed && pollCount < maxPolls) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      pollCount++;

      const progress = await request('/api/step2/sections/generate-all/status');

      if (progress.status === 'completed') {
        batchGenerationResult.textContent = `Completed: ${progress.completed}/${progress.total} sections generated`;
        completed = true;
        await Promise.all([loadStatus(), loadFiles()]);
      } else if (progress.status === 'failed') {
        batchGenerationResult.textContent = `Failed at "${progress.failed_at}": ${progress.error || 'Unknown error'}`;
        completed = true;
      } else if (progress.status === 'running') {
        const current = progress.completed + 1;
        batchGenerationResult.textContent = `Generating ${current} / ${progress.total}: ${progress.current_section || '...'}`;
      }
    }

    if (!completed) {
      batchGenerationResult.textContent = 'Batch generation timed out (1 hour limit)';
    }
  } catch (error) {
    batchGenerationResult.textContent = error.message;
  } finally {
    generateAllSectionsButton.disabled = false;
    generateSectionButton.disabled = false;
    sectionSelect.disabled = false;
    await loadStatus(); // Refresh button states
  }
});

if (selectAllSectionsButton) {
  selectAllSectionsButton.addEventListener('click', () => {
    document.querySelectorAll('.section-checkbox').forEach(cb => { cb.checked = true; });
  });
}

if (clearAllSectionsButton) {
  clearAllSectionsButton.addEventListener('click', () => {
    document.querySelectorAll('.section-checkbox').forEach(cb => { cb.checked = false; });
  });
}

generateSelectedSectionsButton.addEventListener('click', async () => {
  const selected = Array.from(document.querySelectorAll('.section-checkbox:checked'))
    .map(cb => cb.value)
    .filter(v => v.length > 0);

  if (selected.length === 0) {
    selectedGenerationResult.textContent = 'Please select at least one section';
    return;
  }

  const confirmed = window.confirm(`This will generate ${selected.length} selected sections sequentially in outline order. Continue?`);
  if (!confirmed) {
    return;
  }

  generateSelectedSectionsButton.disabled = true;
  generateAllSectionsButton.disabled = true;
  generateSectionButton.disabled = true;
  document.querySelectorAll('.section-checkbox').forEach(cb => { cb.disabled = true; });
  if (selectAllSectionsButton) selectAllSectionsButton.disabled = true;
  if (clearAllSectionsButton) clearAllSectionsButton.disabled = true;
  sectionSelect.disabled = true;
  selectedGenerationResult.textContent = 'Starting selected generation...';

  try {
    const startData = await request('/api/step2/sections/generate-selected', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames: selected })
    });

    if (!startData.success) {
      selectedGenerationResult.textContent = `Failed to start: ${startData.message}`;
      return;
    }

    selectedGenerationResult.textContent = 'Selected generation started. Polling progress...';

    let completed = false;
    let pollCount = 0;
    const maxPolls = 3600;

    while (!completed && pollCount < maxPolls) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      pollCount++;

      const progress = await request('/api/step2/sections/generate-selected/status');

      if (progress.status === 'completed') {
        selectedGenerationResult.textContent = `Completed: ${progress.completed}/${progress.total} sections generated`;
        completed = true;
        await Promise.all([loadStatus(), loadFiles()]);
      } else if (progress.status === 'failed') {
        selectedGenerationResult.textContent = `Failed at "${progress.failed_at}": ${progress.error || 'Unknown error'}`;
        completed = true;
      } else if (progress.status === 'running') {
        const current = progress.completed + 1;
        selectedGenerationResult.textContent = `Generating ${current} / ${progress.total}: ${progress.current_section || '...'}`;
      }
    }

    if (!completed) {
      selectedGenerationResult.textContent = 'Selected generation timed out (1 hour limit)';
    }
  } catch (error) {
    selectedGenerationResult.textContent = error.message;
  } finally {
    generateSelectedSectionsButton.disabled = false;
    generateAllSectionsButton.disabled = false;
    generateSectionButton.disabled = false;
    document.querySelectorAll('.section-checkbox').forEach(cb => { cb.disabled = false; });
    sectionSelect.disabled = false;
    await loadStatus();
  }
});

function showError(error) {
  viewer.textContent = error.message;
}

Promise.all([loadStatus(), loadFiles()]).catch(showError);
Promise.all([loadModelConfigStatus()]).catch(showError);
