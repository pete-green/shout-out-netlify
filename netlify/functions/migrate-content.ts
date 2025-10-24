import { Handler } from '@netlify/functions';
import { supabase } from './lib/supabase';
import { BIG_SALE_MESSAGES, BIG_SALE_GIFS, TGL_GIF_URL } from './lib/constants';

/**
 * One-time migration function to populate database with default messages and GIFs
 * Auto-runs on first app load if content_migrated is false
 */
export const handler: Handler = async (_event, _context) => {
  console.log('🔄 Starting content migration...');

  try {
    // Check if already migrated
    const { data: migrationState } = await supabase
      .from('app_state')
      .select('value')
      .eq('key', 'content_migrated')
      .single();

    if (migrationState?.value === true || migrationState?.value === 'true') {
      console.log('⏭️  Content already migrated, skipping');
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Content already migrated',
          skipped: true,
        }),
      };
    }

    let messagesCreated = 0;
    let gifsCreated = 0;

    // Migrate Big Sale messages
    console.log('📝 Migrating Big Sale messages...');
    for (const message of BIG_SALE_MESSAGES) {
      const { error } = await supabase.from('celebration_messages').insert({
        message_text: message,
        category: 'big_sale',
        is_active: true,
      });

      if (error) {
        console.error(`Failed to insert message:`, error);
      } else {
        messagesCreated++;
      }
    }

    // Create TGL message template
    console.log('📝 Creating TGL message template...');
    const tglMessage =
      '{name} just generated a TGL at their customer\'s house! Awesome work {name}!!!';
    const { error: tglError } = await supabase.from('celebration_messages').insert({
      message_text: tglMessage,
      category: 'tgl',
      is_active: true,
    });

    if (tglError) {
      console.error(`Failed to insert TGL message:`, tglError);
    } else {
      messagesCreated++;
    }

    // Migrate Big Sale GIFs
    console.log('🎬 Migrating Big Sale GIFs...');
    for (let i = 0; i < BIG_SALE_GIFS.length; i++) {
      const { error } = await supabase.from('celebration_gifs').insert({
        name: `Big Sale GIF ${i + 1}`,
        url: BIG_SALE_GIFS[i],
        tags: ['big_sale'],
        is_active: true,
      });

      if (error) {
        console.error(`Failed to insert GIF:`, error);
      } else {
        gifsCreated++;
      }
    }

    // Migrate TGL GIF
    console.log('🎬 Migrating TGL GIF...');
    const { error: tglGifError } = await supabase.from('celebration_gifs').insert({
      name: 'TGL Celebration',
      url: TGL_GIF_URL,
      tags: ['tgl'],
      is_active: true,
    });

    if (tglGifError) {
      console.error(`Failed to insert TGL GIF:`, tglGifError);
    } else {
      gifsCreated++;
    }

    // Mark migration as complete
    await supabase
      .from('app_state')
      .update({
        value: 'true',
        updated_at: new Date().toISOString(),
      })
      .eq('key', 'content_migrated');

    console.log(
      `✅ Migration complete: ${messagesCreated} messages, ${gifsCreated} GIFs created`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        messagesCreated,
        gifsCreated,
        message: 'Content migration completed successfully',
      }),
    };
  } catch (error: any) {
    console.error('❌ Error during content migration:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Migration failed',
      }),
    };
  }
};
