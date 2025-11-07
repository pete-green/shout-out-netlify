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
 * Non-Work Days API
 * Manages holidays and other non-work days
 *
 * GET /?year=2025 - List all non-work days for a year
 * GET /:id - Get specific non-work day
 * POST / - Create new non-work day
 * PATCH /:id - Update non-work day
 * DELETE /:id - Delete non-work day
 */
export const handler: Handler = async (event, _context) => {
  const { httpMethod, queryStringParameters, path } = event;

  try {
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

    // Extract ID from path if present
    const pathParts = path?.split('/').filter(Boolean) || [];
    const id = pathParts[pathParts.length - 1] !== 'non-work-days' ? pathParts[pathParts.length - 1] : null;

    // GET - List non-work days or get specific one
    if (httpMethod === 'GET') {
      // Get specific non-work day by ID
      if (id && !isNaN(Number(id))) {
        const { data, error } = await supabase
          .from('non_work_days')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return createResponse(404, { error: 'Non-work day not found' });
          }
          throw error;
        }

        return createResponse(200, data);
      }

      // List non-work days for a year
      const year = queryStringParameters?.year;

      if (!year) {
        return createResponse(400, {
          error: 'year query parameter is required',
          example: '?year=2025'
        });
      }

      const { data, error } = await supabase
        .from('non_work_days')
        .select('*')
        .eq('year', parseInt(year))
        .order('date', { ascending: true });

      if (error) {
        throw error;
      }

      return createResponse(200, data || []);
    }

    // POST - Create new non-work day
    if (httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { date, name } = body;

      if (!date || !name) {
        return createResponse(400, {
          error: 'date and name are required',
          example: { date: '2025-12-25', name: 'Christmas Day' }
        });
      }

      // Extract year from date
      const year = new Date(date).getFullYear();

      const { data, error } = await supabase
        .from('non_work_days')
        .insert({
          date,
          name,
          year,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // Unique violation
          return createResponse(409, { error: 'A non-work day already exists for this date' });
        }
        throw error;
      }

      return createResponse(201, data);
    }

    // PATCH - Update non-work day
    if (httpMethod === 'PATCH') {
      if (!id || isNaN(Number(id))) {
        return createResponse(400, { error: 'Valid ID is required in path' });
      }

      const body = JSON.parse(event.body || '{}');
      const { date, name, is_active } = body;

      const updates: any = {};
      if (date !== undefined) {
        updates.date = date;
        updates.year = new Date(date).getFullYear();
      }
      if (name !== undefined) updates.name = name;
      if (is_active !== undefined) updates.is_active = is_active;

      if (Object.keys(updates).length === 0) {
        return createResponse(400, { error: 'At least one field (date, name, is_active) is required' });
      }

      const { data, error } = await supabase
        .from('non_work_days')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return createResponse(404, { error: 'Non-work day not found' });
        }
        if (error.code === '23505') { // Unique violation
          return createResponse(409, { error: 'A non-work day already exists for this date' });
        }
        throw error;
      }

      return createResponse(200, data);
    }

    // DELETE - Remove non-work day
    if (httpMethod === 'DELETE') {
      if (!id || isNaN(Number(id))) {
        return createResponse(400, { error: 'Valid ID is required in path' });
      }

      const { error } = await supabase
        .from('non_work_days')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      return createResponse(204, '');
    }

    // Method not allowed
    return createResponse(405, { error: 'Method not allowed' });

  } catch (error: any) {
    console.error('❌ Error in non-work-days function:', error);

    return createResponse(500, {
      error: error.message || 'Internal server error',
    });
  }
};
