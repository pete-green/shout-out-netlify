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

console.log('Checking webhook delivery for today\'s TGL celebrations:\n');

const { data: webhookLogs } = await supabase
  .from('webhook_logs')
  .select('*')
  .eq('celebration_type', 'tgl')
  .in('estimate_id', ['174959440', '174963831'])
  .order('created_at', { ascending: true });

if (webhookLogs && webhookLogs.length > 0) {
  console.log(`Found ${webhookLogs.length} webhook delivery log(s):\n`);
  webhookLogs.forEach((log, i) => {
    console.log(`${i + 1}. Estimate ID: ${log.estimate_id}`);
    console.log(`   Status: ${log.status}`);
    console.log(`   Delivered At: ${log.created_at}`);
    if (log.error_message) {
      console.log(`   Error: ${log.error_message}`);
    }
    console.log('');
  });
} else {
  console.log('No webhook logs found');
}
