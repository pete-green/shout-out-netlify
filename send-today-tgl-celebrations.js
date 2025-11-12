import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      let value = valueParts.join('=').trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key.trim()] = value;
    }
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function sendTGLCelebrations() {
  console.log('🎉 Sending TGL celebrations to Google Chat...\n');

  // Get today's TGLs
  const { data: tgls } = await supabase
    .from('estimates')
    .select('*, notifications(*)')
    .eq('is_tgl', true)
    .gte('sold_at', '2025-10-27T00:00:00Z')
    .lte('sold_at', '2025-10-27T23:59:59Z');

  console.log(`Found ${tgls.length} TGLs for today\n`);

  // Get active webhook
  const { data: webhooks } = await supabase
    .from('webhooks')
    .select('*')
    .contains('tags', ['tgl'])
    .eq('is_active', true);

  if (!webhooks || webhooks.length === 0) {
    console.log('❌ No active webhooks found for TGL celebrations');
    return;
  }

  const webhook = webhooks[0];
  console.log(`Using webhook: ${webhook.name}\n`);

  // Send each TGL
  for (const tgl of tgls) {
    console.log(`Processing TGL: ${tgl.estimate_id}`);
    console.log(`  Salesperson: ${tgl.salesperson}`);
    console.log(`  Amount: $${tgl.amount}`);

    // Find the existing notification to get the message
    const notification = tgl.notifications && tgl.notifications.length > 0
      ? tgl.notifications.find(n => n.type === 'tgl')
      : null;

    if (!notification) {
      console.log(`  ⚠️  No notification found, skipping\n`);
      continue;
    }

    const message = notification.message;
    const gifUrl = notification.gif_url;

    console.log(`  Message: "${message.substring(0, 50)}..."`);
    console.log(`  GIF: ${gifUrl ? 'Yes' : 'No'}`);

    // Send to webhook
    const payload = {
      cardsV2: [
        {
          cardId: `celebration-${tgl.estimate_id}`,
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
                      altText: 'TGL celebration',
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

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(`  ✅ Sent to Google Chat successfully!`);

        // Log the delivery
        await supabase.from('webhook_logs').insert({
          webhook_id: webhook.id,
          celebration_type: 'tgl',
          status: 'success',
          estimate_id: tgl.estimate_id,
        });
      } else {
        const errorText = await response.text();
        console.log(`  ❌ Failed: HTTP ${response.status} - ${errorText}`);

        // Log the failure
        await supabase.from('webhook_logs').insert({
          webhook_id: webhook.id,
          celebration_type: 'tgl',
          status: 'failed',
          error_message: `HTTP ${response.status}: ${errorText}`,
          estimate_id: tgl.estimate_id,
        });
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);

      // Log the error
      await supabase.from('webhook_logs').insert({
        webhook_id: webhook.id,
        celebration_type: 'tgl',
        status: 'failed',
        error_message: error.message,
        estimate_id: tgl.estimate_id,
      });
    }

    console.log('');
  }

  console.log('✅ Done!');
}

sendTGLCelebrations().catch(console.error);
