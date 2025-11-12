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

console.log('Checking ALL webhook logs from today (Oct 27, 2025):\n');

const { data: webhookLogs } = await supabase
  .from('webhook_logs')
  .select('*')
  .gte('created_at', '2025-10-27T00:00:00Z')
  .lte('created_at', '2025-10-27T23:59:59Z')
  .order('created_at', { ascending: true });

if (webhookLogs && webhookLogs.length > 0) {
  console.log(`Found ${webhookLogs.length} webhook delivery log(s) for today:\n`);
  webhookLogs.forEach((log, i) => {
    console.log(`${i + 1}. Estimate ID: ${log.estimate_id || 'N/A'}`);
    console.log(`   Type: ${log.celebration_type}`);
    console.log(`   Status: ${log.status}`);
    console.log(`   Time: ${log.created_at}`);
    if (log.error_message) {
      console.log(`   Error: ${log.error_message}`);
    }
    console.log('');
  });
} else {
  console.log('❌ No webhook logs found for today');
  console.log('\nThis suggests either:');
  console.log('1. No celebrations were sent to webhooks today');
  console.log('2. Webhook logging isn\'t working properly');
}
