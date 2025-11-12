// Script to add missing salespeople from estimates to salespeople table
// This ensures old/inactive technicians show up in the People section
// Run with: node sync-missing-salespeople.js

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
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

const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function syncMissingSalespeople() {
  try {
    console.log('🔍 Finding all unique salespeople in estimates...\n');

    // Get all unique salesperson names from estimates
    const { data: estimates, error: estimatesError } = await supabase
      .from('estimates')
      .select('salesperson')
      .limit(10000);

    if (estimatesError) {
      console.error('❌ Error fetching estimates:', estimatesError.message);
      process.exit(1);
    }

    const uniqueSalespeople = [...new Set(estimates.map(e => e.salesperson).filter(Boolean))];
    console.log(`✅ Found ${uniqueSalespeople.length} unique salespeople in estimates\n`);

    // Get all existing salespeople names
    const { data: existingSalespeople, error: salesError } = await supabase
      .from('salespeople')
      .select('name')
      .limit(1000);

    if (salesError) {
      console.error('❌ Error fetching salespeople:', salesError.message);
      process.exit(1);
    }

    const existingNames = new Set(existingSalespeople.map(s => s.name));
    console.log(`✅ Found ${existingNames.size} existing salespeople in database\n`);

    // Find missing salespeople
    const missingSalespeople = uniqueSalespeople.filter(name => !existingNames.has(name));

    console.log(`📋 Found ${missingSalespeople.length} missing salespeople:\n`);
    missingSalespeople.forEach(name => {
      console.log(`   - ${name}`);
    });

    if (missingSalespeople.length === 0) {
      console.log('\n✅ All salespeople from estimates are already in the database!');
      return;
    }

    console.log('\n⚠️  Ready to add these salespeople to the database');
    console.log('   They will be added with:');
    console.log('   - business_unit: null (you can assign departments in the UI)');
    console.log('   - is_active: false (marked as inactive since they\'re missing from ST API)');
    console.log('   - st_active: false');
    console.log('\n   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('💾 Adding missing salespeople...\n');

    let addedCount = 0;
    for (const name of missingSalespeople) {
      const { error: insertError } = await supabase
        .from('salespeople')
        .insert({
          name,
          technician_id: null, // These are historical, don't have ST technician ID
          business_unit: null, // User will assign in UI
          is_active: false, // Mark as inactive (old technician)
          st_active: false, // Not in ServiceTitan API
          email: null,
          phone: null,
          headshot_url: null,
          raw_data: null,
          last_synced_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error(`❌ Error adding ${name}:`, insertError.message);
      } else {
        console.log(`   ✅ Added ${name}`);
        addedCount++;
      }
    }

    console.log(`\n✅ Successfully added ${addedCount} missing salespeople!`);
    console.log('\n📌 Next steps:');
    console.log('   1. Go to the People section in your app');
    console.log('   2. Find the newly added salespeople (marked as inactive)');
    console.log('   3. Assign them to their correct departments');
    console.log('   4. Their historical sales will now count toward department totals\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

syncMissingSalespeople();
