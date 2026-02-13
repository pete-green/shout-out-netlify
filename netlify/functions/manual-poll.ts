import { Handler, HandlerResponse } from '@netlify/functions';
import { supabase } from './lib/supabase';
import { getSoldEstimates, getTechnician, getCustomer } from './lib/servicetitan';
import { sendToWebhooks, hasCelebrationBeenSent } from './lib/webhooks';

/**
 * Create response with CORS headers
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

interface EstimateItem {
  skuName: string;
  total: number;
}

interface Estimate {
  id: string;
  name: string;
  soldOn: string;
  soldBy: number;
  customerId: number;
  items: EstimateItem[];
  subtotal: number;
}

/**
 * Format customer name from "LastName, FirstName" to "FirstName LastName"
 */
function formatCustomerName(rawName: string): string {
  if (rawName.indexOf(',') !== -1) {
    const parts = rawName.split(',');
    if (parts.length === 2) {
      const last = parts[0].trim();
      const first = parts[1].trim();
      return `${first} ${last}`;
    }
  }
  return rawName;
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
      // Default to 'they' for 'Other', 'Prefer not to say', or null
      return { subjective: 'they', possessive: 'their', objective: 'them', contraction: "they've" };
  }
}

// sendToWebhooks imported from ./lib/webhooks — single source of truth with built-in dedup

/**
 * Weighted random selection based on recency
 * Items used recently get lower weight, items never used or used long ago get higher weight
 */
function selectWithRecencyWeight<T extends { last_used_at: string | null; use_count: number }>(
  items: T[]
): T | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];

  const now = Date.now();
  const weights = items.map((item) => {
    if (!item.last_used_at) return 10; // Never used = highest weight

    const hoursSinceUse =
      (now - new Date(item.last_used_at).getTime()) / (1000 * 60 * 60);

    if (hoursSinceUse > 168) return 8; // > 1 week
    if (hoursSinceUse > 72) return 6; // > 3 days
    if (hoursSinceUse > 24) return 4; // > 1 day
    if (hoursSinceUse > 12) return 2; // > 12 hours
    return 1; // Recent use = lowest weight
  });

  // Weighted random selection
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < items.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return items[i];
    }
  }

  return items[items.length - 1]; // Fallback
}

/**
 * Generate TGL or Big Sale message from database with smart personalization
 */
async function generateMessage(
  salesperson: string,
  amount: number,
  customerName: string,
  isTGL: boolean
): Promise<{ message: string; gifUrl: string; type: 'tgl' | 'big_sale' }> {
  const category = isTGL ? 'tgl' : 'big_sale';
  const tag = isTGL ? 'tgl' : 'big_sale';

  // 1. Fetch person-specific messages
  const { data: personMessages } = await supabase
    .from('celebration_messages')
    .select('id, message_text, last_used_at, last_used_for, use_count, paired_gif_id')
    .eq('category', category)
    .eq('is_active', true)
    .eq('assigned_to_salesperson', salesperson);

  console.log(`🔍 Found ${personMessages?.length || 0} person-specific messages for ${salesperson}`);

  // Filter out messages used recently for THIS person
  const availablePersonMessages = (personMessages || []).filter((msg) => {
    if (!msg.last_used_for || msg.last_used_for !== salesperson) return true;
    if (!msg.last_used_at) return true;

    const hoursSince =
      (Date.now() - new Date(msg.last_used_at).getTime()) / (1000 * 60 * 60);
    return hoursSince > 24; // 24 hour cooldown per person
  });

  console.log(`✅ ${availablePersonMessages.length} person-specific messages available after cooldown filter`);

  // 2. Fetch generic messages
  const { data: genericMessages } = await supabase
    .from('celebration_messages')
    .select('id, message_text, last_used_at, last_used_for, use_count, paired_gif_id')
    .eq('category', category)
    .eq('is_active', true)
    .is('assigned_to_salesperson', null);

  console.log(`🔍 Found ${genericMessages?.length || 0} generic messages`);

  // 3. Build message pool with smart prioritization
  let messagePool: any[] = [];

  if (availablePersonMessages.length > 0 && genericMessages && genericMessages.length > 0) {
    // Calculate average usage of person-specific vs generic
    const personAvgUse = availablePersonMessages.reduce((sum, m) => sum + m.use_count, 0) / availablePersonMessages.length;
    const genericAvgUse = genericMessages.reduce((sum, m) => sum + m.use_count, 0) / genericMessages.length;

    console.log(`📊 Usage comparison: Person-specific avg=${personAvgUse.toFixed(1)}, Generic avg=${genericAvgUse.toFixed(1)}`);

    // If person-specific usage is less than or equal to generic average, use only person-specific
    // Otherwise, combine pools for variety
    if (personAvgUse <= genericAvgUse) {
      messagePool = availablePersonMessages;
      console.log(`📦 Using person-specific messages only (lower usage)`);
    } else {
      messagePool = [...availablePersonMessages, ...genericMessages];
      console.log(`📦 Combining person-specific and generic messages (person-specific overused)`);
    }
  } else if (availablePersonMessages.length > 0) {
    messagePool = availablePersonMessages;
    console.log(`📦 Using person-specific messages only (no generics available)`);
  } else {
    messagePool = genericMessages || [];
    console.log(`📦 Using generic messages only (no person-specific available)`);
  }

  console.log(`   Pool size: ${messagePool.length}, IDs: ${messagePool.map(m => m.id).join(', ')}`);


  // 4. Fetch person-specific GIFs
  const { data: personGifs } = await supabase
    .from('celebration_gifs')
    .select('id, url, last_used_at, last_used_for, use_count')
    .contains('tags', [tag])
    .eq('is_active', true)
    .eq('assigned_to_salesperson', salesperson);

  console.log(`🔍 Found ${personGifs?.length || 0} person-specific GIFs for ${salesperson}`);

  // Filter out GIFs used recently for THIS person
  const availablePersonGifs = (personGifs || []).filter((gif) => {
    if (!gif.last_used_for || gif.last_used_for !== salesperson) return true;
    if (!gif.last_used_at) return true;

    const hoursSince =
      (Date.now() - new Date(gif.last_used_at).getTime()) / (1000 * 60 * 60);
    return hoursSince > 24; // 24 hour cooldown per person
  });

  console.log(`✅ ${availablePersonGifs.length} person-specific GIFs available after cooldown filter`);

  // 5. Fetch generic GIFs
  const { data: genericGifs } = await supabase
    .from('celebration_gifs')
    .select('id, url, last_used_at, last_used_for, use_count')
    .contains('tags', [tag])
    .eq('is_active', true)
    .is('assigned_to_salesperson', null);

  console.log(`🔍 Found ${genericGifs?.length || 0} generic GIFs`);

  // 6. Build GIF pool with smart prioritization
  let gifPool: any[] = [];

  if (availablePersonGifs.length > 0 && genericGifs && genericGifs.length > 0) {
    // Calculate average usage of person-specific vs generic
    const personAvgUse = availablePersonGifs.reduce((sum, g) => sum + g.use_count, 0) / availablePersonGifs.length;
    const genericAvgUse = genericGifs.reduce((sum, g) => sum + g.use_count, 0) / genericGifs.length;

    console.log(`📊 GIF usage comparison: Person-specific avg=${personAvgUse.toFixed(1)}, Generic avg=${genericAvgUse.toFixed(1)}`);

    // If person-specific usage is less than or equal to generic average, use only person-specific
    // Otherwise, combine pools for variety
    if (personAvgUse <= genericAvgUse) {
      gifPool = availablePersonGifs;
      console.log(`📦 Using person-specific GIFs only (lower usage)`);
    } else {
      gifPool = [...availablePersonGifs, ...genericGifs];
      console.log(`📦 Combining person-specific and generic GIFs (person-specific overused)`);
    }
  } else if (availablePersonGifs.length > 0) {
    gifPool = availablePersonGifs;
    console.log(`📦 Using person-specific GIFs only (no generics available)`);
  } else {
    gifPool = genericGifs || [];
    console.log(`📦 Using generic GIFs only (no person-specific available)`);
  }

  console.log(`   Pool size: ${gifPool.length}, IDs: ${gifPool.map(g => g.id).join(', ')}`);


  // 7. Fallback if no content found
  if (messagePool.length === 0) {
    console.warn(`No active ${category} messages found, using fallback`);
    const fallbackMessage = isTGL
      ? `${salesperson} just generated a TGL at ${customerName}'s house! Awesome work ${salesperson}!!!`
      : `🎉 ${salesperson} just closed a sale of $${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}! Amazing work!`;
    return {
      message: fallbackMessage,
      gifUrl: gifPool.length > 0 ? gifPool[0].url : '',
      type: category,
    };
  }

  if (gifPool.length === 0) {
    console.warn(`No active ${tag} GIFs found`);
  }

  // 8. Select message using weighted random
  const selectedMessage = selectWithRecencyWeight(messagePool);
  if (!selectedMessage) {
    throw new Error('Failed to select message');
  }

  // 9. Check for paired GIF first, then fall back to random selection
  let selectedGif = null;

  if (selectedMessage.paired_gif_id) {
    // Try to fetch the paired GIF
    const { data: pairedGif } = await supabase
      .from('celebration_gifs')
      .select('id, url, last_used_at, last_used_for, use_count, is_active')
      .eq('id', selectedMessage.paired_gif_id)
      .single();

    // Use paired GIF if it exists and is active
    if (pairedGif && pairedGif.is_active) {
      selectedGif = pairedGif;
      console.log(`✨ Using paired GIF #${pairedGif.id} for message #${selectedMessage.id}`);
    } else {
      console.log(`⚠️ Paired GIF #${selectedMessage.paired_gif_id} is inactive or not found, falling back to random selection`);
    }
  }

  // If no paired GIF or paired GIF is inactive, select randomly from pool
  if (!selectedGif) {
    selectedGif = selectWithRecencyWeight(gifPool);
  }

  // 10. Update usage tracking for selected message
  await supabase
    .from('celebration_messages')
    .update({
      last_used_at: new Date().toISOString(),
      last_used_for: salesperson,
      use_count: selectedMessage.use_count + 1,
    })
    .eq('id', selectedMessage.id);

  // 11. Update usage tracking for selected GIF
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

  // 12. Fetch salesperson's gender for pronoun replacement
  const { data: salespersonData } = await supabase
    .from('salespeople')
    .select('gender')
    .eq('name', salesperson)
    .single();

  const pronouns = getPronouns(salespersonData?.gender || null);

  // 13. Format message
  const amountFormatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const message = selectedMessage.message_text
    .replace(/{name}/g, salesperson)
    .replace(/{customer}/g, customerName)
    .replace(/{amount}/g, amountFormatted)
    .replace(/{he\/she}/g, pronouns.subjective)
    .replace(/{his\/her}/g, pronouns.possessive)
    .replace(/{him\/her}/g, pronouns.objective)
    .replace(/{he's\/she's}/g, pronouns.contraction);

  const gifUrl = selectedGif ? selectedGif.url : '';

  console.log(
    `✨ Selected for ${salesperson}: Message #${selectedMessage.id} (used ${selectedMessage.use_count} times), GIF #${selectedGif?.id || 'none'}`
  );

  return {
    message,
    gifUrl,
    type: category,
  };
}

/**
 * Main polling handler
 */
export const handler: Handler = async (event, _context) => {
  const { httpMethod } = event;

  // Handle OPTIONS request for CORS preflight
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

  const startTime = Date.now();
  const pollTimestamp = new Date().toISOString();
  let pollLogId: string | null = null;

  try {
    console.log('🚀 Starting MANUAL poll function...');

    // Create poll log entry (using 'success' status since 'in_progress' is not allowed)
    const { data: pollLogEntry, error: pollLogError } = await supabase
      .from('poll_logs')
      .insert({
        timestamp: pollTimestamp,
        status: 'success',
        estimates_found: 0,
        estimates_processed: 0,
        duration_ms: 0,
      })
      .select()
      .single();

    if (pollLogError || !pollLogEntry) {
      console.error('❌ Failed to create poll log entry:', pollLogError);
    }

    pollLogId = pollLogEntry?.id || null;
    // 1. Fetch app settings from database
    const { data: settings, error: settingsError} = await supabase
      .from('app_state')
      .select('key, value')
      .in('key', ['polling_enabled', 'big_sale_threshold', 'tgl_option_name', 'last_poll_timestamp', 'recently_processed_ids']);

    if (settingsError) {
      throw new Error(`Failed to read settings: ${settingsError.message}`);
    }

    const settingsMap: any = {};
    (settings || []).forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    // Check if polling is enabled
    const pollingEnabled = settingsMap.polling_enabled === true || settingsMap.polling_enabled === 'true';

    if (!pollingEnabled) {
      console.log('⏸️  Polling is disabled, skipping...');

      const duration = Date.now() - startTime;

      // Don't create poll log when polling is disabled

      return createResponse(200, {
        success: true,
        skipped: true,
        message: 'Polling is disabled',
        durationMs: duration,
      });
    }

    const BIG_SALE_THRESHOLD = parseInt(settingsMap.big_sale_threshold || '700', 10);
    const TGL_OPTION_NAME = settingsMap.tgl_option_name
      ? JSON.parse(settingsMap.tgl_option_name)
      : 'Option C - System Update';

    console.log(`⚙️  Settings: Threshold=$${BIG_SALE_THRESHOLD}, TGL="${TGL_OPTION_NAME}"`);

    // Configuration for handling ServiceTitan API delays
    const LOOKBACK_BUFFER_MINUTES = 30; // Catch API delays (5-20 min typical)
    const CACHE_SIZE = 500; // Holds ~6 poll cycles × ~80 estimates

    const lastPollTimestamp = settingsMap.last_poll_timestamp as string;
    console.log(`📅 Last poll timestamp: ${lastPollTimestamp}`);

    // Add lookback buffer to catch delayed estimates from ServiceTitan API
    const bufferTimestamp = new Date(
      new Date(lastPollTimestamp).getTime() - LOOKBACK_BUFFER_MINUTES * 60000
    ).toISOString();
    console.log(`🔙 Using ${LOOKBACK_BUFFER_MINUTES}-minute lookback buffer: ${bufferTimestamp}`);

    let recentlyProcessedIds = (settingsMap.recently_processed_ids as string[]) || [];
    console.log(`🔍 Recently processed IDs in cache: ${recentlyProcessedIds.length}`);

    // 2. Query ServiceTitan API with lookback buffer
    console.log('📡 Querying ServiceTitan API...');
    const estimates: Estimate[] = await getSoldEstimates(bufferTimestamp);
    console.log(`✅ Found ${estimates.length} estimates`);

    let estimatesProcessed = 0;
    const newlyProcessedIds: string[] = [];

    // 4. Process each estimate
    for (const estimate of estimates) {
      const estimateId = estimate.id;

      // Skip if already processed
      if (recentlyProcessedIds.includes(estimateId)) {
        console.log(`⏭️  Skipping already processed estimate: ${estimateId}`);
        continue;
      }

      try {
        // Resolve technician and customer IDs to names
        const salesperson = await getTechnician(estimate.soldBy);
        const rawCustomerName = await getCustomer(estimate.customerId);
        const customerName = formatCustomerName(rawCustomerName);
        const amount = estimate.subtotal || 0;
        const soldAt = estimate.soldOn;
        const estimateName = estimate.name || '';

        // Check if TGL: "Option C - System Update" appears in estimate name
        const isTGL = estimateName.includes(TGL_OPTION_NAME);
        const isBigSale = amount > BIG_SALE_THRESHOLD;

        console.log(
          `📊 Estimate ${estimateId}: ${salesperson}, $${amount}, TGL: ${isTGL}, Big Sale: ${isBigSale}`
        );

        // Insert ALL estimates into database (for tracking/debugging)
        const { data: insertedEstimate, error: estimateError } = await supabase
          .from('estimates')
          .insert({
            estimate_id: estimateId,
            salesperson,
            customer_name: customerName,
            amount,
            sold_at: soldAt,
            option_name: estimateName,
            is_tgl: isTGL,
            is_big_sale: isBigSale,
            raw_data: estimate,
            poll_log_id: pollLogId,
          })
          .select()
          .single();

        if (estimateError) {
          console.error(`❌ Failed to insert estimate ${estimateId}:`, estimateError);
          newlyProcessedIds.push(estimateId);
          continue;
        }

        // Send celebrations for TGL and/or Big Sales
        if (isTGL || isBigSale) {
          let celebrationCount = 0;

          // Send TGL celebration if applicable
          if (isTGL) {
            // Dedup check: skip if ANY webhook_log exists (pending, success, or failed)
            if (await hasCelebrationBeenSent(estimateId, 'tgl')) {
              console.log(`⏭️ TGL celebration already sent for estimate ${estimateId}, skipping duplicate`);
            } else {
              const { message, gifUrl, type } = await generateMessage(
                salesperson,
                amount,
                customerName,
                true // TGL celebration
              );

              // Send to webhooks
              await sendToWebhooks(message, gifUrl, type, estimateId);

              // Insert notification
              const { error: notificationError } = await supabase.from('notifications').insert({
                estimate_id: insertedEstimate.id,
                type,
                message,
                gif_url: gifUrl,
                posted_successfully: false,
              });

              if (notificationError) {
                console.error(`❌ Failed to insert TGL notification:`, notificationError);
              }

              celebrationCount++;
              console.log(`🎉 Sent TGL celebration for estimate ${estimateId}`);
            }
          }

          // Send Big Sale celebration if applicable
          if (isBigSale) {
            // Dedup check: skip if ANY webhook_log exists (pending, success, or failed)
            if (await hasCelebrationBeenSent(estimateId, 'big_sale')) {
              console.log(`⏭️ Big Sale celebration already sent for estimate ${estimateId}, skipping duplicate`);
            } else {
              const { message, gifUrl, type } = await generateMessage(
                salesperson,
                amount,
                customerName,
                false // Big Sale celebration
              );

              // Send to webhooks
              await sendToWebhooks(message, gifUrl, type, estimateId);

              // Insert notification
              const { error: notificationError } = await supabase.from('notifications').insert({
                estimate_id: insertedEstimate.id,
                type,
                message,
                gif_url: gifUrl,
                posted_successfully: false,
              });

              if (notificationError) {
                console.error(`❌ Failed to insert Big Sale notification:`, notificationError);
              }

              celebrationCount++;
              console.log(`🎉 Sent Big Sale celebration for estimate ${estimateId}`);
            }
          }

          console.log(`✨ Total celebrations sent: ${celebrationCount}`);
        } else {
          console.log(`📝 Saved estimate ${estimateId} (no celebration sent)`);
        }

        estimatesProcessed++;
        newlyProcessedIds.push(estimateId);
        console.log(`✅ Processed estimate ${estimateId}`);
      } catch (error: any) {
        console.error(`❌ Error processing estimate ${estimateId}:`, error.message);
      }
    }

    // 5. Update app_state
    const newLastPollTimestamp = new Date().toISOString();

    // Update last_poll_timestamp
    await supabase
      .from('app_state')
      .update({
        value: newLastPollTimestamp,
        updated_at: new Date().toISOString(),
      })
      .eq('key', 'last_poll_timestamp');

    // Update recently_processed_ids (keep last CACHE_SIZE to handle lookback buffer)
    const updatedProcessedIds = [...newlyProcessedIds, ...recentlyProcessedIds].slice(0, CACHE_SIZE);
    await supabase
      .from('app_state')
      .update({
        value: updatedProcessedIds,
        updated_at: new Date().toISOString(),
      })
      .eq('key', 'recently_processed_ids');

    // 6. Update poll log with final results
    const duration = Date.now() - startTime;
    if (pollLogId) {
      // Update existing poll log
      await supabase
        .from('poll_logs')
        .update({
          status: 'success',
          estimates_found: estimates.length,
          estimates_processed: estimatesProcessed,
          duration_ms: duration,
        })
        .eq('id', pollLogId);
    } else {
      // Fallback: Insert new poll log if initial creation failed
      await supabase.from('poll_logs').insert({
        timestamp: pollTimestamp,
        status: 'success',
        estimates_found: estimates.length,
        estimates_processed: estimatesProcessed,
        duration_ms: duration,
      });
    }

    console.log(`✅ Poll completed successfully in ${duration}ms`);

    return createResponse(200, {
      success: true,
      estimatesFound: estimates.length,
      estimatesProcessed,
      durationMs: duration,
    });
  } catch (error: any) {
    console.error('❌ Error in poll-sales function:', error);

    // Update poll log with error
    const duration = Date.now() - startTime;
    if (pollLogId) {
      // Update existing poll log
      await supabase
        .from('poll_logs')
        .update({
          status: 'error',
          error_message: error.message || error.toString(),
          duration_ms: duration,
        })
        .eq('id', pollLogId);
    } else {
      // Fallback: Insert new poll log if initial creation failed
      await supabase.from('poll_logs').insert({
        timestamp: pollTimestamp,
        status: 'error',
        estimates_found: 0,
        estimates_processed: 0,
        error_message: error.message || error.toString(),
        duration_ms: duration,
      });
    }

    return createResponse(500, {
      success: false,
      error: error.message || 'Failed to process poll',
    });
  }
};
