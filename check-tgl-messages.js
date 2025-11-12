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

console.log('Checking TGL celebration messages in database:\n');

// Check for TGL messages
const { data: tglMessages } = await supabase
  .from('celebration_messages')
  .select('*')
  .eq('category', 'tgl')
  .eq('is_active', true)
  .order('created_at', { ascending: true });

console.log(`Found ${tglMessages?.length || 0} active TGL messages:\n`);

if (tglMessages && tglMessages.length > 0) {
  tglMessages.forEach((msg, i) => {
    console.log(`${i + 1}. Message: "${msg.message_text.substring(0, 60)}..."`);
    console.log(`   Assigned to: ${msg.assigned_to_salesperson || 'Generic (any salesperson)'}`);
    console.log(`   Used: ${msg.use_count} times`);
    console.log('');
  });
} else {
  console.log('❌ NO TGL MESSAGES FOUND!');
  console.log('\nThis is why it\'s using fallback messages or wrong messages.');
  console.log('You need to add TGL celebration messages in the Messages page.');
}

// Also check what notification messages were actually stored
console.log('\n---\nChecking stored notification messages:\n');

const { data: notifications } = await supabase
  .from('notifications')
  .select('*, estimates!inner(estimate_id, salesperson)')
  .eq('notifications.type', 'tgl')
  .gte('notifications.created_at', '2025-10-27T00:00:00Z');

if (notifications && notifications.length > 0) {
  notifications.forEach((notif, i) => {
    console.log(`${i + 1}. Estimate: ${notif.estimates.estimate_id} - ${notif.estimates.salesperson}`);
    console.log(`   Stored Message: "${notif.message.substring(0, 80)}..."`);
    console.log('');
  });
}
