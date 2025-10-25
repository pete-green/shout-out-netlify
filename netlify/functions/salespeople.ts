import { Handler, HandlerResponse } from '@netlify/functions';
import { supabase } from './lib/supabase';
import { BUSINESS_UNITS } from './lib/constants';

// Helper to create consistent response objects
function createResponse(statusCode: number, body: any, additionalHeaders?: Record<string, string>): HandlerResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...additionalHeaders,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

/**
 * Salespeople API endpoint
 * GET / - List all salespeople
 * GET /:id - Get one salesperson
 * PATCH /:id - Update one salesperson (business_unit, headshot_url, gender, is_active)
 */
export const handler: Handler = async (event, _context) => {
  const { httpMethod, path, body } = event;

  // Extract ID from path if present (e.g., /.netlify/functions/salespeople/123)
  const pathParts = path.split('/');
  const id = pathParts[pathParts.length - 1] !== 'salespeople' ? pathParts[pathParts.length - 1] : null;

  try {
    // GET / - List all salespeople
    if (httpMethod === 'GET' && !id) {
      const { data, error } = await supabase
        .from('salespeople')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch salespeople: ${error.message}`);
      }

      return createResponse(200, data);
    }

    // GET /:id - Get one salesperson
    if (httpMethod === 'GET' && id) {
      const { data, error } = await supabase
        .from('salespeople')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return createResponse(404, { error: 'Salesperson not found' });
        }
        throw new Error(`Failed to fetch salesperson: ${error.message}`);
      }

      return createResponse(200, data);
    }

    // PATCH /:id - Update one salesperson
    if (httpMethod === 'PATCH' && id) {
      if (!body) {
        return createResponse(400, { error: 'Request body is required' });
      }

      const updates = JSON.parse(body);

      // Validate business_unit if provided
      if (updates.business_unit && !BUSINESS_UNITS.includes(updates.business_unit)) {
        return createResponse(400, {
          error: 'Invalid business_unit',
          allowedValues: BUSINESS_UNITS,
        });
      }

      // Only allow updating specific fields
      const allowedFields = ['business_unit', 'headshot_url', 'gender', 'is_active'];
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

      // Update the salesperson
      const { data, error } = await supabase
        .from('salespeople')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return createResponse(404, { error: 'Salesperson not found' });
        }
        throw new Error(`Failed to update salesperson: ${error.message}`);
      }

      console.log(`✅ Updated salesperson ${id}:`, updateData);

      return createResponse(200, data);
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
    console.error('❌ Error in salespeople function:', error);

    return createResponse(500, {
      error: error.message || 'Internal server error',
    });
  }
};
