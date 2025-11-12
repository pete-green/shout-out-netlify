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

console.log('🔍 Checking TGL count for October 2025...\n');

// Get the month date range (what the user likely has selected)
const startDate = '2025-10-01';
const endDate = '2025-10-31';

console.log(`Date range: ${startDate} to ${endDate}\n`);

// Query 1: Direct UTC query (what the dashboard currently does)
const { data: utcData, error: utcError } = await supabase
  .from('estimates')
  .select('id, estimate_id, salesperson, sold_at, is_tgl')
  .eq('is_tgl', true)
  .gte('sold_at', `${startDate}T00:00:00`)
  .lte('sold_at', `${endDate}T23:59:59.999`);

if (utcError) {
  console.error('❌ Error with UTC query:', utcError);
} else {
  console.log(`📊 UTC Query Result: ${utcData.length} TGLs`);
  utcData.forEach(tgl => {
    console.log(`   - ${tgl.estimate_id} | ${tgl.salesperson} | ${tgl.sold_at}`);
  });
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Query 2: Get ALL TGLs and filter in JavaScript using Eastern Time
const { data: allData, error: allError } = await supabase
  .from('estimates')
  .select('id, estimate_id, salesperson, sold_at, is_tgl')
  .eq('is_tgl', true);

if (allError) {
  console.error('❌ Error with all TGLs query:', allError);
} else {
  console.log(`📊 Total TGLs in database: ${allData.length}\n`);

  // Filter by Eastern Time date
  const etTGLs = allData.filter(tgl => {
    const soldDate = new Date(tgl.sold_at);
    const etDateString = soldDate.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const [month, day, year] = etDateString.split(/[\/, ]/);
    const etDate = `${year}-${month}-${day}`;

    return etDate >= startDate && etDate <= endDate;
  });

  console.log(`📊 Eastern Time Filter Result: ${etTGLs.length} TGLs`);
  console.log('\nTGLs in October (Eastern Time):');
  etTGLs.forEach(tgl => {
    const soldDate = new Date(tgl.sold_at);
    const etString = soldDate.toLocaleString('en-US', { timeZone: 'America/New_York' });
    console.log(`   - ${tgl.estimate_id} | ${tgl.salesperson} | UTC: ${tgl.sold_at} | ET: ${etString}`);
  });
}
