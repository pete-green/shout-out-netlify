import { supabase } from './supabase';

/**
 * Check if a celebration has already been sent for an estimate.
 * Checks for ANY webhook_log status (success or failed) to prevent race conditions.
 * A record existing in any state means another function has handled this celebration.
 */
export async function hasCelebrationBeenSent(
  estimateId: string,
  celebrationType: 'tgl' | 'big_sale'
): Promise<boolean> {
  const { data } = await supabase
    .from('webhook_logs')
    .select('id, status')
    .eq('estimate_id', estimateId)
    .eq('celebration_type', celebrationType)
    .limit(1);

  if (data && data.length > 0) {
    console.log(`🔒 hasCelebrationBeenSent: TRUE for estimate ${estimateId} type=${celebrationType} (existing log id=${data[0].id} status=${data[0].status})`);
    return true;
  }
  return false;
}

/**
 * Send celebration message to webhooks with built-in deduplication.
 *
 * For each webhook:
 * 1. Check if a webhook_log already exists (any status) -> skip if so
 * 2. Send to Google Chat
 * 3. Log result to webhook_logs
 *
 * The per-webhook check inside this function acts as a second dedup layer
 * (callers should also use hasCelebrationBeenSent before message generation).
 */
export async function sendToWebhooks(
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
      // Dedup: check if ANY log already exists for this webhook + estimate + type
      const { data: existingLog } = await supabase
        .from('webhook_logs')
        .select('id')
        .eq('estimate_id', estimateId)
        .eq('celebration_type', celebrationType)
        .eq('webhook_id', webhook.id)
        .limit(1);

      if (existingLog && existingLog.length > 0) {
        console.log(`⏭️ webhook_log already exists for estimate ${estimateId}, webhook ${webhook.id} — skipping`);
        continue;
      }

      // Send to Google Chat
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
