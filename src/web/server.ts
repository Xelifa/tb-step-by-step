import express, { Request, Response } from 'express';
import multer from 'multer';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { INITIAL_WORKFLOW_STATE, WorkflowState } from '../types/state';
import {
  getSanitizedModelConfigStatus,
  saveAndTestModelConfiguration
} from '../core/model-config-service';
import { runStep1 } from '../core/step1-runner';
import { runStep2Outline } from '../core/step2-outline-runner';

const execFileAsync = promisify(execFile);
const app = express();
const port = 3000;
const projectRoot = process.cwd();
const publicDir = path.join(projectRoot, 'src', 'web', 'public');
const inputDir = path.join(projectRoot, 'input');
const outputDir = path.join(projectRoot, 'output');
const sectionsDir = path.join(outputDir, 'sections');
const logsDir = path.join(projectRoot, 'logs');
const configDir = path.join(projectRoot, 'config');
const dashboardSessionFile = path.join(logsDir, '.web-ui-session');

const topLevelOutputs = new Set([
  'new-prompt.md',
  'outline.md',
  'final-combined.md'
]);

const safeLogFiles = new Set([
  'model-test.json',
  'step1-model-check.json',
  'step1-run.json',
  'step2-outline-run.json',
  'step2-confirm-run.json',
  'step2-section-run.json',
  'step2-status-run.json',
  'final-combine-run.json',
  'section-run-log.json',
  'workflow-state.json'
]);

const allowedCommands = {
  workflow: ['run', 'workflow'],
  'step2:status': ['run', 'step2:status']
} as const;

type ResetMode = 'workflow' | 'all';

interface DashboardSession {
  last_reset_at: string;
  reset_mode: ResetMode;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    callback(null, path.extname(file.originalname).toLowerCase() === '.docx');
  }
});

app.use(express.json());
app.use(express.static(publicDir, {
  etag: false,
  lastModified: false,
  setHeaders: response => {
    response.setHeader('Cache-Control', 'no-store');
  }
}));

app.get('/', (_request: Request, response: Response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.sendFile(path.join(publicDir, 'index.html'));
});

function isSafeFilename(name: string): boolean {
  return name === path.basename(name) && !name.startsWith('.');
}

function singleParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? '' : value;
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

async function listFiles(dir: string, extension: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir))
      .filter(name => isSafeFilename(name) && name.endsWith(extension))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function nowIsoString(): string {
  return new Date().toISOString();
}

async function readDashboardSession(): Promise<DashboardSession> {
  const session = await readJson<DashboardSession>(dashboardSessionFile);
  if (session) {
    return session;
  }

  const freshSession: DashboardSession = {
    last_reset_at: nowIsoString(),
    reset_mode: 'workflow'
  };

  await writeJson(dashboardSessionFile, freshSession);
  return freshSession;
}

async function fileModifiedAfter(filePath: string, cutoffIso: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.mtime.getTime() >= new Date(cutoffIso).getTime();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function listFreshFiles(dir: string, extension: string, cutoffIso: string): Promise<string[]> {
  const files = await listFiles(dir, extension);
  const freshFiles = await Promise.all(files.map(async name => {
    const isFresh = await fileModifiedAfter(path.join(dir, name), cutoffIso);
    return isFresh ? name : null;
  }));

  return freshFiles.filter((name): name is string => name !== null);
}

async function deleteIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

async function resetRuntime(mode: ResetMode): Promise<{ mode: ResetMode; kept_env: boolean; removed_config: boolean; }> {
  const logFiles = await listFiles(logsDir, '.json');
  const inputFiles = await listFiles(inputDir, '.docx');
  const sectionFiles = await listFiles(sectionsDir, '.md');

  await Promise.all([
    ...logFiles.map(name => deleteIfExists(path.join(logsDir, name))),
    ...inputFiles.map(name => deleteIfExists(path.join(inputDir, name))),
    ...sectionFiles.map(name => deleteIfExists(path.join(sectionsDir, name))),
    ...[...topLevelOutputs].map(name => deleteIfExists(path.join(outputDir, name)))
  ]);

  let removedConfig = false;
  if (mode === 'all') {
    const modelConfigPath = path.join(configDir, 'model.json');
    removedConfig = await fileModifiedAfter(modelConfigPath, '1970-01-01T00:00:00.000Z');
    await deleteIfExists(modelConfigPath);
  }

  await writeJson(dashboardSessionFile, {
    last_reset_at: nowIsoString(),
    reset_mode: mode
  } satisfies DashboardSession);

  return {
    mode,
    kept_env: true,
    removed_config: removedConfig
  };
}

async function getStatusSnapshot(): Promise<{
  current_step: string;
  workflow_status: 'pending' | 'in_progress' | 'complete';
  next_recommended_command: string;
  next_recommended_label: string;
  completed_sections_count: number;
  total_sections_count: number;
  final_combine_status: 'pending' | 'completed';
  state: WorkflowState;
  summary: {
    model_gate: 'pending' | 'completed';
    step1_new_prompt: 'pending' | 'completed';
    step2_outline: 'pending' | 'completed';
    step2_confirm: 'pending' | 'completed';
    sections: string;
    final_combine: 'pending' | 'completed';
  };
}> {
  const session = await readDashboardSession();
  const state = await readJson<WorkflowState>(path.join(logsDir, 'workflow-state.json'))
    ?? INITIAL_WORKFLOW_STATE;

  const modelGatePassed = state.model_configured
    && state.model_test_passed
    && await fileModifiedAfter(path.join(configDir, 'model.json'), session.last_reset_at)
    && await fileModifiedAfter(path.join(logsDir, 'model-test.json'), session.last_reset_at)
    && await fileModifiedAfter(path.join(logsDir, 'workflow-state.json'), session.last_reset_at);

  const freshTenderFiles = modelGatePassed
    ? await listFreshFiles(inputDir, '.docx', session.last_reset_at)
    : [];
  const hasTenderFile = freshTenderFiles.length > 0;

  const step1Generated = modelGatePassed
    && hasTenderFile
    && state.new_prompt_generated
    && await fileModifiedAfter(path.join(outputDir, 'new-prompt.md'), session.last_reset_at)
    && await fileModifiedAfter(path.join(logsDir, 'step1-run.json'), session.last_reset_at);

  const outlineGenerated = step1Generated
    && state.outline_generated
    && await fileModifiedAfter(path.join(outputDir, 'outline.md'), session.last_reset_at)
    && await fileModifiedAfter(path.join(logsDir, 'step2-outline-run.json'), session.last_reset_at);

  let totalSections = 0;
  if (outlineGenerated) {
    const outlineLog = await readJson<{ outline?: { sections?: unknown[] } }>(
      path.join(logsDir, 'step2-outline-run.json')
    );
    totalSections = outlineLog?.outline?.sections?.length ?? 0;
  }

  const outlineConfirmed = outlineGenerated
    && state.step2_confirmed
    && state.outline_confirmed
    && await fileModifiedAfter(path.join(logsDir, 'step2-confirm-run.json'), session.last_reset_at);

  const freshSectionFiles = outlineConfirmed
    ? await listFreshFiles(sectionsDir, '.md', session.last_reset_at)
    : [];
  const completedSectionsCount = outlineConfirmed ? freshSectionFiles.length : 0;

  const finalCombined = outlineConfirmed
    && state.final_combined
    && await fileModifiedAfter(path.join(outputDir, 'final-combined.md'), session.last_reset_at);

  let currentStep = 'Workflow Complete';
  let nextRecommendedCommand = 'workflow_complete';
  let nextRecommendedLabel = 'Workflow complete';

  if (!modelGatePassed) {
    currentStep = 'Configure Model API';
    nextRecommendedCommand = 'npm run config';
    nextRecommendedLabel = 'npm run config';
  } else if (!step1Generated) {
    currentStep = hasTenderFile ? 'Run Step 1' : 'Upload Tender .docx';
    nextRecommendedCommand = 'npm run step1';
    nextRecommendedLabel = 'npm run step1';
  } else if (!outlineGenerated) {
    currentStep = 'Generate Outline';
    nextRecommendedCommand = 'npm run step2:outline';
    nextRecommendedLabel = 'npm run step2:outline';
  } else if (!outlineConfirmed) {
    currentStep = 'Confirm Outline';
    nextRecommendedCommand = 'npm run step2:confirm';
    nextRecommendedLabel = 'npm run step2:confirm';
  } else if (completedSectionsCount < totalSections) {
    currentStep = 'Write Sections';
    nextRecommendedCommand = 'npm run step2:section';
    nextRecommendedLabel = 'npm run step2:section';
  } else if (!finalCombined) {
    currentStep = 'Combine Final Document';
    nextRecommendedCommand = 'npm run final:combine';
    nextRecommendedLabel = 'npm run final:combine';
  }

  return {
    current_step: currentStep,
    workflow_status: nextRecommendedCommand === 'workflow_complete'
      ? 'complete'
      : modelGatePassed ? 'in_progress' : 'pending',
    next_recommended_command: nextRecommendedCommand,
    next_recommended_label: nextRecommendedLabel,
    completed_sections_count: modelGatePassed ? completedSectionsCount : 0,
    total_sections_count: modelGatePassed ? totalSections : 0,
    final_combine_status: finalCombined ? 'completed' : 'pending',
    state,
    summary: {
      model_gate: modelGatePassed ? 'completed' : 'pending',
      step1_new_prompt: step1Generated ? 'completed' : 'pending',
      step2_outline: outlineGenerated ? 'completed' : 'pending',
      step2_confirm: outlineConfirmed ? 'completed' : 'pending',
      sections: `${modelGatePassed ? completedSectionsCount : 0} / ${modelGatePassed ? totalSections : 0}`,
      final_combine: finalCombined ? 'completed' : 'pending'
    }
  };
}

async function runAllowedCommand(command: keyof typeof allowedCommands): Promise<{
  command: string;
  stdout: string;
  stderr: string;
}> {
  const args = allowedCommands[command];
  const result = await execFileAsync('npm', [...args], {
    cwd: projectRoot,
    timeout: 120_000,
    maxBuffer: 1024 * 1024
  });

  return {
    command: `npm ${args.join(' ')}`,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

app.get('/api/status', async (_request: Request, response: Response) => {
  try {
    response.json(await getStatusSnapshot());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unable to read status' });
  }
});

app.get('/api/model-config/status', async (_request: Request, response: Response) => {
  try {
    response.json(await getSanitizedModelConfigStatus());
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unable to read model config status' });
  }
});

app.post('/api/model-config/save-and-test', async (request: Request, response: Response) => {
  try {
    const result = await saveAndTestModelConfiguration({
      provider: String(request.body?.provider ?? ''),
      base_url: String(request.body?.base_url ?? ''),
      api_key_env: String(request.body?.api_key_env ?? ''),
      api_key_value: typeof request.body?.api_key_value === 'string'
        ? request.body.api_key_value
        : '',
      model: String(request.body?.model ?? ''),
      temperature: Number(request.body?.temperature),
      max_tokens: Number(request.body?.max_tokens),
      timeout_seconds: Number(request.body?.timeout_seconds)
    });

    response.json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Unable to save and test model configuration'
    });
  }
});

app.post('/api/reset', async (request: Request, response: Response) => {
  try {
    const mode = request.body?.mode === 'all' ? 'all' : 'workflow';
    const result = await resetRuntime(mode);

    response.json({
      success: true,
      ...result,
      message: mode === 'all'
        ? 'Runtime cleared. Model configuration file removed. .env was kept intentionally and is still never exposed.'
        : 'Runtime cleared. Existing .env and config/model.json were kept, but the dashboard now starts from model API configuration again.'
    });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Reset failed' });
  }
});

app.post('/api/upload', upload.single('tender'), async (request: Request, response: Response) => {
  try {
    if (!request.file) {
      response.status(400).json({ error: 'Please upload a .docx file using the "tender" field.' });
      return;
    }

    await fs.mkdir(inputDir, { recursive: true });

    // Preserve original filename with proper encoding
    const originalName = request.file.originalname;
    const filename = 'tender-current.docx';

    await fs.writeFile(path.join(inputDir, filename), request.file.buffer);

    response.json({
      success: true,
      filename: filename,
      display_name: originalName
    });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Upload failed' });
  }
});

app.post('/api/step1/run', async (_request: Request, response: Response) => {
  try {
    const result = await runStep1();
    response.json({
      success: result.success,
      message: result.success ? 'Step 1 completed successfully' : 'Step 1 failed',
      error: result.error
    });
  } catch (error) {
    response.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Step 1 execution failed'
    });
  }
});

app.post('/api/step2/outline', async (_request: Request, response: Response) => {
  try {
    const result = await runStep2Outline();
    response.json({
      success: result.success,
      message: result.success ? 'Step 2 outline generated successfully' : 'Step 2 outline generation failed',
      error: result.error
    });
  } catch (error) {
    response.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Step 2 outline execution failed'
    });
  }
});

app.post('/api/run/workflow', async (_request: Request, response: Response) => {
  try {
    response.json(await runAllowedCommand('workflow'));
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    response.status(500).json({ error: failure.message, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' });
  }
});

app.post('/api/run/step2-status', async (_request: Request, response: Response) => {
  try {
    response.json(await runAllowedCommand('step2:status'));
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    response.status(500).json({ error: failure.message, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' });
  }
});

app.get('/api/output', async (_request: Request, response: Response) => {
  try {
    const session = await readDashboardSession();
    const topLevel = (await Promise.all([...topLevelOutputs].map(async name => {
      return await fileModifiedAfter(path.join(outputDir, name), session.last_reset_at)
        ? name
        : null;
    }))).filter((name): name is string => name !== null);
    const sections = await listFreshFiles(sectionsDir, '.md', session.last_reset_at);
    response.json({
      files: [
        ...topLevel.map(name => ({ name, source: name })),
        ...sections.map(name => ({ name, source: `sections/${name}` }))
      ]
    });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unable to list outputs' });
  }
});

app.get('/api/output/:name', async (request: Request, response: Response) => {
  try {
    const session = await readDashboardSession();
    const name = singleParam(request.params.name);
    if (!isSafeFilename(name)) {
      response.status(404).json({ error: 'Output not found' });
      return;
    }

    let filePath: string | null = topLevelOutputs.has(name)
      && await fileModifiedAfter(path.join(outputDir, name), session.last_reset_at)
      ? path.join(outputDir, name)
      : null;
    if (!filePath && (await listFreshFiles(sectionsDir, '.md', session.last_reset_at)).includes(name)) {
      filePath = path.join(sectionsDir, name);
    }
    if (!filePath) {
      response.status(404).json({ error: 'Output not found' });
      return;
    }

    response.json({ name, content: await fs.readFile(filePath, 'utf8') });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      response.status(404).json({ error: 'Output not found' });
      return;
    }
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unable to read output' });
  }
});

app.get('/api/logs', async (_request: Request, response: Response) => {
  try {
    const session = await readDashboardSession();
    const existingLogs = await listFreshFiles(logsDir, '.json', session.last_reset_at);
    response.json({ files: existingLogs.filter(name => safeLogFiles.has(name)) });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unable to list logs' });
  }
});

app.get('/api/logs/:name', async (request: Request, response: Response) => {
  try {
    const session = await readDashboardSession();
    const name = singleParam(request.params.name);
    const existingLogs = await listFreshFiles(logsDir, '.json', session.last_reset_at);
    if (!isSafeFilename(name) || !safeLogFiles.has(name) || !existingLogs.includes(name)) {
      response.status(404).json({ error: 'Log not found' });
      return;
    }
    response.json({ name, content: await readJson<unknown>(path.join(logsDir, name)) });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unable to read log' });
  }
});

app.listen(port, '127.0.0.1', () => {
  console.log(`TB Step by Step Web UI: http://localhost:${port}`);
});
