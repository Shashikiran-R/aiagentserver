import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { setupToolRegistry } from './toolRegistry';
import express from 'express';
import { approvalRoutes } from '../web/approvalRoutes';
import { getAuthUrl, getOAuthClient } from '../auth/googleOAuth';
import { saveTokens, createAccount } from '../auth/tokenStore';
import { google } from 'googleapis';

export const runHttpServer = async () => {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  // Increase payload limit for MCP messages
  app.use(express.json({ limit: '10mb' }));

  app.use('/approve', approvalRoutes);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/login', (req, res) => {
    const url = getAuthUrl('default');
    res.redirect(url);
  });

  app.get('/oauth2callback', async (req, res) => {
    const { code, state } = req.query;
    try {
      const oauth2Client = getOAuthClient();
      const { tokens } = await oauth2Client.getToken(code as string);
      
      const accountId = (state as string) || 'default';
      
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      
      if (userInfo.data.email) {
        await createAccount(accountId, userInfo.data.email);
      }
      await saveTokens(accountId, tokens);
      
      res.send('<h2>Successfully connected to Google Workspace! You can close this window.</h2>');
    } catch (err: any) {
      res.status(500).send(`<h2>OAuth Error: ${err.message}</h2>`);
    }
  });

  // MCP SSE endpoints
  const server = new Server(
    { name: 'google-workspace-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  setupToolRegistry(server);

  const transports = new Map<string, SSEServerTransport>();

  app.get('/sse', async (req, res) => {
    // Basic Bearer token auth check for MVP
    const authHeader = req.headers.authorization;
    if (process.env.MCP_AUTH_TOKEN && authHeader !== `Bearer ${process.env.MCP_AUTH_TOKEN}`) {
      res.status(401).send('Unauthorized');
      return;
    }

    const transport = new SSEServerTransport('/messages', res);
    transports.set(transport.sessionId, transport);
    transport.onclose = () => {
      transports.delete(transport.sessionId);
    };
    await server.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (process.env.MCP_AUTH_TOKEN && authHeader !== `Bearer ${process.env.MCP_AUTH_TOKEN}`) {
      res.status(401).send('Unauthorized');
      return;
    }

    const sessionId = req.query.sessionId as string;
    const transport = sessionId ? transports.get(sessionId) : transports.values().next().value;
    if (transport) {
      await transport.handlePostMessage(req, res, req.body);
    } else {
      res.status(400).send('Session not found or SSE connection not established');
    }
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`MCP HTTP/SSE server running on port ${port}`);
    console.log(`SSE endpoint at http://localhost:${port}/sse`);
    console.log(`Go to http://localhost:${port}/login to authenticate with Google`);
  });
};
