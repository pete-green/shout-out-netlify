import { supabase } from './supabase';

/**
 * Check if a celebration has already been sent (or is in-progress) for an estimate.
 * Checks for ANY webhook_log status (pending, success, failed) to prevent race conditions.
 * A record existing in any state means another function is handling or has handled this celebration.
 */
export async function hasCelebrationBeenSent(
  estimateId: string,
  celebrationType: 'tgl' | 'big_sale'
): Promise<boolean> {
  const { data } = await supabase
    .from('webhook_logs')
    .select('id')
    .eq('estimate_id', estimateId)
    .eq('celebration_type', celebrationType)
    .limit(1);

  return !!(data && data.length > 0);
}

/**
 * Send celebration message to webhooks with built-in deduplication.
 *
 * For each webhook:
 * 1. Check if a webhook_log already exists (any status) -> skip if so
 * 2. Insert a 'pending' webhook_log BEFORE sending (claims the send)
 * 3. Send to Google Chat
 * 4. Update webhook_log to 'success' or 'failed'
 *
 * This ensures that even if two functions race, the second one will see
 * the 'pending' record inserted by the first and skip.
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
    let claimRecordId: string | null = null;

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

      // Claim: insert 'pending' record BEFORE sending to narrow the race window
      const { data: claimRecord, error: claimError } = await supabase
        .from('webhook_logs')
        .insert({
          webhook_id: webhook.id,
          celebration_type: celebrationType,
          status: 'pending',
          estimate_id: estimateId,
        })
        .select()
        .single();

      if (claimError) {
        console.error(`❌ Failed to claim webhook send for estimate ${estimateId}:`, claimError);
        continue;
      }

      claimRecordId = claimRecord.id;

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
        await supabase
          .from('webhook_logs')
          .update({ status: 'success' })
          .eq('id', claimRecordId);
      } else {
        const errorText = await response.text();
        console.error(`❌ Failed to send to webhook ${webhook.id}: ${response.status}`);
        await supabase
          .from('webhook_logs')
          .update({
            status: 'failed',
            error_message: `HTTP ${response.status}: ${errorText}`,
          })
          .eq('id', claimRecordId);
      }
    } catch (error: any) {
      console.error(`❌ Error sending to webhook ${webhook.id}:`, error.message);

      if (claimRecordId) {
        await supabase
          .from('webhook_logs')
          .update({
            status: 'failed',
            error_message: error.message,
          })
          .eq('id', claimRecordId);
      }
    }
  }
}
