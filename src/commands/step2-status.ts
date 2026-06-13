import { logger } from '../utils/logger';
import { runStep2Status } from '../core/step2-status-runner';

async function step2StatusCommand() {
  try {
    logger.section('Step 2: Section Status Check');

    await runStep2Status();

  } catch (error) {
    logger.error('Step 2 status check failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

step2StatusCommand();