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
 * Poll Status API
 * GET / - Get current polling status and recent logs
 * PATCH / - Toggle polling on/off
 */
export const handler: Handler = async (event, _context) => {
  const { httpMethod, body } = event;

  try {
    // GET / - Get polling status
    if (httpMethod === 'GET') {
      // Fetch polling settings
      const { data: settings, error: settingsError } = await supabase
        .from('app_state')
        .select('key, value')
        .in('key', ['polling_enabled', 'polling_interval_minutes', 'last_poll_timestamp']);

      if (settingsError) {
        throw new Error(`Failed to fetch settings: ${settingsError.message}`);
      }

      const settingsMap: any = {};
      (settings || []).forEach((s) => {
        settingsMap[s.key] = s.value;
      });

      const pollingEnabled = settingsMap.polling_enabled === true || settingsMap.polling_enabled === 'true';
      const pollingInterval = parseInt(settingsMap.polling_interval_minutes || '5', 10);
      const lastPollTimestamp = settingsMap.last_poll_timestamp as string;

      // Calculate next poll estimate
      let nextPollEstimate = null;
      if (pollingEnabled && lastPollTimestamp) {
        const lastPollDate = new Date(lastPollTimestamp);
        const nextPollDate = new Date(lastPollDate.getTime() + pollingInterval * 60 * 1000);
        nextPollEstimate = nextPollDate.toISOString();
      }

      // Fetch recent logs (last 20)
      const { data: logs, error: logsError } = await supabase
        .from('poll_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (logsError) {
        throw new Error(`Failed to fetch logs: ${logsError.message}`);
      }

      // Calculate stats for last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentLogs } = await supabase
        .from('poll_logs')
        .select('*')
        .gte('created_at', twentyFourHoursAgo);

      const stats = {
        total_polls_24h: recentLogs?.length || 0,
        successful_polls_24h: recentLogs?.filter((log: any) => log.status === 'success').length || 0,
        failed_polls_24h: recentLogs?.filter((log: any) => log.status === 'error').length || 0,
        skipped_polls_24h: recentLogs?.filter((log: any) => log.status === 'skipped').length || 0,
        total_estimates_24h: recentLogs?.reduce((sum: number, log: any) => sum + (log.estimates_processed || 0), 0) || 0,
        average_duration_ms: recentLogs && recentLogs.length > 0
          ? Math.round(recentLogs.reduce((sum: number, log: any) => sum + (log.duration_ms || 0), 0) / recentLogs.length)
          : 0,
        success_rate_24h: recentLogs && recentLogs.length > 0
          ? Math.round((recentLogs.filter((log: any) => log.status === 'success').length / recentLogs.length) * 100)
          : 0,
      };

      return createResponse(200, {
        polling_enabled: pollingEnabled,
        polling_interval_minutes: pollingInterval,
        last_poll_timestamp: lastPollTimestamp,
        next_poll_estimate: nextPollEstimate,
        logs: logs || [],
        stats,
      });
    }

    // PATCH / - Toggle polling
    if (httpMethod === 'PATCH') {
      if (!body) {
        return createResponse(400, { error: 'Request body is required' });
      }

      const updates = JSON.parse(body);

      if (updates.polling_enabled === undefined) {
        return createResponse(400, {
          error: 'polling_enabled field is required',
        });
      }

      const enabled = updates.polling_enabled === true || updates.polling_enabled === 'true';

      // Update polling_enabled flag
      const { error } = await supabase
        .from('app_state')
        .update({
          value: enabled,
          updated_at: new Date().toISOString(),
        })
        .eq('key', 'polling_enabled');

      if (error) {
        throw new Error(`Failed to update polling_enabled: ${error.message}`);
      }

      // Log the change
      await supabase.from('poll_logs').insert({
        status: enabled ? 'enabled' : 'disabled',
        estimates_found: 0,
        estimates_processed: 0,
        duration_ms: 0,
        error_message: `Polling ${enabled ? 'enabled' : 'disabled'} via UI`,
      });

      console.log(`✅ Polling ${enabled ? 'enabled' : 'disabled'}`);

      return createResponse(200, {
        success: true,
        polling_enabled: enabled,
        message: `Polling ${enabled ? 'enabled' : 'disabled'} successfully`,
      });
    }

    // OPTIONS - CORS preflight
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: '',
      };
    }

    // Method not allowed
    return createResponse(405, { error: 'Method not allowed' });
  } catch (error: any) {
    console.error('❌ Error in poll-status function:', error);

    return createResponse(500, {
      error: error.message || 'Internal server error',
    });
  }
};
