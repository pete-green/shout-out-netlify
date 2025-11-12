// Verification script for ALL 2025 YTD data (Jan-Oct)
// Run with: node verify-2025-ytd.js

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env file
const envFile = readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      let value = valueParts.join('=').trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key.trim()] = value;
    }
  }
});

// Supabase configuration
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verify2025YTD() {
  try {
    console.log('🔍 ===== VERIFYING 2025 YEAR-TO-DATE DATA =====\n');

    const months = [
      { name: 'January', start: '2025-01-01', end: '2025-02-01' },
      { name: 'February', start: '2025-02-01', end: '2025-03-01' },
      { name: 'March', start: '2025-03-01', end: '2025-04-01' },
      { name: 'April', start: '2025-04-01', end: '2025-05-01' },
      { name: 'May', start: '2025-05-01', end: '2025-06-01' },
      { name: 'June', start: '2025-06-01', end: '2025-07-01' },
      { name: 'July', start: '2025-07-01', end: '2025-08-01' },
      { name: 'August', start: '2025-08-01', end: '2025-09-01' },
      { name: 'September', start: '2025-09-01', end: '2025-10-01' },
      { name: 'October', start: '2025-10-01', end: '2025-11-01' },
    ];

    let totalEstimates = 0;
    let totalTGLs = 0;
    let totalRevenue = 0;

    console.log('📊 MONTHLY BREAKDOWN:\n');

    for (const month of months) {
      const { data: estimates, error } = await supabase
        .from('estimates')
        .select('id, is_tgl, amount')
        .gte('sold_at', month.start + 'T00:00:00')
        .lt('sold_at', month.end + 'T00:00:00')
        .limit(10000);

      if (error) {
        console.error(`❌ Error fetching ${month.name}:`, error.message);
        continue;
      }

      const monthEstimates = estimates.length;
      const monthTGLs = estimates.filter(e => e.is_tgl).length;
      const monthRevenue = estimates.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

      totalEstimates += monthEstimates;
      totalTGLs += monthTGLs;
      totalRevenue += monthRevenue;

      console.log(`   ${month.name.padEnd(12)} ${monthEstimates.toString().padStart(4)} estimates  ${monthTGLs.toString().padStart(3)} TGLs  $${monthRevenue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('📈 2025 YEAR-TO-DATE TOTALS:');
    console.log(`   Total Estimates: ${totalEstimates.toLocaleString()}`);
    console.log(`   Total TGLs: ${totalTGLs.toLocaleString()}`);
    console.log(`   Total Revenue: $${totalRevenue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
    console.log('═══════════════════════════════════════════════════\n');

    console.log('✅ ===== VERIFICATION COMPLETE =====\n');

  } catch (error) {
    console.error('\n❌ Error during verification:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the verification
verify2025YTD();
