import { Handler, HandlerResponse } from '@netlify/functions';
import { supabase } from './lib/supabase';
import { getSoldEstimates, getTechnician, getCustomer } from './lib/servicetitan';
import { calculateCrossSaleMetrics } from './lib/water-quality';

/**
 * CATCHUP POLL - Hourly deep-scan to catch missed estimates
 *
 * This function runs hourly and looks back 6 hours to catch any estimates
 * that were missed due to ServiceTitan API indexing delays.
 *
 * The regular poll-sales function runs every 5 minutes with a 30-minute buffer,
 * but ServiceTitan sometimes has indexing delays > 30 minutes. This catchup
 * poll ensures no sales slip through the cracks.
 */

const CATCHUP_LOOKBACK_HOURS = 6;
const CACHE_SIZE = 500;

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

function selectWithRecencyWeight<T extends { last_used_at: string | null; use_count: number }>(
  items: T[]
): T | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];

  const now = Date.now();
  const weights = items.map((item) => {
    if (!item.last_used_at) return 10;
    const hoursSinceUse = (now - new Date(item.last_used_at).getTime()) / (1000 * 60 * 60);
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

async function generateMessage(
  salesperson: string,
  amount: number,
  customerName: string,
  isTGL: boolean
): Promise<{ message: string; gifUrl: string; type: 'tgl' | 'big_sale' }> {
  const category = isTGL ? 'tgl' : 'big_sale';
  const tag = isTGL ? 'tgl' : 'big_sale';

  const { data: personMessages } = await supabase
    .from('celebration_messages')
    .select('id, message_text, last_used_at, last_used_for, use_count, paired_gif_id')
    .eq('category', category)
    .eq('is_active', true)
    .eq('assigned_to_salesperson', salesperson);

  const availablePersonMessages = (personMessages || []).filter((msg) => {
    if (!msg.last_used_for || msg.last_used_for !== salesperson) return true;
    if (!msg.last_used_at) return true;
    const hoursSince = (Date.now() - new Date(msg.last_used_at).getTime()) / (1000 * 60 * 60);
    return hoursSince > 24;
  });

  const { data: genericMessages } = await supabase
    .from('celebration_messages')
    .select('id, message_text, last_used_at, last_used_for, use_count, paired_gif_id')
    .eq('category', category)
    .eq('is_active', true)
    .is('assigned_to_salesperson', null);

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

  const { data: personGifs } = await supabase
    .from('celebration_gifs')
    .select('id, url, last_used_at, last_used_for, use_count')
    .contains('tags', [tag])
    .eq('is_active', true)
    .eq('assigned_to_salesperson', salesperson);

  const availablePersonGifs = (personGifs || []).filter((gif) => {
    if (!gif.last_used_for || gif.last_used_for !== salesperson) return true;
    if (!gif.last_used_at) return true;
    const hoursSince = (Date.now() - new Date(gif.last_used_at).getTime()) / (1000 * 60 * 60);
    return hoursSince > 24;
  });

  const { data: genericGifs } = await supabase
    .from('celebration_gifs')
    .select('id, url, last_used_at, last_used_for, use_count')
    .contains('tags', [tag])
    .eq('is_active', true)
    .is('assigned_to_salesperson', null);

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

  if (messagePool.length === 0) {
    const fallbackMessage = isTGL
      ? `${salesperson} just generated a TGL at ${customerName}'s house! Awesome work ${salesperson}!!!`
      : `🎉 ${salesperson} just closed a sale of $${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}! Amazing work!`;
    return {
      message: fallbackMessage,
      gifUrl: gifPool.length > 0 ? gifPool[0].url : '',
      type: category,
    };
  }

  const selectedMessage = selectWithRecencyWeight(messagePool);
  if (!selectedMessage) {
    throw new Error('Failed to select message');
  }

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

  const { data: salespersonData } = await supabase
    .from('salespeople')
    .select('gender')
    .eq('name', salesperson)
    .single();

  const pronouns = getPronouns(salespersonData?.gender || null);

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

  return {
    message,
    gifUrl,
    type: category,
  };
}

export const handler: Handler = async (event, _context) => {
  const { httpMethod } = event;

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
    console.log('🔄 Starting CATCHUP poll (6-hour lookback)...');

    // Create poll log entry
    const { data: pollLogEntry, error: pollLogError } = await supabase
      .from('poll_logs')
      .insert({
        timestamp: pollTimestamp,
        status: 'success',
        estimates_found: 0,
        estimates_processed: 0,
        duration_ms: 0,
        // Mark this as a catchup poll in case we want to distinguish later
      })
      .select()
      .single();

    if (pollLogError || !pollLogEntry) {
      console.error('❌ Failed to create poll log entry:', pollLogError);
    }

    pollLogId = pollLogEntry?.id || null;

    // Fetch app settings
    const { data: settings, error: settingsError } = await supabase
      .from('app_state')
      .select('key, value')
      .in('key', ['polling_enabled', 'big_sale_threshold', 'tgl_option_name', 'recently_processed_ids']);

    if (settingsError) {
      throw new Error(`Failed to read settings: ${settingsError.message}`);
    }

    const settingsMap: any = {};
    (settings || []).forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    const pollingEnabled = settingsMap.polling_enabled === true || settingsMap.polling_enabled === 'true';

    if (!pollingEnabled) {
      console.log('⏸️  Polling is disabled, skipping catchup...');
      return createResponse(200, {
        success: true,
        skipped: true,
        message: 'Polling is disabled',
      });
    }

    const BIG_SALE_THRESHOLD = parseInt(settingsMap.big_sale_threshold || '700', 10);
    const TGL_OPTION_NAME = settingsMap.tgl_option_name
      ? JSON.parse(settingsMap.tgl_option_name)
      : 'Option C - System Update';

    console.log(`⚙️  Settings: Threshold=$${BIG_SALE_THRESHOLD}, TGL="${TGL_OPTION_NAME}"`);

    // Calculate 6-hour lookback timestamp
    const lookbackTimestamp = new Date(
      Date.now() - CATCHUP_LOOKBACK_HOURS * 60 * 60 * 1000
    ).toISOString();
    console.log(`🔙 Catchup lookback: ${CATCHUP_LOOKBACK_HOURS} hours (since ${lookbackTimestamp})`);

    let recentlyProcessedIds = (settingsMap.recently_processed_ids as string[]) || [];
    console.log(`🔍 Recently processed IDs in cache: ${recentlyProcessedIds.length}`);

    // Query ServiceTitan API with extended lookback
    console.log('📡 Querying ServiceTitan API...');
    const estimates: Estimate[] = await getSoldEstimates(lookbackTimestamp);
    console.log(`✅ Found ${estimates.length} estimates in the last ${CATCHUP_LOOKBACK_HOURS} hours`);

    let estimatesProcessed = 0;
    let missedEstimatesCaught = 0;
    const newlyProcessedIds: string[] = [];

    for (const estimate of estimates) {
      const estimateId = String(estimate.id);

      // Skip if already in cache
      if (recentlyProcessedIds.includes(estimateId)) {
        continue;
      }

      // Fresh DB check for each estimate (not stale bulk query from start)
      // This prevents race condition where poll-sales inserted after our bulk query
      const { data: existingEstimate } = await supabase
        .from('estimates')
        .select('estimate_id')
        .eq('estimate_id', estimateId)
        .limit(1);

      if (existingEstimate && existingEstimate.length > 0) {
        continue;
      }

      // This is a MISSED estimate! Process it.
      console.log(`🎯 CAUGHT MISSED ESTIMATE: ${estimateId}`);
      missedEstimatesCaught++;

      try {
        const salesperson = await getTechnician(estimate.soldBy);
        const rawCustomerName = await getCustomer(estimate.customerId);
        const customerName = formatCustomerName(rawCustomerName);
        const amount = estimate.subtotal || 0;
        const soldAt = estimate.soldOn;
        const estimateName = estimate.name || '';

        const isTGL = estimateName.includes(TGL_OPTION_NAME);
        const isBigSale = amount > BIG_SALE_THRESHOLD;

        console.log(
          `📊 Estimate ${estimateId}: ${salesperson}, $${amount}, TGL: ${isTGL}, Big Sale: ${isBigSale}`
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

        // Calculate cross-sale metrics
        try {
          const crossSaleMetrics = await calculateCrossSaleMetrics(estimate);

          const updateData: any = {};

          if (crossSaleMetrics.waterQuality.hasWaterQuality) {
            console.log(
              `💧 Water Quality detected: $${crossSaleMetrics.waterQuality.waterQualityAmount.toFixed(2)}`
            );
            updateData.has_water_quality = true;
            updateData.water_quality_amount = crossSaleMetrics.waterQuality.waterQualityAmount;
            updateData.water_quality_item_count = crossSaleMetrics.waterQuality.waterQualityItemCount;
          }

          if (crossSaleMetrics.airQuality.hasAirQuality) {
            console.log(
              `🌪️  Air Quality detected: $${crossSaleMetrics.airQuality.airQualityAmount.toFixed(2)}`
            );
            updateData.has_air_quality = true;
            updateData.air_quality_amount = crossSaleMetrics.airQuality.airQualityAmount;
            updateData.air_quality_item_count = crossSaleMetrics.airQuality.airQualityItemCount;
          }

          if (Object.keys(updateData).length > 0) {
            await supabase
              .from('estimates')
              .update(updateData)
              .eq('id', insertedEstimate.id);
          }
        } catch (csError: any) {
          console.error(`⚠️  Failed to calculate cross-sale metrics: ${csError.message}`);
        }

        // Send celebrations for TGL and/or Big Sales
        if (isTGL || isBigSale) {
          if (isTGL) {
            // Dedup check: skip if we already sent this celebration (prevents race with poll-sales)
            const { data: existingTglLogs } = await supabase
              .from('webhook_logs')
              .select('id')
              .eq('estimate_id', estimateId)
              .eq('celebration_type', 'tgl')
              .eq('status', 'success')
              .limit(1);

            if (existingTglLogs && existingTglLogs.length > 0) {
              console.log(`⏭️ TGL celebration already sent for estimate ${estimateId}, skipping duplicate`);
            } else {
              const { message, gifUrl, type } = await generateMessage(
                salesperson,
                amount,
                customerName,
                true
              );

              await sendToWebhooks(message, gifUrl, type, estimateId);

              await supabase.from('notifications').insert({
                estimate_id: insertedEstimate.id,
                type,
                message,
                gif_url: gifUrl,
                posted_successfully: false,
              });

              console.log(`🎉 Sent TGL celebration for MISSED estimate ${estimateId}`);
            }
          }

          if (isBigSale) {
            // Dedup check: skip if we already sent this celebration (prevents race with poll-sales)
            const { data: existingBigSaleLogs } = await supabase
              .from('webhook_logs')
              .select('id')
              .eq('estimate_id', estimateId)
              .eq('celebration_type', 'big_sale')
              .eq('status', 'success')
              .limit(1);

            if (existingBigSaleLogs && existingBigSaleLogs.length > 0) {
              console.log(`⏭️ Big Sale celebration already sent for estimate ${estimateId}, skipping duplicate`);
            } else {
              const { message, gifUrl, type } = await generateMessage(
                salesperson,
                amount,
                customerName,
                false
              );

              await sendToWebhooks(message, gifUrl, type, estimateId);

              await supabase.from('notifications').insert({
                estimate_id: insertedEstimate.id,
                type,
                message,
                gif_url: gifUrl,
                posted_successfully: false,
              });

              console.log(`🎉 Sent Big Sale celebration for MISSED estimate ${estimateId}`);
            }
          }
        }

        estimatesProcessed++;
        newlyProcessedIds.push(estimateId);
        console.log(`✅ Processed missed estimate ${estimateId}`);
      } catch (error: any) {
        console.error(`❌ Error processing estimate ${estimateId}:`, error.message);
      }
    }

    // Update recently_processed_ids cache with newly found IDs
    if (newlyProcessedIds.length > 0) {
      const updatedProcessedIds = [...newlyProcessedIds, ...recentlyProcessedIds].slice(0, CACHE_SIZE);
      await supabase
        .from('app_state')
        .update({
          value: updatedProcessedIds,
          updated_at: new Date().toISOString(),
        })
        .eq('key', 'recently_processed_ids');
    }

    // Update poll log
    const duration = Date.now() - startTime;
    if (pollLogId) {
      await supabase
        .from('poll_logs')
        .update({
          status: 'success',
          estimates_found: estimates.length,
          estimates_processed: estimatesProcessed,
          duration_ms: duration,
        })
        .eq('id', pollLogId);
    }

    console.log(`✅ Catchup poll completed in ${duration}ms`);
    console.log(`📊 Summary: Found ${estimates.length} estimates, caught ${missedEstimatesCaught} missed, processed ${estimatesProcessed}`);

    return createResponse(200, {
      success: true,
      estimatesFound: estimates.length,
      missedEstimatesCaught,
      estimatesProcessed,
      durationMs: duration,
    });
  } catch (error: any) {
    console.error('❌ Error in catchup-poll function:', error);

    const duration = Date.now() - startTime;
    if (pollLogId) {
      await supabase
        .from('poll_logs')
        .update({
          status: 'error',
          error_message: error.message || error.toString(),
          duration_ms: duration,
        })
        .eq('id', pollLogId);
    }

    return createResponse(500, {
      success: false,
      error: error.message || 'Failed to process catchup poll',
    });
  }
};
