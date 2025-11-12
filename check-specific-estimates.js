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

// Check for the 2 TGLs we found in the investigation
const estimateIds = ['174959440', '174963831'];

console.log('Checking for these specific estimate IDs:\n');

for (const id of estimateIds) {
  const { data, error } = await supabase
    .from('estimates')
    .select('*')
    .eq('estimate_id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.log(`${id}: ERROR - ${error.message}`);
  } else if (!data) {
    console.log(`${id}: NOT FOUND in database ❌`);
  } else {
    console.log(`${id}: FOUND ✅`);
    console.log(`  Salesperson: ${data.salesperson}`);
    console.log(`  Amount: $${data.amount}`);
    console.log(`  Option Name: "${data.option_name}"`);
    console.log(`  is_tgl: ${data.is_tgl}`);
    console.log(`  Sold At: ${data.sold_at}`);
  }
  console.log('');
}
