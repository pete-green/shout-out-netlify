import { Handler } from '@netlify/functions';
import { handler as reportHandler } from './send-daily-report';

/**
 * Scheduled wrapper for 12pm EDT daily sales report
 */
export const handler: Handler = async (event, context) => {
  const result = await reportHandler(event, context);
  if (!result) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'No response from handler' }),
    };
  }
  return result;
};
