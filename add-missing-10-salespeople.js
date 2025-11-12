// Script to add the 10 missing salespeople to the database
// Run with: node add-missing-10-salespeople.js

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

async function addMissingSalespeople() {
  try {
    console.log('📋 Adding 10 missing salespeople to database...\n');

    const missingSalespeople = [
      'David Paschal',
      'Gracyn Chandler',
      'Keelan Taylor',
      'Mike Jacobs',
      'Technician #117091306',
      'Technician #117210360',
      'Technician #151755676',
      'Technician #151899218',
      'Technician #17438063',
      'Tyler Jefferson'
    ];

    console.log('   These salespeople will be added as inactive since they are missing from the People section.');
    console.log('   You can assign them to departments in the UI.\n');

    let addedCount = 0;
    for (const name of missingSalespeople) {
      const { error: insertError } = await supabase
        .from('salespeople')
        .insert({
          name,
          technician_id: null,
          business_unit: null, // User will assign in UI
          is_active: false, // Mark as inactive (historical or unknown)
          st_active: false,
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

    console.log(`\n✅ Successfully added ${addedCount} salespeople!`);
    console.log('\n📌 Next steps:');
    console.log('   1. Go to the People section in your app');
    console.log('   2. Find these newly added salespeople (marked as inactive)');
    console.log('   3. Assign them to their correct departments');
    console.log('   4. Their sales will now count toward department totals instead of "Other"\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

addMissingSalespeople();
