# Google Workspace MCP Server

This is an MCP (Model Context Protocol) server that integrates with Google Workspace to:
1. Send emails via Gmail
2. Append text to Google Docs

## Features
- Discovers and calls tools via the MCP protocol.
- Local `stdio` mode and remote Streamable `HTTP/SSE` mode.
- Uses Google OAuth 2.0 with persistent secure token storage.
- Prevents duplicates via idempotency keys.
- **Server-verifiable human approval workflow** to protect all side-effecting actions.

## Prerequisites
- Node.js LTS (e.g. v20+)
- A Google Cloud Project with:
  - Gmail API enabled
  - Google Docs API enabled
  - OAuth Consent Screen configured
  - Web Application OAuth 2.0 Client credentials (with redirect URI pointing to `http://localhost:3000/oauth2callback` for local development).

## Setup
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```
   Fill in your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the `.env` file.

3. Compile the project:
   ```bash
   npx tsc
   ```

## Authentication
Before using the MCP tools, you must authenticate your Google Account:
1. Start the server (either stdio or http). In stdio mode, it still starts an HTTP server for the OAuth flow.
2. Open a browser and navigate to: `http://localhost:3000/login`
3. Complete the Google OAuth consent flow. You should see a success message.

## Running in stdio Mode (for Claude Desktop / Antigravity)

Configure your client to spawn the server:

**Example for Claude / Antigravity config:**
```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/google-workspace-mcp/dist/index.js", "--transport", "stdio"],
      "env": {
        "APP_ENV": "local",
        "PORT": "3000"
      }
    }
  }
}
```
*Note: Make sure to replace `/ABSOLUTE/PATH/TO/` with the actual path.*

## Running in HTTP/SSE Mode

Start the server:
```bash
node dist/index.js --transport http
```
The SSE endpoint will be available at `http://localhost:3000/sse`.

## Tools Available
- `google_connection_status`: Check Google authentication status.
- `gmail_preview_email`: Validates email fields and generates an approval link.
- `gmail_send_email`: Sends the approved email using the action ID and idempotency key.
- `docs_get_document_info`: Fetches metadata (like tab info) for a Google Doc.
- `docs_preview_append`: Previews the text to append and generates an approval link.
- `docs_append_text`: Appends the approved text to the document using the action ID and idempotency key.

## Security
- Tokens and approvals are stored in an SQLite database located in `data/mcp.sqlite`.
- Side effects (sending, appending) are impossible without explicit user approval via the `approval_url`.

## Cloud Deployment (Render)
For instructions on deploying this MCP server to Render as a remote Streamable HTTP/SSE service with persistent storage, see [deployment.md](deployment.md) and [render.yaml](render.yaml).
