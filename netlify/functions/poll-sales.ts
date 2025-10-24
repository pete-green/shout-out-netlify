import { Handler } from '@netlify/functions';
import { supabase } from './lib/supabase';
import { getSoldEstimates } from './lib/servicetitan';
import {
  BIG_SALE_MESSAGES,
  BIG_SALE_GIFS,
  TGL_GIF_URL,
  BIG_SALE_THRESHOLD,
  TGL_OPTION_NAME,
} from './lib/constants';

interface EstimateItem {
  skuName: string;
  total: number;
}

interface Estimate {
  id: string;
  soldOn: string;
  soldBy: { name: string };
  customer: { name: string };
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
 * Generate TGL or Big Sale message
 */
function generateMessage(
  salesperson: string,
  amount: number,
  customerName: string,
  isTGL: boolean
): { message: string; gifUrl: string; type: 'tgl' | 'big_sale' } {
  if (isTGL) {
    const message = `${salesperson} just generated a TGL at ${customerName}'s house! Awesome work ${salesperson}!!!`;
    return {
      message,
      gifUrl: TGL_GIF_URL,
      type: 'tgl',
    };
  }

  // Big Sale: Random message template
  const randomIndex = Math.floor(Math.random() * BIG_SALE_MESSAGES.length);
  const template = BIG_SALE_MESSAGES[randomIndex];
  const amountFormatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const message = template.replace(/{name}/g, salesperson).replace(/{amount}/g, amountFormatted);

  // Random GIF
  const gifIndex = Math.floor(Math.random() * BIG_SALE_GIFS.length);
  const gifUrl = BIG_SALE_GIFS[gifIndex];

  return {
    message,
    gifUrl,
    type: 'big_sale',
  };
}

/**
 * Main polling handler
 */
export const handler: Handler = async (_event, _context) => {
  const startTime = Date.now();

  console.log('🚀 Starting poll-sales function...');

  try {
    // 1. Read last poll timestamp from app_state
    const { data: appStateData, error: appStateError } = await supabase
      .from('app_state')
      .select('value')
      .eq('key', 'last_poll_timestamp')
      .single();

    if (appStateError) {
      throw new Error(`Failed to read app_state: ${appStateError.message}`);
    }

    const lastPollTimestamp = appStateData.value as string;
    console.log(`📅 Last poll timestamp: ${lastPollTimestamp}`);

    // 2. Read recently processed IDs
    const { data: processedIdsData, error: processedIdsError } = await supabase
      .from('app_state')
      .select('value')
      .eq('key', 'recently_processed_ids')
      .single();

    if (processedIdsError) {
      throw new Error(`Failed to read recently_processed_ids: ${processedIdsError.message}`);
    }

    let recentlyProcessedIds = (processedIdsData.value as string[]) || [];
    console.log(`🔍 Recently processed IDs: ${recentlyProcessedIds.length}`);

    // 3. Query ServiceTitan API
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
        const salesperson = estimate.soldBy?.name || 'Unknown';
        const customerName = formatCustomerName(estimate.customer?.name || 'Unknown Customer');
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
        const { message, gifUrl, type } = generateMessage(
          salesperson,
          amount,
          customerName,
          isTGL
        );

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
