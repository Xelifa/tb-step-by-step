import { logger } from '../utils/logger';
import { runFinalCombine } from '../core/final-combine-runner';

async function finalCombineCommand() {
  try {
    logger.section('Final Document Combination');

    await runFinalCombine();

  } catch (error) {
    logger.error('Final combination failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

finalCombineCommand();
