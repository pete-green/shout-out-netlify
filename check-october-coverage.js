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

console.log('🔍 Checking October coverage in database...\n');

const startDate = '2025-10-01';
const endDate = '2025-10-31';

// Get all estimates from October grouped by date
const { data: allEstimates, error } = await supabase
  .from('estimates')
  .select('sold_at')
  .gte('sold_at', `${startDate}T00:00:00`)
  .lte('sold_at', `${endDate}T23:59:59.999`)
  .order('sold_at', { ascending: true });

if (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

// Group by Eastern Time date
const dateMap = {};

allEstimates.forEach(est => {
  const soldDate = new Date(est.sold_at);
  const etDateString = soldDate.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [month, day, year] = etDateString.split('/');
  const etDate = `${year}-${month}-${day}`;

  dateMap[etDate] = (dateMap[etDate] || 0) + 1;
});

console.log('📅 Estimates per day in October (Eastern Time):\n');

// Create array of all October dates
const dates = [];
for (let day = 1; day <= 31; day++) {
  const dateStr = `2025-10-${day.toString().padStart(2, '0')}`;
  dates.push(dateStr);
}

let totalEstimates = 0;
let daysWithData = 0;
let daysWithoutData = 0;

dates.forEach(date => {
  const count = dateMap[date] || 0;
  if (count > 0) {
    console.log(`   ${date}: ${count} estimates`);
    daysWithData++;
    totalEstimates += count;
  } else {
    console.log(`   ${date}: ⚠️ NO DATA`);
    daysWithoutData++;
  }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('📊 SUMMARY:');
console.log(`   Days with data: ${daysWithData}`);
console.log(`   Days without data: ${daysWithoutData}`);
console.log(`   Total estimates: ${totalEstimates}`);
console.log(`\n⚠️ If there are days without data, we need to backfill those dates!`);
