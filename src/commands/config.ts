import { logger } from '../utils/logger';
import { loadEnvFile } from '../utils/env';
import { runConfigurationFlow } from '../core/configure';

async function configCommand() {
  try {
    await loadEnvFile();

    logger.section('Model Configuration');

    await runConfigurationFlow();

  } catch (error) {
    logger.error('Configuration failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

configCommand();