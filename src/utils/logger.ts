export const logger = {
  info: (message: string) => {
    console.log(`[INFO] ${message}`);
  },

  success: (message: string) => {
    console.log(`[SUCCESS] ${message}`);
  },

  error: (message: string) => {
    console.error(`[ERROR] ${message}`);
  },

  warn: (message: string) => {
    console.warn(`[WARN] ${message}`);
  },

  section: (title: string) => {
    console.log('\n' + '='.repeat(50));
    console.log(title);
    console.log('='.repeat(50) + '\n');
  }
};
