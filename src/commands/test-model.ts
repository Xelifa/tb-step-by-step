import { logger } from '../utils/logger';
import { loadEnvFile } from '../utils/env';
import { readJSONFile } from '../utils/file';
import { ModelConfig } from '../types/config';
import { runModelGateTest } from '../core/model-gate';
import { isModelGatePassed } from '../core/state-manager';

async function testModelCommand() {
  try {
    await loadEnvFile();

    logger.section('Model Connection Test');

    // Check if config exists
    const config = await readJSONFile<ModelConfig>('config/model.json');

    if (!config) {
      logger.error('No model configuration found');
      logger.info('Please run: npm run config');
      process.exit(1);
    }

    logger.info(`Provider: ${config.provider}`);
    logger.info(`Model: ${config.model}`);
    logger.info(`Base URL: ${config.base_url}`);
    logger.info(`API Key Env: ${config.api_key_env}`);
    logger.info('');

    // Run test
    const result = await runModelGateTest(config);

    if (result.success) {
      const gatePassed = await isModelGatePassed();

      if (gatePassed) {
        logger.success('Model gate unlocked ✓');
        logger.info('Workflow can proceed to next steps');
      }
    } else {
      logger.info('Please reconfigure: npm run config');
      process.exit(1);
    }

  } catch (error) {
    logger.error('Test failed');
    logger.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

testModelCommand();