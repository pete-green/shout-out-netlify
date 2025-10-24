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
 * Celebration Messages API
 * GET / - List all messages
 * POST / - Create new message
 * PATCH /:id - Update message
 * DELETE /:id - Delete message (validates minimum count)
 */
export const handler: Handler = async (event, _context) => {
  const { httpMethod, path, body } = event;

  // Extract ID from path
  const pathParts = path.split('/');
  const id = pathParts[pathParts.length - 1] !== 'messages' ? pathParts[pathParts.length - 1] : null;

  try {
    // GET / - List all messages
    if (httpMethod === 'GET' && !id) {
      const { data, error } = await supabase
        .from('celebration_messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch messages: ${error.message}`);
      }

      return createResponse(200, data);
    }

    // GET /:id - Get one message
    if (httpMethod === 'GET' && id) {
      const { data, error } = await supabase
        .from('celebration_messages')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return createResponse(404, { error: 'Message not found' });
        }
        throw new Error(`Failed to fetch message: ${error.message}`);
      }

      return createResponse(200, data);
    }

    // POST / - Create new message
    if (httpMethod === 'POST') {
      if (!body) {
        return createResponse(400, { error: 'Request body is required' });
      }

      const newMessage = JSON.parse(body);

      // Validation
      if (!newMessage.message_text || !newMessage.category) {
        return createResponse(400, {
          error: 'message_text and category are required',
        });
      }

      if (newMessage.message_text.length > 500) {
        return createResponse(400, {
          error: 'message_text must be 500 characters or less',
        });
      }

      if (!['big_sale', 'tgl'].includes(newMessage.category)) {
        return createResponse(400, {
          error: 'category must be either "big_sale" or "tgl"',
        });
      }

      const { data, error } = await supabase
        .from('celebration_messages')
        .insert({
          message_text: newMessage.message_text,
          category: newMessage.category,
          is_active: newMessage.is_active !== undefined ? newMessage.is_active : true,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create message: ${error.message}`);
      }

      console.log(`✅ Created new ${newMessage.category} message`);

      return createResponse(201, data);
    }

    // PATCH /:id - Update message
    if (httpMethod === 'PATCH' && id) {
      if (!body) {
        return createResponse(400, { error: 'Request body is required' });
      }

      const updates = JSON.parse(body);

      // Validate message_text length if provided
      if (updates.message_text && updates.message_text.length > 500) {
        return createResponse(400, {
          error: 'message_text must be 500 characters or less',
        });
      }

      // Validate category if provided
      if (updates.category && !['big_sale', 'tgl'].includes(updates.category)) {
        return createResponse(400, {
          error: 'category must be either "big_sale" or "tgl"',
        });
      }

      // Only allow updating specific fields
      const allowedFields = ['message_text', 'category', 'is_active'];
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
        .from('celebration_messages')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return createResponse(404, { error: 'Message not found' });
        }
        throw new Error(`Failed to update message: ${error.message}`);
      }

      console.log(`✅ Updated message ${id}`);

      return createResponse(200, data);
    }

    // DELETE /:id - Delete message
    if (httpMethod === 'DELETE' && id) {
      // First, check if this is the last message in its category
      const { data: messageToDelete } = await supabase
        .from('celebration_messages')
        .select('category')
        .eq('id', id)
        .single();

      if (!messageToDelete) {
        return createResponse(404, { error: 'Message not found' });
      }

      // Count remaining messages in this category
      const { count } = await supabase
        .from('celebration_messages')
        .select('*', { count: 'exact', head: true })
        .eq('category', messageToDelete.category)
        .eq('is_active', true);

      if (count !== null && count <= 1) {
        return createResponse(400, {
          error: `Cannot delete the last active ${messageToDelete.category} message. At least one message must remain.`,
        });
      }

      const { error } = await supabase
        .from('celebration_messages')
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(`Failed to delete message: ${error.message}`);
      }

      console.log(`✅ Deleted message ${id}`);

      return createResponse(200, { success: true, message: 'Message deleted' });
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
    console.error('❌ Error in messages function:', error);

    return createResponse(500, {
      error: error.message || 'Internal server error',
    });
  }
};
