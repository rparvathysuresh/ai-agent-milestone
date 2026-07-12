import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const EventSource = require('eventsource');

// Make EventSource available globally for the SSE transport
global.EventSource = EventSource;

let mcpClient = null;

/**
 * Initializes and returns the MCP client connected to the SSE server.
 * @param {string} serverUrl - The SSE endpoint URL of the MCP server.
 * @param {string} [authToken] - The optional authentication token for the MCP server.
 * @returns {Promise<Client>}
 */
export async function getMcpClient(serverUrl, authToken) {
  if (mcpClient) return mcpClient;

  if (!serverUrl) {
    throw new Error('MCP_SERVER_URL is not set.');
  }

  const options = authToken 
    ? { requestInit: { headers: { 'Authorization': `Bearer ${authToken}` } } }
    : undefined;

  const transport = new SSEClientTransport(new URL(serverUrl), options);
  
  mcpClient = new Client(
    { name: 'Weekly-Pulse-Agent', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  await mcpClient.connect(transport);
  return mcpClient;
}

/**
 * Safely closes the MCP client connection.
 */
export async function closeMcpClient() {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
  }
}
