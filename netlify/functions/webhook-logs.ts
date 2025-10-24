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
 * Webhook Logs API
 * GET /?webhook_id=X - Get logs for a specific webhook (with pagination)
 * GET /?webhook_id=X&status=success - Filter by status
 * GET /?webhook_id=X&limit=50 - Limit results (default 50)
 */
export const handler: Handler = async (event, _context) => {
  const { httpMethod, queryStringParameters } = event;

  try {
    // GET / - Get logs with filters
    if (httpMethod === 'GET') {
      const webhookId = queryStringParameters?.webhook_id;
      const status = queryStringParameters?.status; // 'success' or 'failed'
      const limit = parseInt(queryStringParameters?.limit || '50', 10);

      if (!webhookId) {
        return createResponse(400, {
          error: 'webhook_id query parameter is required',
        });
      }

      let query = supabase
        .from('webhook_logs')
        .select('*')
        .eq('webhook_id', webhookId)
        .order('sent_at', { ascending: false })
        .limit(Math.min(limit, 100)); // Cap at 100

      if (status && (status === 'success' || status === 'failed')) {
        query = query.eq('status', status);
      }

      const { data: logs, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch logs: ${error.message}`);
      }

      // Calculate summary stats
      const { count: totalLogs } = await supabase
        .from('webhook_logs')
        .select('*', { count: 'exact', head: true })
        .eq('webhook_id', webhookId);

      const { count: successCount } = await supabase
        .from('webhook_logs')
        .select('*', { count: 'exact', head: true })
        .eq('webhook_id', webhookId)
        .eq('status', 'success');

      const { count: failedCount } = await supabase
        .from('webhook_logs')
        .select('*', { count: 'exact', head: true })
        .eq('webhook_id', webhookId)
        .eq('status', 'failed');

      return createResponse(200, {
        logs: logs || [],
        summary: {
          total: totalLogs || 0,
          success: successCount || 0,
          failed: failedCount || 0,
          success_rate:
            totalLogs && totalLogs > 0
              ? Math.round((successCount || 0) / totalLogs * 100)
              : 0,
        },
      });
    }

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

    // Method not allowed
    return createResponse(405, { error: 'Method not allowed' });
  } catch (error: any) {
    console.error('❌ Error in webhook-logs function:', error);

    return createResponse(500, {
      error: error.message || 'Internal server error',
    });
  }
};
