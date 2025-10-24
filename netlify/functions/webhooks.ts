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

// Validate Google Chat webhook URL format
function isValidWebhookUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname === 'chat.googleapis.com' && urlObj.pathname.startsWith('/v1/spaces/');
  } catch {
    return false;
  }
}

// Test webhook by sending a test message
async function testWebhook(url: string): Promise<{ success: boolean; error?: string }> {
  try {
    const testMessage = {
      text: '🧪 *Test from Shout Out*\n\nThis webhook is working correctly! You\'ll receive celebration messages here.',
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testMessage),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Webhook test failed: ${response.status} - ${errorText}`,
      };
    }

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to send test message: ${error.message}`,
    };
  }
}

/**
 * Webhooks API
 * GET / - List all webhooks with delivery stats
 * POST / - Create webhook (validates and tests)
 * PATCH /:id - Update webhook
 * DELETE /:id - Delete webhook
 * POST /:id/test - Test webhook
 */
export const handler: Handler = async (event, _context) => {
  const { httpMethod, path, body } = event;

  // Extract ID and action from path
  const pathParts = path.split('/').filter(Boolean);
  const webhooksIndex = pathParts.indexOf('webhooks');
  const id = pathParts[webhooksIndex + 1];
  const action = pathParts[webhooksIndex + 2]; // 'test' action

  try {
    // GET / - List all webhooks
    if (httpMethod === 'GET' && !id) {
      const { data: webhooks, error } = await supabase
        .from('webhooks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch webhooks: ${error.message}`);
      }

      // Fetch delivery stats for each webhook
      const webhooksWithStats = await Promise.all(
        (webhooks || []).map(async (webhook) => {
          const { count: totalDeliveries } = await supabase
            .from('webhook_logs')
            .select('*', { count: 'exact', head: true })
            .eq('webhook_id', webhook.id);

          const { count: successfulDeliveries } = await supabase
            .from('webhook_logs')
            .select('*', { count: 'exact', head: true })
            .eq('webhook_id', webhook.id)
            .eq('status', 'success');

          const { data: lastDelivery } = await supabase
            .from('webhook_logs')
            .select('sent_at, status')
            .eq('webhook_id', webhook.id)
            .order('sent_at', { ascending: false })
            .limit(1)
            .single();

          return {
            ...webhook,
            stats: {
              total_deliveries: totalDeliveries || 0,
              successful_deliveries: successfulDeliveries || 0,
              last_delivery: lastDelivery || null,
            },
          };
        })
      );

      return createResponse(200, webhooksWithStats);
    }

    // GET /:id - Get one webhook
    if (httpMethod === 'GET' && id && !action) {
      const { data, error } = await supabase
        .from('webhooks')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return createResponse(404, { error: 'Webhook not found' });
        }
        throw new Error(`Failed to fetch webhook: ${error.message}`);
      }

      return createResponse(200, data);
    }

    // POST / - Create new webhook
    if (httpMethod === 'POST' && !id) {
      if (!body) {
        return createResponse(400, { error: 'Request body is required' });
      }

      const newWebhook = JSON.parse(body);

      // Validation
      if (!newWebhook.name || !newWebhook.url || !newWebhook.tags) {
        return createResponse(400, {
          error: 'name, url, and tags are required',
        });
      }

      if (!isValidWebhookUrl(newWebhook.url)) {
        return createResponse(400, {
          error: 'Invalid Google Chat webhook URL. Must be https://chat.googleapis.com/v1/spaces/...',
        });
      }

      if (!Array.isArray(newWebhook.tags) || newWebhook.tags.length === 0) {
        return createResponse(400, {
          error: 'tags must be a non-empty array',
        });
      }

      const validTags = ['tgl', 'big_sale'];
      const invalidTags = newWebhook.tags.filter((tag: string) => !validTags.includes(tag));
      if (invalidTags.length > 0) {
        return createResponse(400, {
          error: `Invalid tags: ${invalidTags.join(', ')}. Allowed: tgl, big_sale`,
        });
      }

      // Test webhook before saving
      const testResult = await testWebhook(newWebhook.url);
      if (!testResult.success) {
        return createResponse(400, {
          error: testResult.error,
          hint: 'Webhook test failed. Please verify the URL is correct and the webhook is active in Google Chat.',
        });
      }

      const { data, error } = await supabase
        .from('webhooks')
        .insert({
          name: newWebhook.name,
          url: newWebhook.url,
          tags: newWebhook.tags,
          is_active: newWebhook.is_active !== undefined ? newWebhook.is_active : true,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create webhook: ${error.message}`);
      }

      console.log(`✅ Created new webhook: ${newWebhook.name}`);

      return createResponse(201, data);
    }

    // POST /:id/test - Test webhook
    if (httpMethod === 'POST' && id && action === 'test') {
      const { data: webhook } = await supabase
        .from('webhooks')
        .select('url')
        .eq('id', id)
        .single();

      if (!webhook) {
        return createResponse(404, { error: 'Webhook not found' });
      }

      const testResult = await testWebhook(webhook.url);

      if (testResult.success) {
        return createResponse(200, {
          success: true,
          message: 'Test message sent successfully!',
        });
      } else {
        return createResponse(400, {
          success: false,
          error: testResult.error,
        });
      }
    }

    // PATCH /:id - Update webhook
    if (httpMethod === 'PATCH' && id && !action) {
      if (!body) {
        return createResponse(400, { error: 'Request body is required' });
      }

      const updates = JSON.parse(body);

      // Validate URL if provided
      if (updates.url && !isValidWebhookUrl(updates.url)) {
        return createResponse(400, {
          error: 'Invalid Google Chat webhook URL',
        });
      }

      // Validate tags if provided
      if (updates.tags) {
        if (!Array.isArray(updates.tags) || updates.tags.length === 0) {
          return createResponse(400, {
            error: 'tags must be a non-empty array',
          });
        }

        const validTags = ['tgl', 'big_sale'];
        const invalidTags = updates.tags.filter((tag: string) => !validTags.includes(tag));
        if (invalidTags.length > 0) {
          return createResponse(400, {
            error: `Invalid tags: ${invalidTags.join(', ')}`,
          });
        }
      }

      const allowedFields = ['name', 'url', 'tags', 'is_active'];
      const updateData: any = {};

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateData[field] = updates[field];
        }
      }

      if (Object.keys(updateData).length === 0) {
        return createResponse(400, {
          error: 'No valid fields to update',
          allowedFields,
        });
      }

      const { data, error } = await supabase
        .from('webhooks')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return createResponse(404, { error: 'Webhook not found' });
        }
        throw new Error(`Failed to update webhook: ${error.message}`);
      }

      console.log(`✅ Updated webhook ${id}`);

      return createResponse(200, data);
    }

    // DELETE /:id - Delete webhook
    if (httpMethod === 'DELETE' && id) {
      const { error } = await supabase.from('webhooks').delete().eq('id', id);

      if (error) {
        throw new Error(`Failed to delete webhook: ${error.message}`);
      }

      console.log(`✅ Deleted webhook ${id}`);

      return createResponse(200, { success: true, message: 'Webhook deleted' });
    }

    // OPTIONS - CORS preflight
    if (httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: '',
      };
    }

    // Method not allowed
    return createResponse(405, { error: 'Method not allowed' });
  } catch (error: any) {
    console.error('❌ Error in webhooks function:', error);

    return createResponse(500, {
      error: error.message || 'Internal server error',
    });
  }
};
