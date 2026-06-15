import { OutlineSection } from '../types/step2';
import { generateSectionByFilename, getAvailableSections } from './web-section-runner';
import { writeJSONFile, readJSONFile } from '../utils/file';
import { logger } from '../utils/logger';

export interface BatchGenerationProgress {
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

const BATCH_PROGRESS_FILE = 'logs/batch-generation-progress.json';

const INITIAL_PROGRESS: BatchGenerationProgress = {
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

/**
 * Get current batch generation progress
 */
export async function getBatchGenerationProgress(): Promise<BatchGenerationProgress> {
  const progress = await readJSONFile<BatchGenerationProgress>(BATCH_PROGRESS_FILE);
  return progress || INITIAL_PROGRESS;
}

/**
 * Reset batch generation progress
 */
async function resetBatchProgress(): Promise<void> {
  await writeJSONFile(BATCH_PROGRESS_FILE, INITIAL_PROGRESS);
}

/**
 * Update batch generation progress
 */
async function updateBatchProgress(updates: Partial<BatchGenerationProgress>): Promise<void> {
  const current = await getBatchGenerationProgress();
  await writeJSONFile(BATCH_PROGRESS_FILE, { ...current, ...updates });
}

/**
 * Start batch generation in background
 */
export async function startBatchGeneration(): Promise<{ success: boolean; message: string }> {
  try {
    // Check if already running
    const currentProgress = await getBatchGenerationProgress();
    if (currentProgress.status === 'running') {
      return {
        success: false,
        message: 'Batch generation already in progress'
      };
    }

    // Get all available sections
    const availableSections = await getAvailableSections();

    if (availableSections.length === 0) {
      return {
        success: false,
        message: 'No sections available to generate'
      };
    }

    // Reset progress
    const startTime = new Date().toISOString();
    await updateBatchProgress({
      status: 'running',
      total: availableSections.length,
      completed: 0,
      current_section: null,
      current_filename: null,
      failed_at: null,
      error: null,
      started_at: startTime,
      finished_at: null,
      generated_files: []
    });

    // Start background generation (fire and forget)
    generateAllSectionsBackground(availableSections).catch(async (error) => {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Batch generation failed: ${errorMsg}`);
      await updateBatchProgress({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: errorMsg
      });
    });

    return {
      success: true,
      message: `Batch generation started for ${availableSections.length} sections`
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to start batch generation';
    logger.error(`Failed to start batch generation: ${errorMsg}`);
    return {
      success: false,
      message: errorMsg
    };
  }
}

/**
 * Background task to generate all sections sequentially
 */
async function generateAllSectionsBackground(sections: OutlineSection[]): Promise<void> {
  const generatedFiles: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    // Update current progress
    await updateBatchProgress({
      current_section: section.title,
      current_filename: section.output_filename
    });

    logger.info(`Generating section ${i + 1}/${sections.length}: ${section.title}`);

    try {
      // Generate this section using existing logic
      const result = await generateSectionByFilename(section.output_filename);

      if (!result.success) {
        throw new Error(result.error || 'Generation failed');
      }

      generatedFiles.push(result.output_file);

      // Update completed count
      await updateBatchProgress({
        completed: i + 1,
        generated_files: generatedFiles
      });

      logger.success(`Completed ${i + 1}/${sections.length}: ${section.title}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to generate section: ${section.title} - ${errorMsg}`);

      // Mark as failed
      await updateBatchProgress({
        status: 'failed',
        failed_at: section.title,
        finished_at: new Date().toISOString(),
        error: errorMsg,
        generated_files: generatedFiles
      });

      throw error;
    }
  }

  // All completed
  await updateBatchProgress({
    status: 'completed',
    current_section: null,
    current_filename: null,
    finished_at: new Date().toISOString(),
    generated_files: generatedFiles
  });

  logger.success(`Batch generation completed: ${generatedFiles.length} sections`);
}

/**
 * Stop batch generation (for future use)
 */
export async function stopBatchGeneration(): Promise<{ success: boolean; message: string }> {
  const progress = await getBatchGenerationProgress();

  if (progress.status !== 'running') {
    return {
      success: false,
      message: 'No batch generation in progress'
    };
  }

  // Mark as stopped
  await updateBatchProgress({
    status: 'failed',
    finished_at: new Date().toISOString(),
    error: 'Stopped by user'
  });

  return {
    success: true,
    message: 'Batch generation stopped'
  };
}
