import { getMcpClient } from './mcpClient.js';

/**
 * Appends the final report to the Master Google Doc via the MCP Server.
 * @param {string} serverUrl - The MCP server URL.
 * @param {string} authToken - The MCP Auth Token.
 * @param {string} documentId - The ID of the Master Google Doc.
 * @param {string} content - The markdown content to append.
 * @returns {Promise<string>} The URL of the Google Doc.
 */
export async function appendToMasterDoc(serverUrl, authToken, documentId, content) {
  if (!documentId) {
    throw new Error('GOOGLE_DOC_ID is not set in the environment variables.');
  }

  const client = await getMcpClient(serverUrl, authToken);
  
  // Format content with a timestamp header for the append operation
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const appendContent = `\n\n----------------------------------------\n\nWeekly Pulse: ${dateStr}\n\n${content}\n`;

  const result = await client.callTool({
    name: 'append_google_doc',
    arguments: {
      documentId: documentId,
      content: appendContent
    }
  });

  if (result.isError) {
    throw new Error(`Failed to append to Google Doc: ${JSON.stringify(result)}`);
  }

  // The tool returns a JSON string in its content block
  const responseData = JSON.parse(result.content[0].text);
  
  if (!responseData.success) {
      throw new Error(`Failed to append to Google Doc: ${JSON.stringify(responseData)}`);
  }

  return `https://docs.google.com/document/d/${documentId}/edit`;
}
