import { OutlineSection } from '../types/step2';
import { generateSectionByFilename, getAvailableSections } from './web-section-runner';
import { writeJSONFile, readJSONFile } from '../utils/file';
import { logger } from '../utils/logger';

export interface SelectedGenerationProgress {
  status: 'idle' | 'running' | 'completed' | 'failed';
  total: number;
  completed: number;
  current_section: string | null;
  current_filename: string | null;
  failed_at: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  generated_files: string[];
}

const SELECTED_PROGRESS_FILE = 'logs/selected-generation-progress.json';

const INITIAL_PROGRESS: SelectedGenerationProgress = {
  status: 'idle',
  total: 0,
  completed: 0,
  current_section: null,
  current_filename: null,
  failed_at: null,
  error: null,
  started_at: null,
  finished_at: null,
  generated_files: []
};

export async function getSelectedGenerationProgress(): Promise<SelectedGenerationProgress> {
  const progress = await readJSONFile<SelectedGenerationProgress>(SELECTED_PROGRESS_FILE);
  return progress || INITIAL_PROGRESS;
}

async function updateSelectedProgress(updates: Partial<SelectedGenerationProgress>): Promise<void> {
  const current = await getSelectedGenerationProgress();
  await writeJSONFile(SELECTED_PROGRESS_FILE, { ...current, ...updates });
}

export async function startSelectedGeneration(filenames: string[]): Promise<{ success: boolean; message: string }> {
  try {
    if (!Array.isArray(filenames) || filenames.length === 0) {
      return { success: false, message: 'No sections selected' };
    }

    const currentProgress = await getSelectedGenerationProgress();
    if (currentProgress.status === 'running') {
      return { success: false, message: 'Selected generation already in progress' };
    }

    const available = await getAvailableSections();
    const availableByName = new Map(available.map(s => [s.output_filename, s]));

    // Preserve outline order, only include sections that are available and selected
    const ordered = available
      .filter(s => filenames.includes(s.output_filename))
      .sort((a, b) => a.level - b.level || available.indexOf(a) - available.indexOf(b));

    // Re-sort by outline order using original index
    const originalIndex = new Map(available.map((s, i) => [s.output_filename, i]));
    ordered.sort((a, b) => (originalIndex.get(a.output_filename) ?? 0) - (originalIndex.get(b.output_filename) ?? 0));

    if (ordered.length === 0) {
      return { success: false, message: 'No valid selected sections (all already completed or not found)' };
    }

    await updateSelectedProgress({
      status: 'running',
      total: ordered.length,
      completed: 0,
      current_section: null,
      current_filename: null,
      failed_at: null,
      error: null,
      started_at: new Date().toISOString(),
      finished_at: null,
      generated_files: []
    });

    generateSelectedBackground(ordered).catch(async (error) => {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Selected generation failed: ${errorMsg}`);
      await updateSelectedProgress({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: errorMsg
      });
    });

    return {
      success: true,
      message: `Selected generation started for ${ordered.length} sections`
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to start selected generation';
    logger.error(`Failed to start selected generation: ${errorMsg}`);
    return { success: false, message: errorMsg };
  }
}

async function generateSelectedBackground(sections: OutlineSection[]): Promise<void> {
  const generatedFiles: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    await updateSelectedProgress({
      current_section: section.title,
      current_filename: section.output_filename
    });

    logger.info(`Selected generation ${i + 1}/${sections.length}: ${section.title}`);

    try {
      const result = await generateSectionByFilename(section.output_filename);

      if (!result.success) {
        throw new Error(result.error || 'Generation failed');
      }

      generatedFiles.push(result.output_file);

      await updateSelectedProgress({
        completed: i + 1,
        generated_files: generatedFiles
      });

      logger.success(`Completed ${i + 1}/${sections.length}: ${section.title}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to generate section: ${section.title} - ${errorMsg}`);

      await updateSelectedProgress({
        status: 'failed',
        failed_at: section.title,
        finished_at: new Date().toISOString(),
        error: errorMsg,
        generated_files: generatedFiles
      });

      throw error;
    }
  }

  await updateSelectedProgress({
    status: 'completed',
    current_section: null,
    current_filename: null,
    finished_at: new Date().toISOString(),
    generated_files: generatedFiles
  });

  logger.success(`Selected generation completed: ${generatedFiles.length} sections`);
}
