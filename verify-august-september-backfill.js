// Verification script for August and September 2025 backfill
// Run with: node verify-august-september-backfill.js

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
    console.log('🔍 ===== VERIFYING AUGUST & SEPTEMBER 2025 BACKFILL =====\n');

    // Check August estimates
    const augustStart = '2025-08-01T00:00:00';
    const augustEnd = '2025-09-01T00:00:00';

    const { data: augustEstimates, error: augustError } = await supabase
      .from('estimates')
      .select('id, estimate_id, is_tgl, is_big_sale, sold_at, salesperson, customer_name, poll_log_id')
      .gte('sold_at', augustStart)
      .lt('sold_at', augustEnd)
      .order('sold_at', { ascending: true });

    if (augustError) {
      console.error('❌ Error fetching August estimates:', augustError.message);
      return;
    }

    console.log('📅 AUGUST 2025 RESULTS:');
    console.log(`   Total Estimates: ${augustEstimates.length}`);
    const augustTGLs = augustEstimates.filter(e => e.is_tgl);
    const augustBigSales = augustEstimates.filter(e => e.is_big_sale);
    console.log(`   TGLs: ${augustTGLs.length}`);
    console.log(`   Big Sales: ${augustBigSales.length}`);

    // Check poll_log_id is null (indicates backfill)
    const augustWithPollLog = augustEstimates.filter(e => e.poll_log_id !== null);
    console.log(`   Backfilled (poll_log_id = null): ${augustEstimates.length - augustWithPollLog.length}/${augustEstimates.length}`);

    if (augustWithPollLog.length > 0) {
      console.log(`   ⚠️  Warning: ${augustWithPollLog.length} estimates have poll_log_id set (not backfilled)`);
    }

    // Check for duplicates in August
    const augustIds = augustEstimates.map(e => e.estimate_id);
    const augustUniqueIds = new Set(augustIds);
    if (augustIds.length !== augustUniqueIds.size) {
      console.log(`   ❌ DUPLICATES FOUND: ${augustIds.length - augustUniqueIds.size} duplicate estimate_id(s)`);
    } else {
      console.log(`   ✅ No duplicates found`);
    }

    console.log('\n');

    // Check September estimates
    const septemberStart = '2025-09-01T00:00:00';
    const septemberEnd = '2025-10-01T00:00:00';

    const { data: septemberEstimates, error: septemberError } = await supabase
      .from('estimates')
      .select('id, estimate_id, is_tgl, is_big_sale, sold_at, salesperson, customer_name, poll_log_id')
      .gte('sold_at', septemberStart)
      .lt('sold_at', septemberEnd)
      .order('sold_at', { ascending: true });

    if (septemberError) {
      console.error('❌ Error fetching September estimates:', septemberError.message);
      return;
    }

    console.log('📅 SEPTEMBER 2025 RESULTS:');
    console.log(`   Total Estimates: ${septemberEstimates.length}`);
    const septemberTGLs = septemberEstimates.filter(e => e.is_tgl);
    const septemberBigSales = septemberEstimates.filter(e => e.is_big_sale);
    console.log(`   TGLs: ${septemberTGLs.length}`);
    console.log(`   Big Sales: ${septemberBigSales.length}`);

    // Check poll_log_id is null (indicates backfill)
    const septemberWithPollLog = septemberEstimates.filter(e => e.poll_log_id !== null);
    console.log(`   Backfilled (poll_log_id = null): ${septemberEstimates.length - septemberWithPollLog.length}/${septemberEstimates.length}`);

    if (septemberWithPollLog.length > 0) {
      console.log(`   ⚠️  Warning: ${septemberWithPollLog.length} estimates have poll_log_id set (not backfilled)`);
    }

    // Check for duplicates in September
    const septemberIds = septemberEstimates.map(e => e.estimate_id);
    const septemberUniqueIds = new Set(septemberIds);
    if (septemberIds.length !== septemberUniqueIds.size) {
      console.log(`   ❌ DUPLICATES FOUND: ${septemberIds.length - septemberUniqueIds.size} duplicate estimate_id(s)`);
    } else {
      console.log(`   ✅ No duplicates found`);
    }

    console.log('\n');

    // Check for notifications sent for these estimates
    const allEstimateUUIDs = [...augustEstimates, ...septemberEstimates].map(e => e.id);

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
    console.log(`   August 2025: ${augustEstimates.length} estimates, ${augustTGLs.length} TGLs`);
    console.log(`   September 2025: ${septemberEstimates.length} estimates, ${septemberTGLs.length} TGLs`);
    console.log(`   TOTAL: ${augustEstimates.length + septemberEstimates.length} estimates, ${augustTGLs.length + septemberTGLs.length} TGLs`);
    console.log('═══════════════════════════════════════════════════\n');

    // List all TGLs found
    console.log('\n🎉 TGLs FOUND IN AUGUST:');
    augustTGLs.forEach((tgl, index) => {
      const soldDate = new Date(tgl.sold_at);
      const dateStr = soldDate.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
      const timeStr = soldDate.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
      console.log(`   ${index + 1}. ${dateStr} ${timeStr} | ${tgl.salesperson} | ${tgl.customer_name}`);
    });

    console.log('\n🎉 TGLs FOUND IN SEPTEMBER:');
    septemberTGLs.forEach((tgl, index) => {
      const soldDate = new Date(tgl.sold_at);
      const dateStr = soldDate.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
      const timeStr = soldDate.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
      console.log(`   ${index + 1}. ${dateStr} ${timeStr} | ${tgl.salesperson} | ${tgl.customer_name}`);
    });

    console.log('\n✅ ===== VERIFICATION COMPLETE =====\n');

  } catch (error) {
    console.error('\n❌ Error during verification:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the verification
verifyBackfill();
