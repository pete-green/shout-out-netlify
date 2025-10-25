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
 * Clear Testing Data API
 * POST / - Clears all polling-related data for fresh testing
 * Clears: estimates, poll_logs, webhook_logs, recently_processed_ids
 * Preserves: messages, gifs, salespeople, webhooks config, settings
 */
export const handler: Handler = async (event, _context) => {
  const { httpMethod } = event;

  try {
    // OPTIONS - CORS preflight
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: '',
      };
    }

    // POST / - Clear testing data
    if (httpMethod === 'POST') {
      console.log('🗑️  Starting clear testing data operation...');

      // Count records before deleting
      const { count: estimatesCount } = await supabase
        .from('estimates')
        .select('*', { count: 'exact', head: true });

      const { count: pollLogsCount } = await supabase
        .from('poll_logs')
        .select('*', { count: 'exact', head: true });

      const { count: webhookLogsCount } = await supabase
        .from('webhook_logs')
        .select('*', { count: 'exact', head: true });

      // Delete all estimates
      const { error: estimatesError } = await supabase
        .from('estimates')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Match all rows

      if (estimatesError) {
        throw new Error(`Failed to delete estimates: ${estimatesError.message}`);
      }

      console.log(`✅ Deleted ${estimatesCount || 0} estimates`);

      // Delete all poll_logs
      const { error: pollLogsError } = await supabase
        .from('poll_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Match all rows

      if (pollLogsError) {
        throw new Error(`Failed to delete poll logs: ${pollLogsError.message}`);
      }

      console.log(`✅ Deleted ${pollLogsCount || 0} poll logs`);

      // Delete all webhook_logs (uses integer ID, not UUID)
      const { error: webhookLogsError } = await supabase
        .from('webhook_logs')
        .delete()
        .gte('id', 0); // Match all rows (id >= 0)

      if (webhookLogsError) {
        throw new Error(`Failed to delete webhook logs: ${webhookLogsError.message}`);
      }

      console.log(`✅ Deleted ${webhookLogsCount || 0} webhook logs`);

      // Clear recently_processed_ids
      const { error: appStateError } = await supabase
        .from('app_state')
        .update({ value: [] })
        .eq('key', 'recently_processed_ids');

      if (appStateError) {
        throw new Error(`Failed to clear recently_processed_ids: ${appStateError.message}`);
      }

      console.log('✅ Cleared recently_processed_ids');

      // Reset last_poll_timestamp to 12:01 AM Eastern Time today
      // Get parts of current date in Eastern timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      const parts = formatter.formatToParts(new Date());
      const year = parts.find(p => p.type === 'year')!.value;
      const month = parts.find(p => p.type === 'month')!.value;
      const day = parts.find(p => p.type === 'day')!.value;

      // Determine if we're in Daylight Saving Time (EDT) or Standard Time (EST)
      // Eastern is either UTC-4 (EDT) or UTC-5 (EST)
      const isDST = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).includes('EDT');
      const offsetHours = isDST ? 4 : 5;

      // Add offset to convert from local server time to Eastern Time midnight
      const startOfToday = new Date(Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        offsetHours,
        1,
        0,
        0
      ));

      const { error: timestampError } = await supabase
        .from('app_state')
        .update({ value: startOfToday.toISOString() })
        .eq('key', 'last_poll_timestamp');

      if (timestampError) {
        throw new Error(`Failed to reset last_poll_timestamp: ${timestampError.message}`);
      }

      console.log('✅ Reset last_poll_timestamp to beginning of today');

      // Reset message usage statistics
      const { error: messagesResetError } = await supabase
        .from('celebration_messages')
        .update({
          use_count: 0,
          last_used_at: null,
          last_used_for: null,
        })
        .gte('id', 0); // Match all rows (id >= 0 for integer IDs)

      if (messagesResetError) {
        throw new Error(`Failed to reset message usage: ${messagesResetError.message}`);
      }

      console.log('✅ Reset message usage statistics');

      // Reset GIF usage statistics
      const { error: gifsResetError } = await supabase
        .from('celebration_gifs')
        .update({
          use_count: 0,
          last_used_at: null,
          last_used_for: null,
        })
        .gte('id', 0); // Match all rows (id >= 0 for integer IDs)

      if (gifsResetError) {
        throw new Error(`Failed to reset GIF usage: ${gifsResetError.message}`);
      }

      console.log('✅ Reset GIF usage statistics');

      const result = {
        success: true,
        message: 'Testing data cleared successfully',
        deleted: {
          estimates: estimatesCount || 0,
          poll_logs: pollLogsCount || 0,
          webhook_logs: webhookLogsCount || 0,
        },
        reset: {
          recently_processed_ids: 'Cleared',
          last_poll_timestamp: `Reset to ${startOfToday.toISOString()}`,
          message_usage: 'Reset to 0',
          gif_usage: 'Reset to 0',
        },
        preserved: [
          'celebration_messages (content)',
          'celebration_gifs (content)',
          'salespeople',
          'webhooks',
          'app_state settings',
        ],
      };

      console.log('🎉 Clear testing data operation completed successfully');

      return createResponse(200, result);
    }

    // Method not allowed
    return createResponse(405, { error: 'Method not allowed' });
  } catch (error: any) {
    console.error('❌ Error in clear-test-data function:', error);

    return createResponse(500, {
      error: error.message || 'Internal server error',
    });
  }
};
