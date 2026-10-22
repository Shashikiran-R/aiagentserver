export const logger = {
  info: (message: string, meta?: any) => {
    console.error(`[INFO] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  warn: (message: string, meta?: any) => {
    console.error(`[WARN] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  error: (message: string, meta?: any) => {
    console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta) : '');
  },
  debug: (message: string, meta?: any) => {
    if (process.env.APP_ENV === 'local' || process.env.DEBUG) {
      console.error(`[DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }
};
