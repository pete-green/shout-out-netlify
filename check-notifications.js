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

const estimateIds = ['174959440', '174963831'];

console.log('Checking notifications for today\'s TGLs:\n');

for (const id of estimateIds) {
  // First get the estimate internal ID
  const { data: estimate } = await supabase
    .from('estimates')
    .select('id, estimate_id, salesperson')
    .eq('estimate_id', id)
    .single();

  if (!estimate) {
    console.log(`${id}: Estimate not found`);
    continue;
  }

  console.log(`Estimate ${id} (internal ID: ${estimate.id}) - ${estimate.salesperson}`);

  // Check for notifications
  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, type, created_at')
    .eq('estimate_id', estimate.id);

  if (notifications && notifications.length > 0) {
    console.log(`  Found ${notifications.length} notification(s):`);
    notifications.forEach(n => {
      console.log(`    - Type: ${n.type}, Created: ${n.created_at}`);
    });
  } else {
    console.log(`  No notifications found ✅ (ready to celebrate!)`);
  }
  console.log('');
}
