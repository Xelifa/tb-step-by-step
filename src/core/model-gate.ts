import { ModelConfig } from '../types/config';
import { ProviderTestResult } from '../types/provider';
import { testModelConnection } from './tester';
import { markModelTestPassed, markModelTestFailed } from './state-manager';
import { writeJSONFile } from '../utils/file';
import { logger } from '../utils/logger';

// Centralized model gate test logic
// Used by both npm run config and npm run test:model
export async function runModelGateTest(
  config: ModelConfig
): Promise<ProviderTestResult> {
  logger.info('Testing model connection...');

  // Run real API test
  const result = await testModelConnection(config);

  // Save test result
  await writeJSONFile('logs/model-test.json', result);

  // Update workflow state
  if (result.success) {
    await markModelTestPassed();
    logger.success('Model test passed ✓');
    logger.info(`Response validation passed: ${result.response_validation_passed}`);
  } else {
    await markModelTestFailed();
    logger.error('Model test failed ✗');
    if (result.error) {
      logger.error(`Error: ${result.error}`);
    }
  }

  return result;
}