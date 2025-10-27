import { Handler, HandlerResponse } from '@netlify/functions';
import { supabase } from './lib/supabase';

/**
 * Celebrate Today's TGLs Function
 *
 * Reads TGLs from the database that were sold today and sends celebrations for them.
 * Does NOT re-poll ServiceTitan - only processes existing database records.
 *
 * This is useful for sending celebrations for TGLs that were missed due to bugs,
 * or for re-sending celebrations after fixing TGL detection logic.
 */

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
 * Get gender-appropriate pronouns
 */
function getPronouns(gender: string | null): { subjective: string; possessive: string; objective: string; contraction: string } {
  switch (gender?.toLowerCase()) {
    case 'male':
      return { subjective: 'he', possessive: 'his', objective: 'him', contraction: "he's" };
    case 'female':
      return { subjective: 'she', possessive: 'her', objective: 'her', contraction: "she's" };
    default:
      return { subjective: 'they', possessive: 'their', objective: 'them', contraction: "they've" };
  }
}

/**
 * Send celebration message to webhooks
 */
async function sendToWebhooks(
  message: string,
  gifUrl: string,
  celebrationType: 'tgl' | 'big_sale',
  estimateId: string
) {
  const { data: webhooks } = await supabase
    .from('webhooks')
    .select('id, url')
    .contains('tags', [celebrationType])
    .eq('is_active', true);

  if (!webhooks || webhooks.length === 0) {
    console.log(`⚠️ No active webhooks configured for ${celebrationType}`);
    return;
  }

  for (const webhook of webhooks) {
    try {
      const payload = {
        cardsV2: [
          {
            cardId: `celebration-${estimateId}`,
            card: {
              sections: [
                {
                  widgets: [
                    {
                      textParagraph: {
                        text: message,
                      },
                    },
                  ],
                },
                {
                  widgets: [
                    {
                      image: {
                        imageUrl: gifUrl,
                        altText: `${celebrationType} celebration`,
                        onClick: {
                          openLink: {
                            url: gifUrl,
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      };

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(`✅ Sent ${celebrationType} to webhook ${webhook.id}`);

        await supabase.from('webhook_logs').insert({
          webhook_id: webhook.id,
          celebration_type: celebrationType,
          status: 'success',
          estimate_id: estimateId,
        });
      } else {
        const errorText = await response.text();
        console.error(`❌ Failed to send to webhook ${webhook.id}: ${response.status}`);

        await supabase.from('webhook_logs').insert({
          webhook_id: webhook.id,
          celebration_type: celebrationType,
          status: 'failed',
          error_message: `HTTP ${response.status}: ${errorText}`,
          estimate_id: estimateId,
        });
      }
    } catch (error: any) {
      console.error(`❌ Error sending to webhook ${webhook.id}:`, error.message);

      await supabase.from('webhook_logs').insert({
        webhook_id: webhook.id,
        celebration_type: celebrationType,
        status: 'failed',
        error_message: error.message,
        estimate_id: estimateId,
      });
    }
  }
}

/**
 * Weighted random selection based on recency
 */
function selectWithRecencyWeight<T extends { last_used_at: string | null; use_count: number }>(
  items: T[]
): T | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];

  const now = Date.now();
  const weights = items.map((item) => {
    if (!item.last_used_at) return 10;

    const hoursSinceUse =
      (now - new Date(item.last_used_at).getTime()) / (1000 * 60 * 60);

    if (hoursSinceUse > 168) return 8;
    if (hoursSinceUse > 72) return 6;
    if (hoursSinceUse > 24) return 4;
    if (hoursSinceUse > 12) return 2;
    return 1;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return items[i];
    }
  }

  return items[items.length - 1];
}

/**
 * Generate TGL celebration message
 */
async function generateMessage(
  salesperson: string,
  amount: number,
  customerName: string
): Promise<{ message: string; gifUrl: string; type: 'tgl' }> {
  const category = 'tgl';
  const tag = 'tgl';

  // Fetch person-specific messages
  const { data: personMessages } = await supabase
    .from('celebration_messages')
    .select('id, message_text, last_used_at, last_used_for, use_count, paired_gif_id')
    .eq('category', category)
    .eq('is_active', true)
    .eq('assigned_to_salesperson', salesperson);

  console.log(`🔍 Found ${personMessages?.length || 0} person-specific messages for ${salesperson}`);

  const availablePersonMessages = (personMessages || []).filter((msg) => {
    if (!msg.last_used_for || msg.last_used_for !== salesperson) return true;
    if (!msg.last_used_at) return true;

    const hoursSince =
      (Date.now() - new Date(msg.last_used_at).getTime()) / (1000 * 60 * 60);
    return hoursSince > 24;
  });

  console.log(`✅ ${availablePersonMessages.length} person-specific messages available`);

  // Fetch generic messages
  const { data: genericMessages } = await supabase
    .from('celebration_messages')
    .select('id, message_text, last_used_at, last_used_for, use_count, paired_gif_id')
    .eq('category', category)
    .eq('is_active', true)
    .is('assigned_to_salesperson', null);

  console.log(`🔍 Found ${genericMessages?.length || 0} generic messages`);

  // Build message pool
  let messagePool: any[] = [];

  if (availablePersonMessages.length > 0 && genericMessages && genericMessages.length > 0) {
    const personAvgUse = availablePersonMessages.reduce((sum, m) => sum + m.use_count, 0) / availablePersonMessages.length;
    const genericAvgUse = genericMessages.reduce((sum, m) => sum + m.use_count, 0) / genericMessages.length;

    if (personAvgUse <= genericAvgUse) {
      messagePool = availablePersonMessages;
    } else {
      messagePool = [...availablePersonMessages, ...genericMessages];
    }
  } else if (availablePersonMessages.length > 0) {
    messagePool = availablePersonMessages;
  } else {
    messagePool = genericMessages || [];
  }

  // Fetch person-specific GIFs
  const { data: personGifs } = await supabase
    .from('celebration_gifs')
    .select('id, url, last_used_at, last_used_for, use_count')
    .contains('tags', [tag])
    .eq('is_active', true)
    .eq('assigned_to_salesperson', salesperson);

  const availablePersonGifs = (personGifs || []).filter((gif) => {
    if (!gif.last_used_for || gif.last_used_for !== salesperson) return true;
    if (!gif.last_used_at) return true;

    const hoursSince =
      (Date.now() - new Date(gif.last_used_at).getTime()) / (1000 * 60 * 60);
    return hoursSince > 24;
  });

  // Fetch generic GIFs
  const { data: genericGifs } = await supabase
    .from('celebration_gifs')
    .select('id, url, last_used_at, last_used_for, use_count')
    .contains('tags', [tag])
    .eq('is_active', true)
    .is('assigned_to_salesperson', null);

  // Build GIF pool
  let gifPool: any[] = [];

  if (availablePersonGifs.length > 0 && genericGifs && genericGifs.length > 0) {
    const personAvgUse = availablePersonGifs.reduce((sum, g) => sum + g.use_count, 0) / availablePersonGifs.length;
    const genericAvgUse = genericGifs.reduce((sum, g) => sum + g.use_count, 0) / genericGifs.length;

    if (personAvgUse <= genericAvgUse) {
      gifPool = availablePersonGifs;
    } else {
      gifPool = [...availablePersonGifs, ...genericGifs];
    }
  } else if (availablePersonGifs.length > 0) {
    gifPool = availablePersonGifs;
  } else {
    gifPool = genericGifs || [];
  }

  // Fallback if no content found
  if (messagePool.length === 0) {
    console.warn(`No active ${category} messages found, using fallback`);
    const fallbackMessage = `${salesperson} just generated a TGL at ${customerName}'s house! Awesome work ${salesperson}!!!`;
    return {
      message: fallbackMessage,
      gifUrl: gifPool.length > 0 ? gifPool[0].url : '',
      type: category,
    };
  }

  // Select message
  const selectedMessage = selectWithRecencyWeight(messagePool);
  if (!selectedMessage) {
    throw new Error('Failed to select message');
  }

  // Select GIF (check for paired GIF first)
  let selectedGif = null;

  if (selectedMessage.paired_gif_id) {
    const { data: pairedGif } = await supabase
      .from('celebration_gifs')
      .select('id, url, last_used_at, last_used_for, use_count, is_active')
      .eq('id', selectedMessage.paired_gif_id)
      .single();

    if (pairedGif && pairedGif.is_active) {
      selectedGif = pairedGif;
    }
  }

  if (!selectedGif) {
    selectedGif = selectWithRecencyWeight(gifPool);
  }

  // Update usage tracking
  await supabase
    .from('celebration_messages')
    .update({
      last_used_at: new Date().toISOString(),
      last_used_for: salesperson,
      use_count: selectedMessage.use_count + 1,
    })
    .eq('id', selectedMessage.id);

  if (selectedGif) {
    await supabase
      .from('celebration_gifs')
      .update({
        last_used_at: new Date().toISOString(),
        last_used_for: salesperson,
        use_count: selectedGif.use_count + 1,
      })
      .eq('id', selectedGif.id);
  }

  // Fetch salesperson's gender for pronoun replacement
  const { data: salespersonData } = await supabase
    .from('salespeople')
    .select('gender')
    .eq('name', salesperson)
    .single();

  const pronouns = getPronouns(salespersonData?.gender || null);

  // Format message
  const amountFormatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const message = selectedMessage.message_text
    .replace(/{name}/g, salesperson)
    .replace(/{amount}/g, amountFormatted)
    .replace(/{he\/she}/g, pronouns.subjective)
    .replace(/{his\/her}/g, pronouns.possessive)
    .replace(/{him\/her}/g, pronouns.objective)
    .replace(/{he's\/she's}/g, pronouns.contraction);

  const gifUrl = selectedGif ? selectedGif.url : '';

  return {
    message,
    gifUrl,
    type: category,
  };
}

/**
 * Main handler
 */
export const handler: Handler = async (event, _context) => {
  const { httpMethod } = event;

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

  const startTime = Date.now();

  try {
    console.log('🎉 Starting celebrate-today-tgls function...');

    // Get today's date range (midnight to midnight)
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    console.log(`📅 Date range: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

    // Query database for TGLs sold today
    const { data: tgls, error: queryError } = await supabase
      .from('estimates')
      .select('*')
      .eq('is_tgl', true)
      .gte('sold_at', startOfDay.toISOString())
      .lte('sold_at', endOfDay.toISOString())
      .order('sold_at', { ascending: true });

    if (queryError) {
      throw new Error(`Failed to query TGLs: ${queryError.message}`);
    }

    console.log(`✅ Found ${tgls?.length || 0} TGLs sold today`);

    if (!tgls || tgls.length === 0) {
      return createResponse(200, {
        success: true,
        message: 'No TGLs found for today',
        dateRange: {
          start: startOfDay.toISOString(),
          end: endOfDay.toISOString(),
        },
        tglsFound: 0,
        celebrationsSent: 0,
        durationMs: Date.now() - startTime,
      });
    }

    let celebrationsSent = 0;
    const errors: string[] = [];

    // Process each TGL
    for (const tgl of tgls) {
      const estimateId = tgl.estimate_id;

      try {
        console.log(`\n🎯 Processing TGL: ${estimateId}`);
        console.log(`   Salesperson: ${tgl.salesperson}`);
        console.log(`   Amount: $${tgl.amount}`);
        console.log(`   Customer: ${tgl.customer_name}`);

        // Check if we've already sent a TGL notification for this estimate
        const { data: existingNotifications } = await supabase
          .from('notifications')
          .select('id')
          .eq('estimate_id', tgl.id)
          .eq('type', 'tgl');

        if (existingNotifications && existingNotifications.length > 0) {
          console.log(`   ⏭️  Already celebrated - skipping`);
          continue;
        }

        // Generate celebration
        const { message, gifUrl, type } = await generateMessage(
          tgl.salesperson,
          tgl.amount,
          tgl.customer_name
        );

        // Send to webhooks
        await sendToWebhooks(message, gifUrl, type, estimateId);

        // Insert notification record
        const { error: notificationError } = await supabase.from('notifications').insert({
          estimate_id: tgl.id,
          type,
          message,
          gif_url: gifUrl,
          posted_successfully: false,
        });

        if (notificationError) {
          console.error(`   ❌ Failed to insert notification:`, notificationError);
          errors.push(`${estimateId}: ${notificationError.message}`);
        } else {
          celebrationsSent++;
          console.log(`   ✅ Celebration sent!`);
        }

      } catch (error: any) {
        console.error(`   ❌ Error processing TGL ${estimateId}:`, error.message);
        errors.push(`${estimateId}: ${error.message}`);
      }
    }

    const durationMs = Date.now() - startTime;

    console.log('\n✅ ===== CELEBRATION COMPLETE =====');
    console.log(`   TGLs Found: ${tgls.length}`);
    console.log(`   Celebrations Sent: ${celebrationsSent}`);
    console.log(`   Errors: ${errors.length}`);
    console.log(`   Duration: ${(durationMs / 1000).toFixed(2)}s`);

    return createResponse(200, {
      success: true,
      message: 'Today\'s TGLs celebrated',
      dateRange: {
        start: startOfDay.toISOString(),
        end: endOfDay.toISOString(),
      },
      statistics: {
        tglsFound: tgls.length,
        celebrationsSent,
        errorCount: errors.length,
      },
      errors: errors.slice(0, 10),
      durationMs,
    });

  } catch (error: any) {
    console.error('❌ Error in celebrate-today-tgls:', error);

    return createResponse(500, {
      error: error.message || 'Internal server error',
      stack: error.stack,
    });
  }
};
