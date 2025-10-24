import { Handler } from '@netlify/functions';
import { supabase } from './lib/supabase';
import { getSoldEstimates, getTechnician, getCustomer } from './lib/servicetitan';

interface EstimateItem {
  skuName: string;
  total: number;
}

interface Estimate {
  id: string;
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
 * Send celebration message to webhooks
 */
async function sendToWebhooks(
  message: string,
  gifUrl: string,
  celebrationType: 'tgl' | 'big_sale',
  estimateId: string
) {
  // Fetch active webhooks that match this celebration type
  const { data: webhooks } = await supabase
    .from('webhooks')
    .select('id, url')
    .contains('tags', [celebrationType])
    .eq('is_active', true);

  if (!webhooks || webhooks.length === 0) {
    console.log(`⚠️ No active webhooks configured for ${celebrationType}`);
    return;
  }

  // Send to each webhook
  for (const webhook of webhooks) {
    try {
      const payload = {
        text: message,
        cards: [
          {
            sections: [
              {
                widgets: [
                  {
                    image: {
                      imageUrl: gifUrl,
                    },
                  },
                ],
              },
            ],
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

        // Log successful delivery
        await supabase.from('webhook_logs').insert({
          webhook_id: webhook.id,
          celebration_type: celebrationType,
          status: 'success',
          estimate_id: estimateId,
        });
      } else {
        const errorText = await response.text();
        console.error(`❌ Failed to send to webhook ${webhook.id}: ${response.status}`);

        // Log failed delivery
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

      // Log error
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
 * Generate TGL or Big Sale message from database
 */
async function generateMessage(
  salesperson: string,
  amount: number,
  customerName: string,
  isTGL: boolean
): Promise<{ message: string; gifUrl: string; type: 'tgl' | 'big_sale' }> {
  const category = isTGL ? 'tgl' : 'big_sale';
  const tag = isTGL ? 'tgl' : 'big_sale';

  // Fetch active messages for this category
  const { data: messages } = await supabase
    .from('celebration_messages')
    .select('message_text')
    .eq('category', category)
    .eq('is_active', true);

  // Fetch active GIFs for this tag
  const { data: gifs } = await supabase
    .from('celebration_gifs')
    .select('url')
    .contains('tags', [tag])
    .eq('is_active', true);

  // Fallback in case no messages/GIFs found
  if (!messages || messages.length === 0) {
    console.warn(`No active ${category} messages found, using fallback`);
    const fallbackMessage = isTGL
      ? `${salesperson} just generated a TGL at ${customerName}'s house! Awesome work ${salesperson}!!!`
      : `🎉 ${salesperson} just closed a sale of $${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}! Amazing work!`;
    return {
      message: fallbackMessage,
      gifUrl: gifs && gifs.length > 0 ? gifs[0].url : '',
      type: category,
    };
  }

  if (!gifs || gifs.length === 0) {
    console.warn(`No active ${tag} GIFs found`);
  }

  // Select random message and GIF
  const randomMessageIndex = Math.floor(Math.random() * messages.length);
  const template = messages[randomMessageIndex].message_text;

  const amountFormatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const message = template
    .replace(/{name}/g, salesperson)
    .replace(/{amount}/g, amountFormatted);

  const randomGifIndex = Math.floor(Math.random() * (gifs?.length || 0));
  const gifUrl = gifs && gifs.length > 0 ? gifs[randomGifIndex].url : '';

  return {
    message,
    gifUrl,
    type: category,
  };
}

/**
 * Main polling handler
 */
export const handler: Handler = async (_event, _context) => {
  const startTime = Date.now();

  console.log('🚀 Starting poll-sales function...');

  try {
    // 1. Fetch app settings from database
    const { data: settings, error: settingsError } = await supabase
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
      await supabase.from('poll_logs').insert({
        status: 'skipped',
        estimates_found: 0,
        estimates_processed: 0,
        duration_ms: duration,
        error_message: 'Polling is disabled',
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          skipped: true,
          message: 'Polling is disabled',
          durationMs: duration,
        }),
      };
    }

    const BIG_SALE_THRESHOLD = parseInt(settingsMap.big_sale_threshold || '700', 10);
    const TGL_OPTION_NAME = settingsMap.tgl_option_name
      ? JSON.parse(settingsMap.tgl_option_name)
      : 'Option C - System Update';

    console.log(`⚙️  Settings: Threshold=$${BIG_SALE_THRESHOLD}, TGL="${TGL_OPTION_NAME}"`);

    const lastPollTimestamp = settingsMap.last_poll_timestamp as string;
    console.log(`📅 Last poll timestamp: ${lastPollTimestamp}`);

    let recentlyProcessedIds = (settingsMap.recently_processed_ids as string[]) || [];
    console.log(`🔍 Recently processed IDs: ${recentlyProcessedIds.length}`);

    // 2. Query ServiceTitan API
    console.log('📡 Querying ServiceTitan API...');
    const estimates: Estimate[] = await getSoldEstimates(lastPollTimestamp);
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

        // Find "Option C - System Update" in items
        let optionName = '';
        if (estimate.items && Array.isArray(estimate.items)) {
          const optionItem = estimate.items.find((item: EstimateItem) =>
            item.skuName?.includes(TGL_OPTION_NAME)
          );
          if (optionItem) {
            optionName = optionItem.skuName;
          }
        }

        // Determine if TGL or Big Sale
        const isTGL = amount === 0 && optionName.includes(TGL_OPTION_NAME);
        const isBigSale = amount > BIG_SALE_THRESHOLD;

        console.log(
          `📊 Estimate ${estimateId}: ${salesperson}, $${amount}, TGL: ${isTGL}, Big Sale: ${isBigSale}`
        );

        // Only process if TGL or Big Sale
        if (!isTGL && !isBigSale) {
          console.log(`⏭️  Skipping estimate (not TGL or Big Sale)`);
          newlyProcessedIds.push(estimateId);
          continue;
        }

        // Generate message
        const { message, gifUrl, type } = await generateMessage(
          salesperson,
          amount,
          customerName,
          isTGL
        );

        // Send to webhooks
        await sendToWebhooks(message, gifUrl, type, estimateId);

        // Insert estimate into database
        const { data: insertedEstimate, error: estimateError } = await supabase
          .from('estimates')
          .insert({
            estimate_id: estimateId,
            salesperson,
            customer_name: customerName,
            amount,
            sold_at: soldAt,
            option_name: optionName,
            is_tgl: isTGL,
            is_big_sale: isBigSale,
            raw_data: estimate,
          })
          .select()
          .single();

        if (estimateError) {
          console.error(`❌ Failed to insert estimate ${estimateId}:`, estimateError);
          continue;
        }

        // Insert notification
        const { error: notificationError } = await supabase.from('notifications').insert({
          estimate_id: insertedEstimate.id,
          type,
          message,
          gif_url: gifUrl,
          posted_successfully: false, // Will be set to true when posted to Google Chat (Phase 2)
        });

        if (notificationError) {
          console.error(`❌ Failed to insert notification:`, notificationError);
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

    // Update recently_processed_ids (keep last 50)
    const updatedProcessedIds = [...newlyProcessedIds, ...recentlyProcessedIds].slice(0, 50);
    await supabase
      .from('app_state')
      .update({
        value: updatedProcessedIds,
        updated_at: new Date().toISOString(),
      })
      .eq('key', 'recently_processed_ids');

    // 6. Log poll to poll_logs
    const duration = Date.now() - startTime;
    await supabase.from('poll_logs').insert({
      status: 'success',
      estimates_found: estimates.length,
      estimates_processed: estimatesProcessed,
      duration_ms: duration,
    });

    console.log(`✅ Poll completed successfully in ${duration}ms`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        estimatesFound: estimates.length,
        estimatesProcessed,
        durationMs: duration,
      }),
    };
  } catch (error: any) {
    console.error('❌ Error in poll-sales function:', error);

    // Log error to poll_logs
    const duration = Date.now() - startTime;
    await supabase.from('poll_logs').insert({
      status: 'error',
      estimates_found: 0,
      estimates_processed: 0,
      error_message: error.message || error.toString(),
      duration_ms: duration,
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to process poll',
      }),
    };
  }
};
