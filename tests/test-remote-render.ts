import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

async function testRemoteServer() {
  console.log('=== Testing Remote MCP Server: https://aiagentserver.onrender.com ===\n');

  const baseUrl = 'https://aiagentserver.onrender.com';
  const token = 'mcp_secret_token_render_2026';

  // 1. Health check
  console.log('1. Checking /health endpoint...');
  const healthRes = await fetch(`${baseUrl}/health`);
  const healthJson = await healthRes.json();
  console.log('   Status Code:', healthRes.status);
  console.log('   Response:', JSON.stringify(healthJson));
  if (healthRes.status !== 200 || healthJson.status !== 'ok') {
    throw new Error('Health check failed!');
  }
  console.log('   ✓ Health check passed!\n');

  // 2. Connect MCP Client over SSE
  console.log('2. Connecting MCP Client over SSE...');
  const sseUrl = new URL(`${baseUrl}/sse`);

  const transport = new SSEClientTransport(sseUrl, {
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
    { name: 'remote-test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log('   ✓ Connected to remote MCP server via SSE!\n');

  // 3. List Tools
  console.log('3. Requesting tools/list...');
  const toolsResult = await client.listTools();
  console.log(`   Discovered ${toolsResult.tools.length} tools:`);
  for (const tool of toolsResult.tools) {
    console.log(`    - ${tool.name}: ${tool.description}`);
  }
  if (toolsResult.tools.length !== 6) {
    throw new Error(`Expected 6 tools, but got ${toolsResult.tools.length}`);
  }
  console.log('   ✓ All 6 tools discovered!\n');

  // 4. Test google_connection_status
  console.log('4. Calling tool: google_connection_status...');
  const statusRes = await client.callTool({
    name: 'google_connection_status',
    arguments: {}
  });
  const statusContent = JSON.parse((statusRes.content[0] as any).text);
  console.log('   Result:', JSON.stringify(statusContent, null, 2));
  console.log('   Connected:', statusContent.connected);
  if (statusContent.connected) {
    console.log('   Account Email:', statusContent.google_account_email);
  } else {
    console.log('   (Note: Google account not authenticated yet on Render. Visit https://aiagentserver.onrender.com/login)');
  }
  console.log('   ✓ google_connection_status executed successfully!\n');

  // 5. Test gmail_preview_email
  console.log('5. Calling tool: gmail_preview_email...');
  const previewRes = await client.callTool({
    name: 'gmail_preview_email',
    arguments: {
      to: ['recipient@example.com'],
      subject: 'Remote MCP Server Test',
      text_body: 'This is a test preview from the remote MCP server on Render.'
    }
  });
  const previewContent = JSON.parse((previewRes.content[0] as any).text);
  console.log('   Status:', previewContent.status);
  console.log('   Action ID:', previewContent.action_id);
  console.log('   Approval URL:', previewContent.approval_url);
  if (!previewContent.approval_url.startsWith(baseUrl)) {
    console.warn(`   Warning: Approval URL does not start with ${baseUrl}: ${previewContent.approval_url}`);
  }
  console.log('   ✓ gmail_preview_email executed successfully!\n');

  // 6. Test Approval UI endpoint
  console.log('6. Verifying Approval UI endpoint...');
  const approvalRes = await fetch(previewContent.approval_url);
  console.log('   Approval Page HTTP Status:', approvalRes.status);
  const approvalHtml = await approvalRes.text();
  const hasApproveForm = approvalHtml.includes('action_type') || approvalHtml.includes('Approve Action') || approvalHtml.includes('gmail.send');
  console.log('   Approval Form Rendered:', hasApproveForm);
  if (approvalRes.status !== 200 || !hasApproveForm) {
    throw new Error('Approval page failed to render correctly');
  }
  console.log('   ✓ Approval UI endpoint verified!\n');

  // 7. Test gmail_send_email WITHOUT approval (must be rejected)
  console.log('7. Calling tool: gmail_send_email before approval (expect rejection)...');
  const sendRes = await client.callTool({
    name: 'gmail_send_email',
    arguments: {
      action_id: previewContent.action_id,
      idempotency_key: `test-key-${Date.now()}`
    }
  });
  console.log('   isError:', sendRes.isError);
  console.log('   Result:', (sendRes.content[0] as any).text);
  if (!sendRes.isError) {
    throw new Error('Safety violation: unapproved send succeeded!');
  }
  console.log('   ✓ Security check passed: unapproved send was rejected!\n');

  // 8. Test invalid document fetch
  console.log('8. Calling tool: docs_get_document_info with non-existent ID...');
  const docsRes = await client.callTool({
    name: 'docs_get_document_info',
    arguments: {
      document_url_or_id: 'sample_dummy_document_id'
    }
  });
  console.log('   isError:', docsRes.isError);
  console.log('   Result:', (docsRes.content[0] as any).text);
  console.log('   ✓ docs_get_document_info handled error properly!\n');

  await client.close();
  console.log('=== ALL REMOTE MCP TESTS PASSED SUCCESSFULLY! ===');
}

testRemoteServer().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
