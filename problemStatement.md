# Problem Statement: Provider-Agnostic Google Workspace MCP Server

**Project name:** `google-workspace-mcp`  
**Document type:** Problem statement + implementation requirements  
**Version:** 1.0  
**Date:** 2026-10-10  
**Intended build environment:** Google Antigravity  
**Runtime consumers:** Any compatible MCP client, including supported configurations of ChatGPT, Claude, Gemini, Antigravity, and custom agents  
**Status:** Ready for implementation

---

## 1. Problem Statement

AI agents are increasingly used to draft communications and maintain project documentation, but agents often require provider-specific connectors or application-specific integrations to perform basic Google Workspace actions. An integration created only for one AI assistant cannot be easily reused by other agents.

We need to build a **standalone Model Context Protocol (MCP) server** that allows an authorized user to:

1. **Send an email from their Gmail account** to specified recipients.
2. **Append content to an existing Google Doc** without deleting or replacing its current content.

The server will be **developed using Google Antigravity**, but must **not depend on Antigravity, Gemini, or any particular model or AI host at runtime**. Its tools must be discoverable and callable through the open MCP standard. The same running server implementation should be usable from different compatible MCP clients with no changes to the underlying Gmail or Docs business logic.

Because email delivery and document modification are external side effects, the server must authenticate the actual user, request appropriate Google permissions, show an action preview, obtain **server-verifiable human approval**, and prevent accidental duplicate actions.

### Target outcome

A user can connect an eligible AI agent to the MCP server and say:

> Send an email to alex@example.com with subject "Project Update" and body "The specification is ready."

or

> Append the following meeting notes to this existing Google Doc: https://docs.google.com/document/d/DOCUMENT_ID/edit

The agent should discover the appropriate MCP tool, supply structured parameters, present an approval link or equivalent confirmation, and receive a clear success or failure result. The user must not need to change server code when switching AI clients.

## 2. Goals and Non-Goals

### 2.1 Primary goals (MVP)

- Deliver a standards-based MCP server exposing Gmail send and Google Docs append capabilities.
- Support **local `stdio`** execution and **remote Streamable HTTP** using a shared tool/service implementation.
- Authenticate users with Google OAuth 2.0 and operate only on authorized accounts/documents.
- Use narrowly scoped Google permissions appropriate to the chosen Docs access model.
- Provide understandable tool schemas, structured responses, predictable errors, and audit events.
- Require an actual user approval before committing either side-effecting action.
- Support safe retry behavior, including duplicate-request detection and handling uncertain outcomes.
- Provide setup documentation, automated tests, and working MCP client configuration examples.

### 2.2 Non-goals (MVP)

- Reading, searching, deleting, forwarding, or replying to existing Gmail messages.
- Creating drafts, attachments, bulk/mass email delivery, scheduled email, or contact management.
- Creating new Docs, replacing existing text, arbitrary text formatting, comments, or deleting Docs.
- Support for Google Sheets, Calendar, Drive file search, or other third-party providers.
- Unattended autonomous sending or document updates without an explicit approval policy.
- A separate proprietary ChatGPT/Claude/Gemini plugin API; MCP is the integration contract.

Optional features can be planned after the MVP succeeds and must not delay these two core functions.

## 3. Users and Use Cases

| User / system | Need | Expected outcome |
|---|---|---|
| Individual using ChatGPT | Send a project update by email | Approved email sent from connected Gmail account |
| Individual using Claude | Append notes to an existing Google Doc | Notes added at the end of a selected tab; previous content preserved |
| Individual using Gemini/Antigravity | Use the same actions from another agent | Identical tool inputs and outputs, no vendor-specific implementation |
| Custom MCP client | Discover and call tools programmatically | `tools/list` and `tools/call` work over supported transports |
| Server owner/administrator | Manage authorization, errors, and misuse | Revocation, logs, configurable limits, and no cross-user data access |

### 3.1 Core user flows

**Flow A: Gmail**

1. User connects the MCP server to an MCP client and completes necessary authentication.
2. User asks the agent to send a specific email.
3. Agent calls `gmail_preview_email` with recipients, subject, and content.
4. Server validates the input and stores a short-lived pending action tied to the Google account, MCP caller, and exact message payload.
5. Server returns a preview and an approval URL; the user reviews and approves it in a server-owned, authenticated approval screen.
6. Agent calls `gmail_send_email` with the action ID and idempotency key.
7. Server verifies the approval, sends the email once through the Gmail API, and returns the Gmail message ID and status.

**Flow B: Google Docs**

1. User provides an existing Google Docs URL or document ID and text to append.
2. Agent calls `docs_get_document_info` if tab selection is needed, then `docs_preview_append`.
3. Server validates document access, resolves the destination tab, reads the current document revision, and prepares an append-only preview.
4. User approves the exact text and destination through the server-owned approval screen.
5. Agent calls `docs_append_text` with the action ID and idempotency key.
6. Server confirms authorization and revision validity, appends content using the Docs API, and returns the document link and result.

**Important:** An AI tool call or an agent-generated text message must **not** count as human approval. Approval must be independently verifiable by the server. Where a host supports a trustworthy explicit confirmation mechanism, it may be integrated, but no host-specific confirmation capability is assumed.

## 4. Architecture and Independence from AI Providers

```text
+---------------------------------------------------------------+
| MCP CLIENTS                                                    |
| ChatGPT* | Claude* | Gemini/Antigravity* | Custom MCP client    |
+---------------------------+-----------------------------------+
                            |
                  Standard MCP JSON-RPC
                (stdio or Streamable HTTP)
                            |
+---------------------------v-----------------------------------+
| GOOGLE WORKSPACE MCP SERVER                                   |
|                                                               |
| MCP transport + tools/list + tools/call                       |
| Input validation | authn/authz | approval workflow            |
| Idempotency + operation ledger | logging + audit             |
|                                                               |
|   +---------------------+  +------------------------------+   |
|   | Gmail service       |  | Google Docs service          |   |
|   +----------+----------+  +--------------+---------------+   |
+--------------|----------------------------|-------------------+
               |                            |
               v                            v
         Gmail REST API                Google Docs REST API
                 \                      /
                  Google OAuth 2.0 tokens
```

`*` Client availability, remote MCP support, tool approvals, and custom server setup depend on that client's product, plan, and configuration. The server must be protocol-portable; this does not guarantee every product can connect in every environment.

### 4.1 Transport strategy

- **Local mode:** `stdio`, launched as a child process by the client. Log only to stderr; stdout must contain only MCP messages.
- **Remote mode:** Streamable HTTP, e.g. `https://mcp.example.com/mcp`, protected by HTTPS and MCP-compliant authorization.
- **Shared implementation:** Transports call the same tool registry and service layer. Do not duplicate business logic across transports.
- **Protocol:** Implement with a maintained official or well-supported MCP SDK rather than handcrafting protocol messages. Target the current MCP specification (**2026-07-28** at the time of this document); test backward compatibility with common clients implementing **2025-11-25** or earlier compatible versions. Follow the SDK's supported version-negotiation behavior; do not assume old session headers or initialization behavior apply to the latest protocol.
- **Client-neutral design:** Do not check whether the caller is ChatGPT, Claude, or Gemini to determine business functionality. Apply the same security and validation to all clients.

### 4.2 Suggested implementation stack

| Layer | Preferred approach |
|---|---|
| Language | TypeScript on a maintained Node.js LTS runtime |
| MCP layer | Official MCP TypeScript SDK (version compatible with the selected protocol revision) |
| Google APIs | Maintained Google API Node.js client (`googleapis`) and Google OAuth client libraries |
| Validation | JSON Schema from MCP SDK and/or Zod, with explicit maximum lengths |
| Persistence | SQLite for local development; PostgreSQL for multi-user remote deployment |
| Encryption | OS keychain/local secret store where available; KMS-backed encryption for production |
| Logs | Structured JSON logs to stderr (local) or centralized log collector (remote) |
| Testing | Unit tests, mocked Google API tests, MCP protocol tests, opt-in live sandbox tests |

These are implementation recommendations, not agent dependencies. Equivalent supported technologies are acceptable if all acceptance criteria pass.

## 5. Authentication, Authorization, and Account Model

**There are two distinct trust boundaries. Do not confuse them.**

### 5.1 Agent/client to MCP server

- In local `stdio` mode, the client launches a user-owned local process. Protect access through operating-system permissions and local configuration; do not implement remote MCP bearer-token flows inside stdin/stdout messages.
- In remote Streamable HTTP mode, authenticate the MCP caller using the MCP authorization specification, including OAuth-compatible discovery and access tokens scoped/audience-bound to **this MCP server**. Use HTTPS; validate each request independently.
- Do not accept Google API access tokens as MCP server bearer tokens. Do not pass through incoming MCP authorization tokens to Google APIs.
- Enforce an identity-to-Google-account mapping and per-user/per-tenant access controls. Client A must never inherit or access Client B's credentials simply because both use the same server instance.
- Validate HTTP `Origin` where applicable, protect against DNS rebinding, and bind local listeners to loopback only.

### 5.2 MCP server to Google APIs

- Implement Google OAuth 2.0 authorization code flow with PKCE where applicable, state validation, offline access when needed, secure refresh-token storage, token refresh, re-consent, and account disconnect/revocation.
- Google OAuth consent must clearly describe Gmail sending and Docs editing permissions.
- Identify which signed-in Google account will send emails and edit Docs; show the account in the approval UI.
- Use one user's authorization for that user's operations only; no hard-coded shared Gmail credentials.
- An ordinary Google service account is **not** a replacement for a personal Gmail account's interactive OAuth authorization. Google Workspace domain-wide delegation is a separate, admin-controlled enterprise feature and out of scope for MVP.

### 5.3 Required scopes and least privilege

| Capability | Scope | Notes |
|---|---|---|
| Send Gmail | `https://www.googleapis.com/auth/gmail.send` | Sensitive scope; does not require inbox read access |
| Edit arbitrary existing Google Docs accessible to user | `https://www.googleapis.com/auth/documents` | Sensitive; supports existing document IDs/URLs within the authorized user's access |
| Alternative, narrower per-file Docs access | `https://www.googleapis.com/auth/drive.file` | Preferred **only when the user has explicitly opened/selected the file for this app**, for example using Google Picker or an equivalent recognized access mechanism |
| Sign-in identity (if used) | `openid email` | For identifying connected user; does not grant Gmail/Docs data access |

**Scope decision:** To meet the plain-language requirement "append to an existing Google Doc by URL/ID" without adding a file-selection mechanism, MVP can request the Docs `documents` scope. If product owners require narrower `drive.file`, add a file-selection/open-with flow and test access to pre-existing Docs first; do **not** assume arbitrary file IDs will work with `drive.file` alone. Never request full Drive access by default.

External/public distribution using sensitive Google scopes may require Google OAuth app verification; test-mode user restrictions and organizational Google Workspace policies may also apply. Document these setup steps explicitly.

## 6. Functional Requirements

### FR-01. MCP discovery and compatibility (P0)

- Server must expose discoverable tools through the MCP tool interface.
- Each tool must have a stable unique name, human-readable purpose, JSON input schema, structured output, and appropriate annotations (read-only vs side-effecting, non-idempotent as relevant).
- Clients must not need to know Google API internals, OAuth tokens, Gmail `raw` MIME format, or Docs `batchUpdate` request format.
- Tool validation and behavior must be identical across local and remote transports.

### FR-02. Gmail email composition and delivery (P0)

- Accept `to` (required), `cc` and `bcc` (optional) as arrays of email addresses.
- Accept nonempty `subject` and at least one of `text_body` / `html_body`; support UTF-8 and proper MIME encoding.
- Support plain text and optional HTML safely without malformed MIME headers. Prefer generating a text alternative for HTML when possible.
- Email must be sent by the connected authenticated Google account through Gmail `users.messages.send` with `userId="me"`.
- Enforce a verified sending identity; never accept arbitrary From/header injection in freeform content.
- Validate all addresses, recipient counts, subject/body length, and newline/header injection attempts before approval.
- Show sender, recipients (including Bcc), subject, and full content in a preview.
- Do not send unless a matching approval has been recorded by the server.
- Success must return the Gmail `messageId` and `threadId` if available, plus an operation ID and final status.

### FR-03. Append to existing Google Docs (P0)

- Accept a valid `https://docs.google.com/document/d/...` URL **or** a document ID.
- Verify document exists and the connected Google identity has edit permission; surface authorization and file-not-found errors distinctly.
- Append text to the **end of the selected document tab body** only. Existing content, headings, tables, and styles must not be deleted or replaced.
- Support multiline Unicode plain text with a configurable separator: `none`, `newline`, `blank_line` (default `blank_line`).
- Explicitly handle Docs with multiple/nested tabs. Retrieve tab metadata with `includeTabsContent=true`; if multiple tabs exist and no target was specified, return `TAB_SELECTION_REQUIRED` rather than silently writing to the first tab. For a single-tab document, select that tab automatically.
- For writes, use `documents.batchUpdate` with `insertText` and `endOfSegmentLocation` targeting the correct tab ID. Do not manually insert at an assumed final character index.
- Capture the document's revision during preview; use `writeControl.requiredRevisionId` at commit, or an equally safe explicitly documented strategy. On revision mismatch, stop and require a new preview/approval rather than silently modifying a changed document.
- Default behavior is append-only plain text. Rich formatting, headings, and insertion into tables are not in MVP.
- Success must return document ID, document URL, selected tab ID, operation ID, and final status.

### FR-04. User approval (P0)

- Side-effecting actions require a separate human approval step **enforced by the server**, not just a prompt instruction or agent checkbox.
- Preview generates a short-lived server-side `action_id`, a user-facing `approval_url`, expiration time, and a cryptographic digest of the exact action parameters.
- Approval page authenticates the same user (or a securely bound authorized approver), displays the complete operation, and records explicit **Approve** / **Reject** selection.
- A commit call is accepted only if the pending action matches the user, provider account, full payload digest, and approved state; approvals expire and cannot be reused for a different operation.
- If the AI client does not support opening links or presenting confirmation, it can return the approval URL to the user. The server must not weaken approval rules to accommodate clients.
- Pending approval, denial, and expiry must produce clear results without performing external writes.
- Future optional policy: explicitly configured admin-controlled allowlists for low-risk unattended operations. This is **disabled by default** and not part of MVP.

### FR-05. Duplicate prevention and recovery (P0)

- Every commit operation accepts an `idempotency_key` (client-supplied unique identifier); the server also maintains a durable `action_id`.
- Reject reuse of a key with different payload/user/action details.
- If an action has already completed successfully, return its stored successful result without calling Google again.
- Use a durable operation ledger and a transactional state transition such as `approved -> executing -> succeeded` to prevent simultaneous duplicate commits.
- **Google APIs do not provide guaranteed end-to-end exactly-once behavior for these operations.** If a request times out after Google may have applied the action, mark the state `unknown` and do **not** blindly retry. Return an `OUTCOME_UNKNOWN` response requiring reconciliation.
- Support controlled manual reconciliation. Do not claim a Gmail email was unsent solely because the API response was lost; do not append the same text a second time automatically.

### FR-06. Auditability and errors (P0)

- Log timestamp, operation ID, tool name, authenticated actor, connected Google account ID (minimized/masked where appropriate), target document or recipient count, approval state, result state, latency, and Google API error category.
- Never log OAuth access/refresh tokens, email bodies, confidential document contents, or full Bcc lists in ordinary production logs.
- Return machine-readable error codes and useful user-facing descriptions with next steps.
- Cover invalid input, missing authorization, insufficient scopes, invalid recipient, document access denied, tab ambiguity, revision conflict, approval required, approval expired, Google rate limit, and uncertain outcome.

## 7. MCP Tool Contract (MVP)

Expose exactly these six MCP tools in the initial implementation. Use JSON schemas with `additionalProperties: false` to avoid accidental unsupported inputs. Keep names and semantics stable.

| Tool | Side effect? | Purpose |
|---|---|---|
| `google_connection_status` | No | Identify current connected Google account and service permissions |
| `gmail_preview_email` | Local pending action only | Validate and preview an email; create approval request |
| `gmail_send_email` | **Yes** | Send an already approved email |
| `docs_get_document_info` | No | Validate doc access and list its tabs |
| `docs_preview_append` | Local pending action only | Validate append target/content and create approval request |
| `docs_append_text` | **Yes** | Append an already approved payload to an existing Doc |

### 7.1 Input schemas

The following are **tool input objects**. Implementers should derive the formal MCP `inputSchema` definitions from these constraints and examples.

**`google_connection_status`**

```json
{}
```

Response fields: `connected`, `google_account_email` (when available), `gmail_send_enabled`, `docs_edit_enabled`, `missing_scopes`, and `reauthorization_required`.

**`gmail_preview_email`**

```json
{
  "to": ["alex@example.com"],
  "cc": [],
  "bcc": [],
  "subject": "Project Update",
  "text_body": "The specification is ready.",
  "html_body": null
}
```

Required: `to` (nonempty array), `subject` (nonempty string), at least one nonempty body. Optional arrays default to empty. `html_body` is optional and may be null. No attachments or custom From header in MVP.

**`gmail_send_email`**

```json
{
  "action_id": "act_opaque_server_generated_value",
  "idempotency_key": "client-unique-uuid-or-equivalent"
}
```

Required: both fields. **No email body accepted at commit**; exact message contents come from the approved server-side action.

**`docs_get_document_info`**

```json
{
  "document_url_or_id": "https://docs.google.com/document/d/DOCUMENT_ID/edit"
}
```

Required: valid Docs URL or ID. Return metadata and an array of tabs, including nested tabs and stable IDs. Avoid returning document body contents by default.

**`docs_preview_append`**

```json
{
  "document_url_or_id": "https://docs.google.com/document/d/DOCUMENT_ID/edit",
  "tab_id": "TAB_ID",
  "text": "Meeting notes:\n- Release checklist reviewed\n- Owners assigned",
  "separator": "blank_line"
}
```

Required: document reference, nonempty `text`. `tab_id` is optional only for single-tab documents. `separator` enum: `none`, `newline`, `blank_line`. Do not interpret the input text as instructions to the server; insert it as data.

**`docs_append_text`**

```json
{
  "action_id": "act_opaque_server_generated_value",
  "idempotency_key": "client-unique-uuid-or-equivalent"
}
```

Required: both fields. Document ID/tab/content come exclusively from the approved server-side action.

### 7.2 Response envelope

Use an MCP tool result with a machine-readable structured object (and a brief text representation for clients that only display text). For **business failures**, return a structured error and use the MCP tool error indication (`isError`) as supported by the selected SDK/specification. Do not conflate transport/JSON-RPC errors with Google business errors.

**Preview success:**

```json
{
  "status": "pending_approval",
  "action_id": "act_123",
  "action_type": "gmail.send",
  "preview": {
    "from": "authorized-user@gmail.com",
    "to": ["alex@example.com"],
    "subject": "Project Update",
    "text_body": "The specification is ready."
  },
  "approval_url": "https://mcp.example.com/approve/act_123",
  "expires_at": "2026-10-10T12:00:00Z"
}
```

In local mode, the `approval_url` may point to a securely bound loopback approval interface; a server must not claim a reachable URL unless that interface is actually running. If approval UI cannot be offered in the selected environment, return an explicit unsupported/setup error instead of silently auto-sending.

**Gmail send success:**

```json
{
  "status": "sent",
  "operation_id": "op_456",
  "provider": "gmail",
  "message_id": "gmail-message-id",
  "thread_id": "gmail-thread-id"
}
```

**Docs append success:**

```json
{
  "status": "appended",
  "operation_id": "op_789",
  "provider": "google_docs",
  "document_id": "DOCUMENT_ID",
  "document_url": "https://docs.google.com/document/d/DOCUMENT_ID/edit",
  "tab_id": "TAB_ID",
  "characters_appended": 69
}
```

The character count is illustrative; calculate it from the actual inserted payload and document the counting convention.

**Structured error example:**

```json
{
  "status": "error",
  "code": "TAB_SELECTION_REQUIRED",
  "message": "This document contains multiple tabs. Choose a tab_id before appending.",
  "retryable": false,
  "details": {
    "tabs": [
      { "tab_id": "t.abc", "title": "Overview" },
      { "tab_id": "t.def", "title": "Meeting Notes" }
    ]
  }
}
```

### 7.3 Recommended error codes

`INVALID_ARGUMENT`, `NOT_CONNECTED`, `INSUFFICIENT_GOOGLE_SCOPE`, `GOOGLE_REAUTH_REQUIRED`, `PERMISSION_DENIED`, `DOCUMENT_NOT_FOUND`, `TAB_SELECTION_REQUIRED`, `TAB_NOT_FOUND`, `REVISION_CHANGED`, `APPROVAL_REQUIRED`, `APPROVAL_REJECTED`, `APPROVAL_EXPIRED`, `ACTION_ALREADY_EXECUTED`, `IDEMPOTENCY_CONFLICT`, `RATE_LIMITED`, `GOOGLE_API_UNAVAILABLE`, `OUTCOME_UNKNOWN`, `INTERNAL_ERROR`.

Distinguish retryable failures from permanent failures. Never automatically retry side-effecting actions with uncertain outcomes.

## 8. Google API Behavior and Edge Cases

### 8.1 Gmail implementation

- Create a standards-compliant MIME email with a trusted library; encode the raw message using URL-safe Base64.
- Call `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send` with the properly encoded `raw` field.
- Treat Google response success as evidence that Gmail accepted the send operation; do not promise recipient delivery or inbox placement.
- Handle 401/403, malformed addresses, quota/rate limiting, network timeouts, non-ASCII display names, line endings, and MIME encoding.
- Do not let a user-supplied subject/body modify MIME headers or inject extra recipients.
- For MVP, preserve the connected sender's address and never spoof other sending identities.

### 8.2 Google Docs implementation

- Extract document ID from an allowlisted Docs URL pattern or accept a safely validated ID; never fetch arbitrary user-provided URLs (SSRF prevention).
- Use `documents.get` with `includeTabsContent=true` to enumerate nested tabs and capture a revision ID.
- Use `documents.batchUpdate` with `insertText` targeting the requested tab using `endOfSegmentLocation` / `tabId`. Ensure newline separation as specified.
- Use revision-based write control so a modification between preview and approval does not silently invalidate what the user reviewed.
- Preserve existing document content; avoid any delete/replace requests in MVP.
- Handle empty documents, Unicode/emoji, multiline text, a tab containing tables, insufficient permissions, revoked access, moved/renamed files, and concurrent collaborators.
- Do not interpret Markdown syntax as formatting automatically; a string such as `**bold**` is literal plain text in MVP.

### 8.3 Limits

Make these configurable with conservative defaults, such as:

| Setting | Initial suggestion |
|---|---|
| Maximum email recipients total | 20 |
| Maximum email subject | 300 characters |
| Maximum email body | 100,000 characters |
| Maximum Docs append text | 100,000 characters |
| Approval lifetime | 10 minutes |
| Maximum external write concurrency per user | 1-2 |
| Rate limit | Configurable per-user/per-client requests per minute |

These are **application-level safety limits**, not Google API quota claims. Measure and adjust them before production.

## 9. Security and Privacy Requirements

1. **Secrets:** No credentials in source code, example configs, logs, tool responses, or the `.md` document. Ship `.env.example` placeholders; put real `.env` files in `.gitignore`.
2. **Google tokens:** Encrypt tokens at rest, protect key material separately, rotate/revoke on disconnect, and store minimal identity/scope data.
3. **User isolation:** Ensure all pending actions, tokens, operation ledger records, and document targets are scoped to the authenticated user and appropriate tenant.
4. **Action binding:** Approvals must bind authenticated user, Google account, exact recipients/content or document ID/tab/content, action digest, and expiry.
5. **Prompt injection:** Treat document text, URLs, and user-provided message bodies as untrusted **data**, never as executable instructions, shell commands, or changes to security policy.
6. **Server exposure:** HTTPS only for remote transport; authenticate every request; validate request origin and host; use strict CORS where appropriate, CSRF protection for approval screens, and safe redirect allowlists.
7. **No arbitrary network proxy:** Server may contact only approved Google endpoints and configured auth infrastructure. Avoid SSRF via arbitrary URL fetching.
8. **Audit:** Log execution metadata, approvals, failures, and token revocation events; redact sensitive contents by default.
9. **Resource controls:** Apply request size, timeout, concurrency, rate limits, and retry/backoff for safe read operations.
10. **Google policies:** Observe Google API Services User Data Policy and OAuth verification requirements, especially for public distribution.
11. **Untrusted clients:** A malicious or compromised MCP client must not be able to bypass server-side approval by fabricating `approved=true`, switching an action ID, or recycling another user's idempotency key.
12. **Approval UX:** Clearly distinguish the Google account, recipients or destination Doc/tab, exact content, and irreversible consequences before approval.

## 10. Operation State Model

```text
previewed -> pending_approval -> approved -> executing -> succeeded
                           \-> rejected
                           \-> expired
                                       executing -> failed
                                       executing -> unknown
```

- Pending actions are durable for their short lifetime and tied to an actor/account.
- Approval transitions are authenticated and recorded, never self-declared by the agent.
- Executing actions are locked against parallel duplicate invocations.
- Completed operations preserve their response for safe deduplicated lookups.
- Unknown results remain blocked from automatic replay until explicitly reconciled.
- State transitions must be atomic in the server database where feasible.

Suggested tables: `google_accounts`, `oauth_credentials` (encrypted), `pending_actions` (encrypted sensitive payload), `approvals`, `operations`, `audit_events`, `mcp_client_authorizations` (remote mode).

## 11. Nonfunctional Requirements

| ID | Requirement | Acceptance measure |
|---|---|---|
| NFR-01 | Multi-client compatibility | Same tools pass protocol tests from at least two different MCP clients and one generic inspector |
| NFR-02 | Reliability | All side effects recorded; no duplicate on repeated successful commit calls |
| NFR-03 | Clarity | Validation/auth/approval errors include code, message, and remediation |
| NFR-04 | Privacy | No secrets or email/doc bodies in normal logs |
| NFR-05 | Configuration | Local and remote transport selectable without changing service code |
| NFR-06 | Maintainability | Typed modules, unit tests, integration tests, README, `.env.example` |
| NFR-07 | Performance | Tool discovery is fast and does not call Google APIs unnecessarily; record p95 latency in tests |
| NFR-08 | Extensibility | New Google Workspace tools can be added as isolated modules without refactoring transports |

## 12. Client Connection Examples

### 12.1 Antigravity local `stdio`

The example below belongs in the appropriate Antigravity MCP config (`~/.gemini/config/mcp_config.json`, or a workspace configuration such as `.agents/mcp_config.json` as supported by the installed Antigravity version). Use an absolute path and never place secrets directly in a shared repo.

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/google-workspace-mcp/dist/index.js", "--transport", "stdio"],
      "env": {
        "APP_ENV": "local",
        "CONFIG_PATH": "/PRIVATE/PATH/google-workspace-mcp/config.local.json"
      }
    }
  }
}
```

The implementation must provide the actual entrypoint and configuration loader used above; do not leave the example pointing to a missing file.

### 12.2 Antigravity remote Streamable HTTP

```json
{
  "mcpServers": {
    "google-workspace-remote": {
      "serverUrl": "https://mcp.example.com/mcp"
    }
  }
}
```

This remote example assumes the client and server support the configured MCP authorization mechanism. Do not paste a Google OAuth token into an MCP `headers.Authorization` field. In clients that need explicit MCP OAuth client registration or app setup, use that client's supported configuration.

### 12.3 Other MCP clients

- **Claude / compatible desktop clients:** Configure a local command/args/environment entry for `stdio` where supported.
- **ChatGPT / compatible cloud-based clients:** Expose a secure public HTTPS Streamable HTTP endpoint and register the server using the product's supported MCP/custom-app connection workflow, subject to product/account availability.
- **Gemini / other MCP-capable agents:** Use the same local or remote endpoint and standard MCP tool definitions.
- **Custom agents:** Connect using a conformant MCP SDK and invoke tools by their schema.

**Do not put ChatGPT-, Claude-, or Gemini-specific code paths in core services.** Packaging instructions may differ between products; the server protocol and tools must not.

## 13. Developer Deliverables

Antigravity should produce a **working implementation**, not just example function stubs. Expected repository structure:

```text
google-workspace-mcp/
├── problemStatement.md
├── README.md
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # CLI / transport selector
│   ├── mcp/
│   │   ├── toolRegistry.ts
│   │   ├── stdioServer.ts
│   │   └── httpServer.ts
│   ├── auth/
│   │   ├── googleOAuth.ts
│   │   ├── mcpAuth.ts
│   │   └── tokenStore.ts
│   ├── tools/
│   │   ├── googleConnectionStatus.ts
│   │   ├── gmailPreviewEmail.ts
│   │   ├── gmailSendEmail.ts
│   │   ├── docsGetDocumentInfo.ts
│   │   ├── docsPreviewAppend.ts
│   │   └── docsAppendText.ts
│   ├── services/
│   │   ├── gmailService.ts
│   │   ├── docsService.ts
│   │   └── approvalService.ts
│   ├── persistence/
│   │   ├── db.ts
│   │   └── operations.ts
│   ├── web/
│   │   └── approvalRoutes.ts
│   └── utils/
│       ├── errors.ts
│       ├── validation.ts
│       └── logging.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── protocol/
└── examples/
    ├── antigravity-stdio.json
    ├── antigravity-remote.json
    └── client-setup.md
```

The precise file breakdown may be adapted to the selected SDK, but the modular separation is required.

### Documentation must include

- Prerequisites and supported Node.js versions.
- Google Cloud project setup, APIs to enable (Gmail API and Google Docs API; Drive API if required by the selected file access flow), OAuth consent configuration, redirect URIs, testing users, and scopes.
- How a user connects and disconnects a Google account.
- How to launch local `stdio` server and remote HTTP server.
- How approval URLs are served and protected in both modes.
- How to configure Antigravity and at least one other compatible MCP client.
- How to exercise all six tools through an MCP inspector/test client.
- Token/key management, HTTPS hosting, error troubleshooting, and OAuth verification limitations.

## 14. Testing and Acceptance Criteria

**Functional tests**

- [ ] MCP inspector successfully lists all six tools with correct schemas and annotations.
- [ ] Local `stdio` mode launches cleanly and writes no non-protocol messages to stdout.
- [ ] Remote Streamable HTTP mode supports authenticated MCP calls and rejects unauthenticated access.
- [ ] A user can connect a real Google account and view accurate connection status.
- [ ] `gmail_preview_email` creates a preview without sending anything.
- [ ] `gmail_send_email` without server-side human approval performs **no send**.
- [ ] An approved email sends once; result includes a real Gmail message ID.
- [ ] Retrying the same approved send with the same idempotency key does not send a second email.
- [ ] Attempting to change recipients/content after approval is rejected.
- [ ] `docs_get_document_info` can access an existing Doc and report its tab IDs.
- [ ] A multi-tab Doc without `tab_id` results in `TAB_SELECTION_REQUIRED`.
- [ ] `docs_preview_append` previews the exact Doc/tab/text without modifying it.
- [ ] `docs_append_text` without server-side approval does not modify the Doc.
- [ ] An approved append adds content only to the selected tab's end and preserves previous content.
- [ ] A second commit with the same idempotency key does not append duplicate text.
- [ ] A revision change between preview and append fails safely with `REVISION_CHANGED`.
- [ ] Unknown network outcome is not automatically retried as a fresh side effect.

**Security and compatibility tests**

- [ ] One user's Google tokens, approvals, and pending actions cannot be used by another user/client identity.
- [ ] Denied/expired approvals are rejected without side effects.
- [ ] Tokens and full email/document contents are absent from normal logs.
- [ ] Scope revocation and expired credentials return actionable re-authorization errors.
- [ ] Header-injection payloads and arbitrary URL/SSRF inputs are rejected.
- [ ] Tool calls work from Antigravity and at least one independently implemented MCP client, with another generic MCP inspector providing protocol coverage.
- [ ] Both transport modes use the exact same tool/service implementation.

### Definition of Done

The MVP is complete only when **a real email is successfully sent and text is successfully appended to a pre-existing Google Doc**, each with verified human approval, while passing the security, retry, and cross-client tests above. Mock-only success is insufficient.

## 15. Implementation Sequence for Antigravity

1. **Scaffold:** TypeScript project, current MCP SDK, tool registry, shared service interfaces, transport modes, config validation, and tests.
2. **Google authorization:** OAuth consent/refresh/token storage, account isolation, connection status, and disconnect support.
3. **Approval foundation:** Pending action storage, browser approval routes, user binding, expiry, and immutable action payloads.
4. **Gmail end-to-end:** Preview -> approval -> one-time send -> ledger and audit.
5. **Docs end-to-end:** Document metadata/tabs -> preview -> approval -> revision-checked append -> ledger and audit.
6. **Hardening:** Robust error mapping, timeouts, quotas, concurrency, secrets, threat tests, and unknown-outcome reconciliation.
7. **Interoperability:** MCP inspector, Antigravity, an independent MCP client, and remote authorization tests.
8. **Documentation:** Google Cloud setup walkthrough, client configs, deployment, and troubleshooting.

Complete and test each stage before adding features outside the MVP.

## 16. Explicit Build Instructions for the Antigravity Agent

> Read this entire `problemStatement.md` and implement the project as a standalone, production-conscious, standards-compliant Model Context Protocol server. Use Antigravity only as the development environment, not as a runtime dependency. Expose the six specified tools, support local stdio and remote Streamable HTTP with shared business logic, implement Google OAuth and secure token storage, and require server-enforced human approval before Gmail send or Google Docs append operations. Follow the MCP 2026-07-28 specification where supported by the selected SDK, including compatibility handling for commonly deployed older clients. Implement idempotency tracking, revision-safe Docs append, useful structured errors, automated tests, and working setup instructions. Do not hard-code credentials, skip approval, silently retry uncertain external writes, or claim compatibility without testing. Build the minimal end-to-end working product first; identify any unavoidable product/platform setup that a user must complete manually.

## 17. Open Decisions and Defaults

| Decision | MVP default | Rationale |
|---|---|---|
| Primary deployment | Local first, remote-capable architecture | Simplifies initial development while enabling cloud-only clients later |
| Google Docs scope | `documents` for arbitrary existing Docs | Meets the user-provided URL/ID use case; evaluate `drive.file` + file picker later |
| Email format | Plain text with optional HTML | Covers common use cases without attachments |
| Docs content | Plain text append | Minimizes destructive editing risks |
| Multi-tab behavior | Require explicit tab selection when ambiguous | Prevents wrong-tab writes |
| Approval policy | Manual server-side approval for every write | Portable safety independent of AI client UI |
| Storage | Local SQLite, production pluggable | Keeps initial setup simple while retaining durable operations |
| Google accounts | One or more explicitly connected accounts, identity-bound | Avoids shared credentials and supports future multi-user deployments |
| Unknown network outcome | Halt and reconcile | Prevents duplicate email or document content |
| Cloud endpoint | Streamable HTTP with MCP authorization | Necessary for clients that cannot launch a local process |

## 18. Authoritative References

References checked while creating this document on **2026-10-10**. Before coding, consult the newest applicable SDK docs and verify live platform setup requirements.

1. MCP specification: https://modelcontextprotocol.io/specification/2026-07-28
2. MCP transport overview: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports
3. MCP HTTP authorization: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
4. MCP tool specification: https://modelcontextprotocol.io/specification/2026-07-28/server/tools
5. Google Antigravity MCP configuration: https://antigravity.google/docs/mcp
6. Gmail sending guide: https://developers.google.com/workspace/gmail/api/guides/sending
7. Gmail API send reference: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send
8. Gmail OAuth scope guidance: https://developers.google.com/workspace/gmail/api/auth/scopes
9. Google Docs batchUpdate: https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate
10. Google Docs insertText/endOfSegmentLocation reference: https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request
11. Google Docs tabs guide: https://developers.google.com/workspace/docs/api/how-tos/tabs
12. Google Docs OAuth scope guidance: https://developers.google.com/workspace/docs/api/auth
13. Google Drive per-file authorization: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
14. Google OAuth web-server flow: https://developers.google.com/identity/protocols/oauth2/web-server

---

**One-line success criterion:** The same independent MCP server can safely send a user-approved Gmail message and append user-approved text to an existing Google Doc from different standards-compatible AI agents, without changing the server's core code.
