import dotenv from 'dotenv';
dotenv.config();

import { initDb } from './persistence/db';
import { runStdioServer } from './mcp/stdioServer';
import { runHttpServer } from './mcp/httpServer';
import { logger } from './utils/logging';

const main = async () => {
  try {
    await initDb();

    const args = process.argv.slice(2);
    const transportIndex = args.indexOf('--transport');
    const transport = transportIndex !== -1 ? args[transportIndex + 1] : 'stdio';

    if (transport === 'http' || transport === 'sse') {
      await runHttpServer();
    } else {
      await runStdioServer();
    }
  } catch (error: any) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

main();
