import { logger } from '../utils/logger';
import { runStep2Confirm } from '../core/step2-confirm-runner';

async function step2ConfirmCommand() {
  try {
    logger.section('Step 2: Outline Confirmation');

    await runStep2Confirm();

  } catch (error) {
    logger.error('Step 2 confirmation failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

step2ConfirmCommand();