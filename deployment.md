# Deployment Guide: Google Workspace MCP Server on Render

This guide provides step-by-step instructions for deploying the **Google Workspace MCP Server** as a remote, Streamable HTTP/SSE MCP service on [Render](https://render.com).

---

## 1. Architecture Overview on Render

When deployed on Render, the server runs in **remote HTTP/SSE mode**:
- **MCP Client Transport**: Clients connect over HTTPS to `https://<your-service>.onrender.com/sse` and post messages to `/messages`.
- **MCP Authorization**: Requests are protected by a shared secret Bearer token (`MCP_AUTH_TOKEN`).
- **Human Approval Workflow**: Pending action previews and approvals are served via HTTPS at `https://<your-service>.onrender.com/approve/<action_id>`.
- **OAuth Callback**: Google OAuth redirects to `https://<your-service>.onrender.com/oauth2callback`.
- **Durable Storage**: Google account tokens and operation ledgers are stored in SQLite backed by a Render **Persistent Disk** (persisting across restarts and redeploys).

---

## 2. Prerequisites

1. A [Render Account](https://dashboard.render.com).
2. A GitHub or GitLab repository containing this MCP server codebase.
3. Access to your [Google Cloud Console](https://console.cloud.google.com) to update OAuth Redirect URIs.

---

## 3. Configure Google Cloud Console

Before or immediately after deploying, you must register your Render service URL in Google Cloud:

1. Go to the [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials).
2. Select your OAuth 2.0 Client ID for this application.
3. Under **Authorized JavaScript origins**, add:
   ```text
   https://<your-service-name>.onrender.com
   ```
4. Under **Authorized redirect URIs**, add:
   ```text
   https://<your-service-name>.onrender.com/oauth2callback
   ```
5. Click **Save**.

> [!TIP]
> If you don't know your exact Render subdomain yet, deploy the service first, copy the assigned `.onrender.com` URL, and then add it to Google Cloud Console.

---

## 4. Deployment Methods

### Option A: Using Render Blueprints (`render.yaml`) — Recommended

This repository includes a [`render.yaml`](file:///Users/shashikiran/Desktop/mcpserver/render.yaml) file for infrastructure-as-code deployment:

1. Push this repository to your GitHub/GitLab account.
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** > **Blueprint**.
3. Select your repository. Render will automatically parse `render.yaml`.
4. Fill in the required environment variables:
   - `BASE_URL`: `https://<your-service-name>.onrender.com`
   - `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID
   - `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret
   - `GOOGLE_REDIRECT_URI`: `https://<your-service-name>.onrender.com/oauth2callback`
5. Click **Apply**. Render will build and deploy the service along with the persistent disk.

---

### Option B: Manual Web Service Setup

If you prefer to configure the service manually via the Render UI:

1. Go to the [Render Dashboard](https://dashboard.render.com) and click **New +** > **Web Service**.
2. Connect your Git repository.
3. Configure the settings:
   - **Name**: `google-workspace-mcp` (or any unique name)
   - **Language / Runtime**: `Node`
   - **Region**: Choose the region closest to you (e.g., `Oregon`, `Frankfurt`)
   - **Branch**: `main` (or your active branch)
   - **Build Command**:
     ```bash
     npm install && npm run build
     ```
   - **Start Command**:
     ```bash
     npm run start:http
     ```
   - **Instance Type**: **Starter** (recommended so you can attach a persistent disk for SQLite)

4. **Attach a Persistent Disk** (Under the *Disks* tab):
   - **Disk Name**: `mcp-data`
   - **Mount Path**: `/var/data`
   - **Size**: `1 GB`

5. **Health Check Path** (Under *Advanced* settings):
   - Set to `/health`

---

## 5. Environment Variables Reference

Configure the following environment variables in your Render service dashboard under the **Environment** tab:

| Variable | Description | Example / Recommended Value |
|---|---|---|
| `APP_ENV` | Application environment mode | `production` |
| `PORT` | Listening port | *Render sets this automatically (default `10000`)* |
| `BASE_URL` | Public HTTPS base URL of your Render service | `https://google-workspace-mcp.onrender.com` |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Web Client ID from Google Cloud | `18150...apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Web Client Secret from Google Cloud | `GOCSPX-...` |
| `GOOGLE_REDIRECT_URI` | Full OAuth callback URL | `https://google-workspace-mcp.onrender.com/oauth2callback` |
| `MCP_AUTH_TOKEN` | Secret Bearer token required for MCP clients | Generate with `openssl rand -hex 24` |
| `DB_PATH` | Path to persistent SQLite database | `/var/data/mcp.sqlite` (matches disk mount path) |

---

## 6. Post-Deployment Verification

### Step 1: Check Service Health
Once Render finishes deploying, visit:
```text
https://<your-service-name>.onrender.com/health
```
You should receive a `200 OK` response:
```json
{
  "status": "ok",
  "timestamp": "2026-10-22T14:40:00.000Z"
}
```

### Step 2: Complete Google Workspace Authorization
Authenticate your Google Account with the production service:
1. Navigate to:
   ```text
   https://<your-service-name>.onrender.com/login
   ```
2. You will be redirected to Google's consent screen. Select your Google account and grant the requested Gmail and Docs permissions.
3. Upon completion, you will see:
   > **Successfully connected to Google Workspace! You can close this window.**
4. The access and refresh tokens are securely stored in `/var/data/mcp.sqlite` on your persistent disk.

---

## 7. Connecting AI Clients to Remote MCP Server

Once deployed, connect your MCP-compatible clients using the HTTPS Streamable HTTP/SSE endpoint.

### Remote SSE Endpoint URL:
```text
https://<your-service-name>.onrender.com/sse
```

### Authorization Header:
```text
Authorization: Bearer <YOUR_MCP_AUTH_TOKEN>
```

### Antigravity Remote Config (`mcp_config.json`):
```json
{
  "mcpServers": {
    "google-workspace-remote": {
      "serverUrl": "https://<your-service-name>.onrender.com/sse",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_AUTH_TOKEN"
      }
    }
  }
}
```

### Claude / Custom Agents / Curl Verification:
You can verify tool discovery using curl:
```bash
curl -H "Authorization: Bearer YOUR_MCP_AUTH_TOKEN" \
     https://<your-service-name>.onrender.com/sse
```

---

## 8. Security & Best Practices on Render

1. **Persistent Disk Importance**:
   - Render's ephemeral filesystem resets on every redeployment. Without a persistent disk mounted at `/var/data`, your SQLite tokens and operation ledger would be wiped when the service restarts.
2. **Bearer Token Protection**:
   - Always set `MCP_AUTH_TOKEN`. Any request to `/sse` or `/messages` without `Authorization: Bearer <token>` is rejected with `401 Unauthorized`.
3. **Approval Security**:
   - The approval link generated by `gmail_preview_email` and `docs_preview_append` uses the secure `BASE_URL` (`https://<your-service-name>.onrender.com/approve/<action_id>`), ensuring review and approval happen over HTTPS.
4. **Render Free Tier vs. Paid Tier**:
   - Free instances spin down after 15 minutes of inactivity and do not support persistent disks.
   - For a persistent MCP server storing tokens and active operation records, the **Starter** plan ($7/month) with a 1 GB disk ($0.25/month) is strongly recommended.
