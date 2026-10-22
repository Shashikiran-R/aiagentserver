import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  console.log('--- Testing Approved Gmail Send Flow ---');
  const token = process.env.MCP_AUTH_TOKEN || 'mcp_local_secret_token';
  const url = new URL('http://localhost:3000/sse');

  const transport = new SSEClientTransport(url, {
    eventSourceInit: {
      fetch: (input: any, init?: any) => {
        return fetch(input, {
          ...init,
          headers: { ...init?.headers, Authorization: `Bearer ${token}` }
        });
      }
    },
    requestInit: {
      headers: { Authorization: `Bearer ${token}` }
    }
  });

  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  // 1. Preview Email
  console.log('Step 1: Calling gmail_preview_email...');
  const previewRes = await client.callTool({
    name: 'gmail_preview_email',
    arguments: {
      to: ['shashikiran9035@gmail.com'],
      subject: 'MCP Server Verification Email',
      text_body: 'Hello Shashikiran,\n\nThis is a verification email sent from your newly configured Google Workspace MCP Server!'
    }
  });

  const preview = JSON.parse((previewRes.content[0] as any).text);
  console.log('Preview generated:');
  console.log(' - Action ID:', preview.action_id);
  console.log(' - Approval URL:', preview.approval_url);

  // 2. Submit Approval via the approval endpoint
  console.log('\nStep 2: Submitting approval to', preview.approval_url);
  const approveRes = await fetch(preview.approval_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ decision: 'approve' }).toString()
  });
  console.log('Approval response status:', approveRes.status);

  // 3. Send Email with idempotency key
  const idempotencyKey = `idemp-send-${Date.now()}`;
  console.log('\nStep 3: Calling gmail_send_email with approved action...');
  const sendRes = await client.callTool({
    name: 'gmail_send_email',
    arguments: {
      action_id: preview.action_id,
      idempotency_key: idempotencyKey
    }
  });
  console.log('Send Result:', sendRes.content[0]);

  // 4. Test Idempotency: retry the same send with the same key
  console.log('\nStep 4: Retrying gmail_send_email with same idempotency key (deduplication check)...');
  const retryRes = await client.callTool({
    name: 'gmail_send_email',
    arguments: {
      action_id: preview.action_id,
      idempotency_key: idempotencyKey
    }
  });
  console.log('Retry Result (should match without duplicate send):', retryRes.content[0]);

  await client.close();
  console.log('\n--- Email Flow Successfully Verified! ---');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
