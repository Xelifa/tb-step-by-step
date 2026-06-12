import { logger } from './utils/logger';
import { loadEnvFile } from './utils/env';
import { isModelGatePassed } from './core/state-manager';
import { runConfigurationFlow } from './core/configure';

async function main() {
  try {
    // Load .env file if exists
    await loadEnvFile();

    logger.section('TB Step by Step Workflow');

    // Check if model gate has passed
    const gatePassed = await isModelGatePassed();

    if (!gatePassed) {
      logger.info('Model configuration required before workflow can proceed');
      logger.info('Launching model configuration...\n');

      // Automatically launch configuration
      await runConfigurationFlow();
    } else {
      logger.success('Model gate passed ✓');
      logger.info('Configuration valid. Workflow ready to proceed.');
      logger.info('');
      logger.info('Step 1 is not implemented yet.');
      logger.info('The model gate is ready for the next development stage.');
      logger.info('');
      logger.info('To reconfigure model:');
      logger.info('  Run: npm run config');
    }

  } catch (error) {
    logger.error('Workflow initialization failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();