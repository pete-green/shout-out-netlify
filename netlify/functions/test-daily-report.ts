import { Handler } from '@netlify/functions';
import { handler as reportHandler } from './send-daily-report';

/**
 * Manual test endpoint for the daily sales report
 * Call this endpoint to test the report generation without waiting for the schedule
 *
 * Usage: POST to /.netlify/functions/test-daily-report
 */
export const handler: Handler = async (event) => {
  console.log('Manual test of daily sales report triggered');

  // Call the main report handler
  const result = await reportHandler(event, {} as any);

  return {
    ...result,
    headers: {
      'Content-Type': 'application/json',
    },
  };
};
