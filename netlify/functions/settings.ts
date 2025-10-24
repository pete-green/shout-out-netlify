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
 * Settings API
 * GET / - Get all app settings
 * PATCH / - Update one or more settings
 */
export const handler: Handler = async (event, _context) => {
  const { httpMethod, body } = event;

  try {
    // GET / - Get all settings
    if (httpMethod === 'GET') {
      const { data: settings, error } = await supabase
        .from('app_state')
        .select('key, value')
        .in('key', ['big_sale_threshold', 'tgl_option_name', 'polling_interval_minutes']);

      if (error) {
        throw new Error(`Failed to fetch settings: ${error.message}`);
      }

      // Convert array to object for easier frontend consumption
      const settingsObj: any = {};
      (settings || []).forEach((setting) => {
        let value = setting.value;

        // Parse numeric values
        if (setting.key === 'big_sale_threshold' || setting.key === 'polling_interval_minutes') {
          value = typeof value === 'string' ? parseInt(value, 10) : value;
        }

        // Parse string values (remove quotes if JSON string)
        if (setting.key === 'tgl_option_name' && typeof value === 'string') {
          try {
            value = JSON.parse(value);
          } catch {
            // Keep as-is if not JSON
          }
        }

        settingsObj[setting.key] = value;
      });

      return createResponse(200, settingsObj);
    }

    // PATCH / - Update settings
    if (httpMethod === 'PATCH') {
      if (!body) {
        return createResponse(400, { error: 'Request body is required' });
      }

      const updates = JSON.parse(body);
      const allowedSettings = ['big_sale_threshold', 'tgl_option_name', 'polling_interval_minutes'];
      const results: any = {};

      for (const key of Object.keys(updates)) {
        if (!allowedSettings.includes(key)) {
          return createResponse(400, {
            error: `Invalid setting: ${key}`,
            allowedSettings,
          });
        }

        let value = updates[key];

        // Validation
        if (key === 'big_sale_threshold') {
          const threshold = typeof value === 'string' ? parseInt(value, 10) : value;
          if (isNaN(threshold) || threshold <= 0) {
            return createResponse(400, {
              error: 'big_sale_threshold must be a positive number',
            });
          }
          value = threshold.toString();
        }

        if (key === 'tgl_option_name') {
          if (typeof value !== 'string' || value.trim().length === 0) {
            return createResponse(400, {
              error: 'tgl_option_name cannot be empty',
            });
          }
          value = JSON.stringify(value); // Store as JSON string
        }

        if (key === 'polling_interval_minutes') {
          const interval = typeof value === 'string' ? parseInt(value, 10) : value;
          if (isNaN(interval) || interval < 1 || interval > 60) {
            return createResponse(400, {
              error: 'polling_interval_minutes must be between 1 and 60',
            });
          }
          value = interval.toString();
        }

        // Update in database
        const { error } = await supabase
          .from('app_state')
          .update({
            value,
            updated_at: new Date().toISOString(),
          })
          .eq('key', key);

        if (error) {
          throw new Error(`Failed to update ${key}: ${error.message}`);
        }

        results[key] = 'updated';
        console.log(`✅ Updated setting: ${key} = ${value}`);
      }

      return createResponse(200, {
        success: true,
        updated: results,
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
    console.error('❌ Error in settings function:', error);

    return createResponse(500, {
      error: error.message || 'Internal server error',
    });
  }
};
