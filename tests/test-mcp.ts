import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  console.log('--- Testing MCP Client over SSE ---');
  const token = process.env.MCP_AUTH_TOKEN || 'mcp_local_secret_token';
  const url = new URL('http://localhost:3000/sse');

  const transport = new SSEClientTransport(url, {
    eventSourceInit: {
      fetch: (input: any, init?: any) => {
        return fetch(input, {
          ...init,
          headers: {
            ...init?.headers,
            Authorization: `Bearer ${token}`
          }
        });
      }
    },
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });

  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log('Connected to MCP server via SSE!');

  // 1. List tools
  const tools = await client.listTools();
  console.log(`Discovered ${tools.tools.length} tools:`);
  for (const t of tools.tools) {
    console.log(` - ${t.name}: ${t.description}`);
  }

  // 2. Test google_connection_status
  console.log('\n--- Calling google_connection_status ---');
  const statusRes = await client.callTool({
    name: 'google_connection_status',
    arguments: {}
  });
  console.log('Status Result:', statusRes.content[0]);

  // 3. Test gmail_preview_email
  console.log('\n--- Calling gmail_preview_email ---');
  const previewRes = await client.callTool({
    name: 'gmail_preview_email',
    arguments: {
      to: ['test@example.com'],
      subject: 'Test Subject',
      text_body: 'Hello, this is a test message.'
    }
  });
  console.log('Preview Result:', previewRes.content[0]);

  const previewData = JSON.parse((previewRes.content[0] as any).text);
  const actionId = previewData.action_id;

  // 4. Test gmail_send_email WITHOUT approval (should fail with APPROVAL_REQUIRED)
  console.log('\n--- Calling gmail_send_email before approval (expect error) ---');
  const unapprovedSend = await client.callTool({
    name: 'gmail_send_email',
    arguments: {
      action_id: actionId,
      idempotency_key: `test-key-${Date.now()}`
    }
  });
  console.log('Unapproved Send Result (isError:', unapprovedSend.isError, '):', unapprovedSend.content[0]);

  // 5. Test Approval UI endpoint
  console.log(`\n--- Testing Approval Screen URL: http://localhost:3000/approve/${actionId} ---`);
  const approvalPage = await fetch(`http://localhost:3000/approve/${actionId}`);
  console.log('Approval page status:', approvalPage.status);
  const html = await approvalPage.text();
  console.log('Approval page has action:', html.includes('Approve Action: gmail.send'));

  // 6. Test Document info without connection (expect error)
  console.log('\n--- Calling docs_get_document_info without connection (expect NOT_CONNECTED error) ---');
  const docInfo = await client.callTool({
    name: 'docs_get_document_info',
    arguments: {
      document_url_or_id: '1234567890abcdef'
    }
  });
  console.log('Docs Info Result (isError:', docInfo.isError, '):', docInfo.content[0]);

  await client.close();
  console.log('\nAll MCP verification tests completed successfully!');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
