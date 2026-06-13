import express, { Request, Response } from 'express';
import multer from 'multer';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { INITIAL_WORKFLOW_STATE, WorkflowState } from '../types/state';

const execFileAsync = promisify(execFile);
const app = express();
const port = 3000;
const projectRoot = process.cwd();
const publicDir = path.join(projectRoot, 'src', 'web', 'public');
const inputDir = path.join(projectRoot, 'input');
const outputDir = path.join(projectRoot, 'output');
const sectionsDir = path.join(outputDir, 'sections');
const logsDir = path.join(projectRoot, 'logs');

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    callback(null, path.extname(file.originalname).toLowerCase() === '.docx');
  }
});

app.use(express.json());
app.use(express.static(publicDir));

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

function nextCommand(state: WorkflowState, totalSections: number): string {
  if (!state.model_test_passed) return 'npm run config';
  if (!state.new_prompt_generated) return 'npm run step1';
  if (!state.outline_generated) return 'npm run step2:outline';
  if (!state.outline_confirmed) return 'npm run step2:confirm';
  if (state.completed_sections.length < totalSections) return 'npm run step2:section';
  if (!state.final_combined) return 'npm run final:combine';
  return 'workflow_complete';
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
    const state = await readJson<WorkflowState>(path.join(logsDir, 'workflow-state.json'))
      ?? INITIAL_WORKFLOW_STATE;
    const outlineLog = await readJson<{ outline?: { sections?: unknown[] } }>(
      path.join(logsDir, 'step2-outline-run.json')
    );
    const totalSections = outlineLog?.outline?.sections?.length ?? 0;
    const recommendedCommand = nextCommand(state, totalSections);

    response.json({
      workflow_status: recommendedCommand === 'workflow_complete' ? 'complete' : 'in_progress',
      next_recommended_command: recommendedCommand,
      completed_sections_count: state.completed_sections.length,
      total_sections_count: totalSections,
      final_combine_status: state.final_combined ? 'completed' : 'pending',
      state
    });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unable to read status' });
  }
});

app.post('/api/upload', upload.single('tender'), async (request: Request, response: Response) => {
  try {
    if (!request.file) {
      response.status(400).json({ error: 'Please upload a .docx file using the "tender" field.' });
      return;
    }

    await fs.mkdir(inputDir, { recursive: true });
    const filename = path.basename(request.file.originalname);
    await fs.writeFile(path.join(inputDir, filename), request.file.buffer);
    response.json({ success: true, filename });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Upload failed' });
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
    const topLevel = (await Promise.all([...topLevelOutputs].map(async name => {
      try {
        await fs.access(path.join(outputDir, name));
        return name;
      } catch {
        return null;
      }
    }))).filter((name): name is string => name !== null);
    const sections = await listFiles(sectionsDir, '.md');
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
    const name = singleParam(request.params.name);
    if (!isSafeFilename(name)) {
      response.status(404).json({ error: 'Output not found' });
      return;
    }

    let filePath: string | null = topLevelOutputs.has(name) ? path.join(outputDir, name) : null;
    if (!filePath && (await listFiles(sectionsDir, '.md')).includes(name)) {
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
    const existingLogs = await listFiles(logsDir, '.json');
    response.json({ files: existingLogs.filter(name => safeLogFiles.has(name)) });
  } catch (error) {
    response.status(500).json({ error: error instanceof Error ? error.message : 'Unable to list logs' });
  }
});

app.get('/api/logs/:name', async (request: Request, response: Response) => {
  try {
    const name = singleParam(request.params.name);
    const existingLogs = await listFiles(logsDir, '.json');
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
