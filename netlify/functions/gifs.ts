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

// Simple URL validation
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Celebration GIFs API
 * GET / - List all GIFs
 * POST / - Create new GIF
 * PATCH /:id - Update GIF
 * DELETE /:id - Delete GIF (validates minimum count)
 */
export const handler: Handler = async (event, _context) => {
  const { httpMethod, path, body } = event;

  // Extract ID from path
  const pathParts = path.split('/');
  const id = pathParts[pathParts.length - 1] !== 'gifs' ? pathParts[pathParts.length - 1] : null;

  try {
    // GET / - List all GIFs
    if (httpMethod === 'GET' && !id) {
      const { data, error } = await supabase
        .from('celebration_gifs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch GIFs: ${error.message}`);
      }

      return createResponse(200, data);
    }

    // GET /:id - Get one GIF
    if (httpMethod === 'GET' && id) {
      const { data, error } = await supabase
        .from('celebration_gifs')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return createResponse(404, { error: 'GIF not found' });
        }
        throw new Error(`Failed to fetch GIF: ${error.message}`);
      }

      return createResponse(200, data);
    }

    // POST / - Create new GIF
    if (httpMethod === 'POST') {
      if (!body) {
        return createResponse(400, { error: 'Request body is required' });
      }

      const newGif = JSON.parse(body);

      // Validation
      if (!newGif.name || !newGif.url || !newGif.tags) {
        return createResponse(400, {
          error: 'name, url, and tags are required',
        });
      }

      if (!isValidUrl(newGif.url)) {
        return createResponse(400, {
          error: 'url must be a valid URL',
        });
      }

      if (!Array.isArray(newGif.tags) || newGif.tags.length === 0) {
        return createResponse(400, {
          error: 'tags must be a non-empty array',
        });
      }

      // Validate tags contain only 'tgl' and/or 'big_sale'
      const validTags = ['tgl', 'big_sale'];
      const invalidTags = newGif.tags.filter((tag: string) => !validTags.includes(tag));
      if (invalidTags.length > 0) {
        return createResponse(400, {
          error: `Invalid tags: ${invalidTags.join(', ')}. Allowed tags: tgl, big_sale`,
        });
      }

      const { data, error } = await supabase
        .from('celebration_gifs')
        .insert({
          name: newGif.name,
          url: newGif.url,
          tags: newGif.tags,
          is_active: newGif.is_active !== undefined ? newGif.is_active : true,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create GIF: ${error.message}`);
      }

      console.log(`✅ Created new GIF: ${newGif.name}`);

      return createResponse(201, data);
    }

    // PATCH /:id - Update GIF
    if (httpMethod === 'PATCH' && id) {
      if (!body) {
        return createResponse(400, { error: 'Request body is required' });
      }

      const updates = JSON.parse(body);

      // Validate URL if provided
      if (updates.url && !isValidUrl(updates.url)) {
        return createResponse(400, {
          error: 'url must be a valid URL',
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
            error: `Invalid tags: ${invalidTags.join(', ')}. Allowed tags: tgl, big_sale`,
          });
        }
      }

      // Only allow updating specific fields
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
        .from('celebration_gifs')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return createResponse(404, { error: 'GIF not found' });
        }
        throw new Error(`Failed to update GIF: ${error.message}`);
      }

      console.log(`✅ Updated GIF ${id}`);

      return createResponse(200, data);
    }

    // DELETE /:id - Delete GIF
    if (httpMethod === 'DELETE' && id) {
      // Count remaining active GIFs
      const { count } = await supabase
        .from('celebration_gifs')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      if (count !== null && count <= 1) {
        return createResponse(400, {
          error: 'Cannot delete the last active GIF. At least one GIF must remain.',
        });
      }

      const { error } = await supabase.from('celebration_gifs').delete().eq('id', id);

      if (error) {
        throw new Error(`Failed to delete GIF: ${error.message}`);
      }

      console.log(`✅ Deleted GIF ${id}`);

      return createResponse(200, { success: true, message: 'GIF deleted' });
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
    console.error('❌ Error in gifs function:', error);

    return createResponse(500, {
      error: error.message || 'Internal server error',
    });
  }
};
