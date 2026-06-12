import { logger } from '../utils/logger';
import { runStep2Section } from '../core/step2-section-runner';

async function step2SectionCommand() {
  try {
    logger.section('Step 2: Single Section Writing');

    await runStep2Section();

  } catch (error) {
    logger.error('Step 2 section generation failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

step2SectionCommand();
