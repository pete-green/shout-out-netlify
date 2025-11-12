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

console.log('Checking the Chris Mccue TGL message template:\n');

const { data: message } = await supabase
  .from('celebration_messages')
  .select('*')
  .eq('category', 'tgl')
  .eq('assigned_to_salesperson', 'Chris Mccue')
  .single();

if (message) {
  console.log('FOUND THE PROBLEM! ❌\n');
  console.log('Message Category:', message.category);
  console.log('Assigned To:', message.assigned_to_salesperson);
  console.log('\nFull Message Template:');
  console.log('━'.repeat(60));
  console.log(message.message_text);
  console.log('━'.repeat(60));
  console.log('\n⚠️  This message template is categorized as "tgl" but the content');
  console.log('   talks about closing a SALE with dollar amounts!');
  console.log('\n   TGL messages should be about "generating a TGL" or "tech-generated lead",');
  console.log('   NOT about dollar amounts or sales.');
  console.log('\n💡 SOLUTION: Update this message in the Messages page to be appropriate');
  console.log('   for TGL celebrations (remove {amount} references).');
} else {
  console.log('No Chris Mccue TGL message found');
}
