import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setupToolRegistry } from './toolRegistry';
import express from 'express';
import { approvalRoutes } from '../web/approvalRoutes';
import { getAuthUrl, getOAuthClient } from '../auth/googleOAuth';
import { saveTokens, createAccount } from '../auth/tokenStore';
import { google } from 'googleapis';

export const runStdioServer = async () => {
  // Start the background Express app for approvals and OAuth
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.use('/approve', approvalRoutes);

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

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    // Only log to stderr since stdout is used for MCP messages in stdio mode
    console.error(`Approval and OAuth server listening on port ${port}`);
    console.error(`Go to http://localhost:${port}/login to authenticate`);
  });

  // Start the MCP Stdio server
  const server = new Server(
    {
      name: 'google-workspace-mcp',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  setupToolRegistry(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP stdio server running');
};
