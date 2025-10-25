import { Handler, HandlerResponse } from '@netlify/functions';
import { supabase } from './lib/supabase';

function createResponse(statusCode: number, body: any): HandlerResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

/**
 * Poll Details API
 * GET /?poll_log_id=<uuid> - Get all estimates found during a specific poll
 */
export const handler: Handler = async (event, _context) => {
  const { httpMethod, queryStringParameters } = event;

  try {
    // OPTIONS - CORS preflight
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: '',
      };
    }

    // GET / - Get estimates for a poll
    if (httpMethod === 'GET') {
      const pollLogId = queryStringParameters?.poll_log_id;

      if (!pollLogId) {
        return createResponse(400, { error: 'poll_log_id query parameter is required' });
      }

      // Fetch estimates for this poll
      const { data: estimates, error: estimatesError } = await supabase
        .from('estimates')
        .select('*')
        .eq('poll_log_id', pollLogId)
        .order('sold_at', { ascending: false });

      if (estimatesError) {
        throw new Error(`Failed to fetch estimates: ${estimatesError.message}`);
      }

      // Extract key fields from raw_data for easier display
      const enrichedEstimates = (estimates || []).map((estimate: any) => {
        const rawData = estimate.raw_data || {};

        return {
          id: estimate.id,
          estimate_id: estimate.estimate_id,
          salesperson: estimate.salesperson,
          customer_name: estimate.customer_name,
          amount: estimate.amount,
          sold_at: estimate.sold_at,
          is_tgl: estimate.is_tgl,
          is_big_sale: estimate.is_big_sale,
          option_name: estimate.option_name,
          // Extract additional fields from raw_data
          job_number: rawData.jobNumber || rawData.job?.number || 'N/A',
          location_id: rawData.locationId || rawData.location?.id || 'N/A',
          business_unit: rawData.businessUnitName || rawData.businessUnit?.name || 'N/A',
        };
      });

      return createResponse(200, {
        poll_log_id: pollLogId,
        estimate_count: enrichedEstimates.length,
        estimates: enrichedEstimates,
      });
    }

    // Method not allowed
    return createResponse(405, { error: 'Method not allowed' });
  } catch (error: any) {
    console.error('❌ Error in poll-details function:', error);

    return createResponse(500, {
      error: error.message || 'Internal server error',
    });
  }
};
