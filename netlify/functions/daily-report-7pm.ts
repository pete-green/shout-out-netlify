import { Handler } from '@netlify/functions';
import { handler as reportHandler } from './send-daily-report';

/**
 * Scheduled wrapper for 7pm EDT daily sales report
 */
export const handler: Handler = async (event, context) => {
  return reportHandler(event, context);
};
