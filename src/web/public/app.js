const statusCards = document.querySelector('#status-cards');
const nextCommand = document.querySelector('#next-command');
const commandResult = document.querySelector('#command-result');
const uploadResult = document.querySelector('#upload-result');
const viewer = document.querySelector('#viewer');
const viewerTitle = document.querySelector('#viewer-title');

async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function card(label, value) {
  const element = document.createElement('article');
  const heading = document.createElement('span');
  const content = document.createElement('strong');
  heading.textContent = label;
  content.textContent = value;
  element.append(heading, content);
  return element;
}

async function loadStatus() {
  const data = await request('/api/status');
  statusCards.replaceChildren(
    card('工作流', data.workflow_status),
    card('已完成章节', `${data.completed_sections_count} / ${data.total_sections_count}`),
    card('最终组合', data.final_combine_status)
  );
  nextCommand.textContent = data.next_recommended_command;
}

function addFileButtons(containerId, files, kind) {
  const container = document.querySelector(containerId);
  container.replaceChildren();
  if (!files.length) {
    container.textContent = '暂无文件';
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
    uploadResult.textContent = `已上传：${data.filename}`;
  } catch (error) {
    uploadResult.textContent = error.message;
  }
});

function showError(error) {
  viewer.textContent = error.message;
}

Promise.all([loadStatus(), loadFiles()]).catch(showError);
