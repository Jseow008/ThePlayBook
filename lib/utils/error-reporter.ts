/**
 * Utility for reporting errors to the Pipedream webhook endpoint.
 */

export interface ErrorReport {
  message: string;
  source: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  details?: Record<string, any>;
  stack?: string;
  userId?: string;
}

export async function reportError(errorContent: ErrorReport) {
  const webhookUrl = process.env.PIPEDREAM_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.warn('PIPEDREAM_WEBHOOK_URL is not set. Error will only be logged locally.');
    console.error('Error Report:', errorContent);
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Pipedream will automatically parse this JSON payload
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        ...errorContent
      }),
    });

    if (!response.ok) {
      console.error(`Failed to send error report to Pipedream. Status: ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send error report to Pipedream:', error);
    return false;
  }
}
