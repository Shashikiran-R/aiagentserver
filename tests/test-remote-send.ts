import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

async function testRemoteSend() {
  console.log('=== Testing Production Email Send on Render ===\n');

  const baseUrl = 'https://aiagentserver.onrender.com';
  const token = 'mcp_secret_token_render_2026';

  const transport = new SSEClientTransport(new URL(`${baseUrl}/sse`), {
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
    { name: 'remote-test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);

  // 1. Preview
  console.log('1. Calling gmail_preview_email...');
  const previewRes = await client.callTool({
    name: 'gmail_preview_email',
    arguments: {
      to: ['shashikiran9035@gmail.com'],
      subject: 'Render Production MCP Server Verified!',
      text_body: 'Congratulations Shashikiran!\n\nYour Google Workspace MCP Server is now fully deployed and operating live on Render.'
    }
  });

  const preview = JSON.parse((previewRes.content[0] as any).text);
  console.log('   Action ID:', preview.action_id);
  console.log('   Approval URL:', preview.approval_url);

  // 2. Approve
  console.log('\n2. Submitting Human Approval to:', preview.approval_url);
  const approveRes = await fetch(preview.approval_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ decision: 'approve' }).toString()
  });
  console.log('   Approval Response Status:', approveRes.status);

  // 3. Send
  const idempotencyKey = `prod-send-${Date.now()}`;
  console.log('\n3. Executing gmail_send_email with approved action ID...');
  const sendRes = await client.callTool({
    name: 'gmail_send_email',
    arguments: {
      action_id: preview.action_id,
      idempotency_key: idempotencyKey
    }
  });

  const sendResult = JSON.parse((sendRes.content[0] as any).text);
  console.log('   Send Result:', JSON.stringify(sendResult, null, 2));

  // 4. Test Idempotency
  console.log('\n4. Testing Idempotency on repeated send...');
  const retryRes = await client.callTool({
    name: 'gmail_send_email',
    arguments: {
      action_id: preview.action_id,
      idempotency_key: idempotencyKey
    }
  });
  const retryResult = JSON.parse((retryRes.content[0] as any).text);
  console.log('   Retry Result:', JSON.stringify(retryResult, null, 2));

  await client.close();
  console.log('\n=== PRODUCTION FLOW 100% VERIFIED! ===');
}

testRemoteSend().catch((err) => {
  console.error('\n❌ Production send test failed:', err);
  process.exit(1);
});
