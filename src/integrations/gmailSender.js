import { getMcpClient } from './mcpClient.js';

/**
 * Sends the final email via the MCP Server.
 * @param {string} serverUrl - The MCP server URL.
 * @param {string} authToken - The MCP Auth Token.
 * @param {string} recipient - The email address to send to.
 * @param {string} subject - The email subject.
 * @param {string} body - The email body content.
 * @returns {Promise<string>} The Message ID of the sent email.
 */
export async function sendPulseEmail(serverUrl, authToken, recipient, subject, body) {
  if (!recipient) {
    throw new Error('PULSE_RECIPIENT is not set in the environment variables.');
  }

  const client = await getMcpClient(serverUrl, authToken);
  
  const result = await client.callTool({
    name: 'send_email',
    arguments: {
      to: [recipient],
      subject: subject,
      body: body,
      isHtml: false
    }
  });

  if (result.isError) {
    throw new Error(`Failed to send email: ${JSON.stringify(result)}`);
  }

  // The tool returns a JSON string in its content block
  const responseData = JSON.parse(result.content[0].text);
  
  if (!responseData.success) {
      throw new Error(`Failed to send email: ${JSON.stringify(responseData)}`);
  }

  return responseData.messageId;
}
