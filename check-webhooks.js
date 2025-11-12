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

console.log('Checking webhook configuration:\n');

const { data: webhooks } = await supabase
  .from('webhooks')
  .select('*')
  .order('created_at', { ascending: true });

if (webhooks && webhooks.length > 0) {
  console.log(`Found ${webhooks.length} webhook(s):\n`);
  webhooks.forEach((webhook, i) => {
    console.log(`${i + 1}. ${webhook.name}`);
    console.log(`   URL: ${webhook.url.substring(0, 50)}...`);
    console.log(`   Tags: ${JSON.stringify(webhook.tags)}`);
    console.log(`   Active: ${webhook.is_active}`);
    console.log('');
  });
} else {
  console.log('❌ No webhooks configured!');
  console.log('\nThis means celebrations were created but not sent to Google Chat.');
  console.log('You need to configure a webhook in the Configuration page.');
}
