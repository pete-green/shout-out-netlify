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

console.log('🔍 Analyzing ALL estimates in database for potential gaps...\n');

// Get all estimates and group by date
const { data: allEstimates, error } = await supabase
  .from('estimates')
  .select('sold_at')
  .order('sold_at', { ascending: true });

if (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

console.log(`📊 Total estimates in database: ${allEstimates.length}\n`);

// Find date range
const firstDate = new Date(allEstimates[0].sold_at);
const lastDate = new Date(allEstimates[allEstimates.length - 1].sold_at);

console.log(`📅 Date range: ${firstDate.toLocaleDateString('en-US')} to ${lastDate.toLocaleDateString('en-US')}\n`);

// Group by date
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

// Analyze patterns
const dates = Object.keys(dateMap).sort();
const counts = dates.map(date => dateMap[date]);

// Calculate statistics
const total = counts.reduce((sum, count) => sum + count, 0);
const average = total / counts.length;
const sorted = [...counts].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];

console.log('📈 STATISTICS:');
console.log(`   Average estimates per day: ${average.toFixed(1)}`);
console.log(`   Median estimates per day: ${median}`);
console.log(`   Min: ${Math.min(...counts)}`);
console.log(`   Max: ${Math.max(...counts)}`);
console.log('');

// Flag suspicious days
console.log('⚠️  POTENTIALLY INCOMPLETE DAYS (suspiciously low counts):');
console.log('   (Days with < 5 estimates might be incomplete)\n');

let suspiciousDays = 0;
dates.forEach(date => {
  const count = dateMap[date];
  if (count < 5) {
    console.log(`   ${date}: ${count} estimates`);
    suspiciousDays++;
  }
});

console.log(`\n   Total suspicious days: ${suspiciousDays}\n`);

// Check for gaps (missing days)
console.log('📅 CHECKING FOR MISSING DAYS...\n');

const start = new Date(dates[0]);
const end = new Date(dates[dates.length - 1]);
const missingDays = [];

for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  const dateStr = d.toISOString().split('T')[0];
  if (!dateMap[dateStr]) {
    missingDays.push(dateStr);
  }
}

if (missingDays.length > 0) {
  console.log(`⚠️  Found ${missingDays.length} days with NO data:\n`);
  missingDays.forEach(date => {
    console.log(`   ${date}: NO DATA`);
  });
} else {
  console.log('✅ No missing days found!\n');
}

// Show distribution by month
console.log('\n📊 ESTIMATES BY MONTH:\n');
const monthMap = {};
dates.forEach(date => {
  const yearMonth = date.substring(0, 7); // YYYY-MM
  monthMap[yearMonth] = (monthMap[yearMonth] || 0) + dateMap[date];
});

Object.keys(monthMap).sort().forEach(month => {
  console.log(`   ${month}: ${monthMap[month]} estimates`);
});

console.log('\n═══════════════════════════════════════════════════\n');
console.log('🎯 RECOMMENDATION:\n');

if (suspiciousDays > 10 || missingDays.length > 5) {
  console.log('❌ SIGNIFICANT DATA GAPS DETECTED!');
  console.log('   We should do a FULL BACKFILL from the beginning.');
  console.log('   The pagination bug likely caused data loss throughout.\n');
} else {
  console.log('✅ Data looks relatively complete.');
  console.log('   October backfill should be sufficient.\n');
}
