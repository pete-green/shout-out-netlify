// Verification script for June and July 2025 backfill
// Run with: node verify-june-july-backfill.js

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

async function verifyBackfill() {
  try {
    console.log('🔍 ===== VERIFYING JUNE & JULY 2025 BACKFILL =====\n');

    // Check June estimates
    const juneStart = '2025-06-01T00:00:00';
    const juneEnd = '2025-07-01T00:00:00';

    const { data: juneEstimates, error: juneError } = await supabase
      .from('estimates')
      .select('id, estimate_id, is_tgl, is_big_sale, sold_at, salesperson, customer_name, poll_log_id')
      .gte('sold_at', juneStart)
      .lt('sold_at', juneEnd)
      .order('sold_at', { ascending: true });

    if (juneError) {
      console.error('❌ Error fetching June estimates:', juneError.message);
      return;
    }

    console.log('📅 JUNE 2025 RESULTS:');
    console.log(`   Total Estimates: ${juneEstimates.length}`);
    const juneTGLs = juneEstimates.filter(e => e.is_tgl);
    const juneBigSales = juneEstimates.filter(e => e.is_big_sale);
    console.log(`   TGLs: ${juneTGLs.length}`);
    console.log(`   Big Sales: ${juneBigSales.length}`);

    // Check poll_log_id is null (indicates backfill)
    const juneWithPollLog = juneEstimates.filter(e => e.poll_log_id !== null);
    console.log(`   Backfilled (poll_log_id = null): ${juneEstimates.length - juneWithPollLog.length}/${juneEstimates.length}`);

    if (juneWithPollLog.length > 0) {
      console.log(`   ⚠️  Warning: ${juneWithPollLog.length} estimates have poll_log_id set (not backfilled)`);
    }

    // Check for duplicates in June
    const juneIds = juneEstimates.map(e => e.estimate_id);
    const juneUniqueIds = new Set(juneIds);
    if (juneIds.length !== juneUniqueIds.size) {
      console.log(`   ❌ DUPLICATES FOUND: ${juneIds.length - juneUniqueIds.size} duplicate estimate_id(s)`);
    } else {
      console.log(`   ✅ No duplicates found`);
    }

    console.log('\n');

    // Check July estimates
    const julyStart = '2025-07-01T00:00:00';
    const julyEnd = '2025-08-01T00:00:00';

    const { data: julyEstimates, error: julyError } = await supabase
      .from('estimates')
      .select('id, estimate_id, is_tgl, is_big_sale, sold_at, salesperson, customer_name, poll_log_id')
      .gte('sold_at', julyStart)
      .lt('sold_at', julyEnd)
      .order('sold_at', { ascending: true });

    if (julyError) {
      console.error('❌ Error fetching July estimates:', julyError.message);
      return;
    }

    console.log('📅 JULY 2025 RESULTS:');
    console.log(`   Total Estimates: ${julyEstimates.length}`);
    const julyTGLs = julyEstimates.filter(e => e.is_tgl);
    const julyBigSales = julyEstimates.filter(e => e.is_big_sale);
    console.log(`   TGLs: ${julyTGLs.length}`);
    console.log(`   Big Sales: ${julyBigSales.length}`);

    // Check poll_log_id is null (indicates backfill)
    const julyWithPollLog = julyEstimates.filter(e => e.poll_log_id !== null);
    console.log(`   Backfilled (poll_log_id = null): ${julyEstimates.length - julyWithPollLog.length}/${julyEstimates.length}`);

    if (julyWithPollLog.length > 0) {
      console.log(`   ⚠️  Warning: ${julyWithPollLog.length} estimates have poll_log_id set (not backfilled)`);
    }

    // Check for duplicates in July
    const julyIds = julyEstimates.map(e => e.estimate_id);
    const julyUniqueIds = new Set(julyIds);
    if (julyIds.length !== julyUniqueIds.size) {
      console.log(`   ❌ DUPLICATES FOUND: ${julyIds.length - julyUniqueIds.size} duplicate estimate_id(s)`);
    } else {
      console.log(`   ✅ No duplicates found`);
    }

    console.log('\n');

    // Check for notifications sent for these estimates
    const allEstimateUUIDs = [...juneEstimates, ...julyEstimates].map(e => e.id);

    // Split into chunks of 100 to avoid URL length limits
    const chunkSize = 100;
    let totalNotifications = 0;

    for (let i = 0; i < allEstimateUUIDs.length; i += chunkSize) {
      const chunk = allEstimateUUIDs.slice(i, i + chunkSize);
      const { data: notifications, error: notifError } = await supabase
        .from('notifications')
        .select('id, estimate_id, type')
        .in('estimate_id', chunk);

      if (notifError) {
        console.error('❌ Error checking notifications:', notifError.message);
        return;
      }

      totalNotifications += (notifications || []).length;
    }

    console.log('🔔 NOTIFICATION CHECK:');
    if (totalNotifications === 0) {
      console.log(`   ✅ No notifications sent (expected for backfill)`);
    } else {
      console.log(`   ⚠️  Warning: ${totalNotifications} notifications found for backfilled estimates`);
      console.log(`   This may indicate manual celebrations were sent, which is OK.`);
    }

    console.log('\n');
    console.log('═══════════════════════════════════════════════════');
    console.log('📊 SUMMARY:');
    console.log(`   June 2025: ${juneEstimates.length} estimates, ${juneTGLs.length} TGLs`);
    console.log(`   July 2025: ${julyEstimates.length} estimates, ${julyTGLs.length} TGLs`);
    console.log(`   TOTAL: ${juneEstimates.length + julyEstimates.length} estimates, ${juneTGLs.length + julyTGLs.length} TGLs`);
    console.log('═══════════════════════════════════════════════════\n');

    console.log('✅ ===== VERIFICATION COMPLETE =====\n');

  } catch (error) {
    console.error('\n❌ Error during verification:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the verification
verifyBackfill();
