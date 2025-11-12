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

// Use UTC dates to avoid timezone issues
const startOfDay = '2025-10-27T00:00:00.000Z';
const endOfDay = '2025-10-27T23:59:59.999Z';

console.log(`Checking for TGLs sold on Oct 27, 2025`);
console.log(`Date range: ${startOfDay} to ${endOfDay}\n`);

const { data: tgls, error } = await supabase
  .from('estimates')
  .select('estimate_id, salesperson, amount, option_name, is_tgl, sold_at')
  .eq('is_tgl', true)
  .gte('sold_at', startOfDay)
  .lte('sold_at', endOfDay)
  .order('sold_at', { ascending: true });

if (error) {
  console.error('Error:', error);
} else {
  console.log(`Found ${tgls.length} TGLs for today:\n`);
  tgls.forEach((tgl, i) => {
    console.log(`${i + 1}. ID: ${tgl.estimate_id}`);
    console.log(`   Salesperson: ${tgl.salesperson}`);
    console.log(`   Amount: $${tgl.amount}`);
    console.log(`   Name: "${tgl.option_name}"`);
    console.log(`   Sold At: ${tgl.sold_at}`);
    console.log('');
  });
}
