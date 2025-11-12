// Script to look up inactive technician names from ServiceTitan
// Run with: node lookup-inactive-technicians.js

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

const ST_CONFIG = {
  baseUrl: env.ST_BASE_URL,
  authUrl: env.ST_AUTH_URL,
  tenantId: env.ST_TENANT_ID,
  applicationKey: env.ST_APP_KEY,
  clientId: env.ST_CLIENT_ID,
  clientSecret: env.ST_CLIENT_SECRET,
};

const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Get ServiceTitan OAuth token
async function getServiceTitanToken() {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: ST_CONFIG.clientId,
    client_secret: ST_CONFIG.clientSecret,
  });

  const response = await fetch(ST_CONFIG.authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to authenticate: ${errorText}`);
  }

  const tokenData = await response.json();
  return tokenData.access_token;
}

// Search for technicians by listing ALL (including inactive)
async function getAllTechnicians(token) {
  const allTechnicians = [];
  let page = 1;
  const pageSize = 500;
  let hasMore = true;

  console.log('📡 Fetching ALL technicians (including inactive)...\n');

  while (hasMore) {
    // Include active=any or remove active filter to get both active and inactive
    const url = `${ST_CONFIG.baseUrl}/settings/v2/tenant/${ST_CONFIG.tenantId}/technicians?page=${page}&pageSize=${pageSize}&active=any`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'ST-App-Key': ST_CONFIG.applicationKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch page ${page}: ${response.status}`);
      break;
    }

    const data = await response.json();
    const technicians = data.data || [];

    console.log(`   Page ${page}: Found ${technicians.length} technicians`);
    allTechnicians.push(...technicians);

    if (technicians.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`\n✅ Total technicians fetched: ${allTechnicians.length}\n`);
  return allTechnicians;
}

async function lookupAndUpdateTechnicians() {
  try {
    console.log('🔍 Looking up inactive technician names from ServiceTitan API...\n');

    const targetIds = [117091306, 117210360, 151755676, 151899218, 17438063];

    const token = await getServiceTitanToken();
    console.log('✅ Authenticated with ServiceTitan\n');

    const allTechnicians = await getAllTechnicians(token);

    // Find our target technicians
    const foundTechnicians = allTechnicians.filter(tech =>
      targetIds.includes(tech.id)
    );

    console.log('═══════════════════════════════════════════════════\n');
    console.log(`📋 Found ${foundTechnicians.length} of ${targetIds.length} target technicians:\n`);

    if (foundTechnicians.length === 0) {
      console.log('❌ None of the target technician IDs were found in ServiceTitan.');
      console.log('   This could mean they are from a different tenant or were truly deleted.');
      return;
    }

    for (const tech of foundTechnicians) {
      console.log(`   ✅ Technician #${tech.id}: ${tech.name}`);
      console.log(`      Active: ${tech.active}`);
      console.log(`      Email: ${tech.email || 'N/A'}`);
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════\n');
    console.log('💾 Updating database with correct names...\n');

    // Update the salespeople table with correct names
    for (const tech of foundTechnicians) {
      const oldName = `Technician #${tech.id}`;
      const newName = tech.name;

      // Update salespeople table
      const { error: updateSalespersonError } = await supabase
        .from('salespeople')
        .update({
          name: newName,
          technician_id: tech.id,
          st_active: tech.active || false,
          email: tech.email || null,
          phone: tech.phone || null,
          last_synced_at: new Date().toISOString(),
        })
        .eq('name', oldName);

      if (updateSalespersonError) {
        console.error(`❌ Error updating salesperson ${oldName}:`, updateSalespersonError.message);
        continue;
      }

      // Update all estimates with this technician
      const { error: updateEstimatesError } = await supabase
        .from('estimates')
        .update({ salesperson: newName })
        .eq('salesperson', oldName);

      if (updateEstimatesError) {
        console.error(`❌ Error updating estimates for ${oldName}:`, updateEstimatesError.message);
        continue;
      }

      console.log(`   ✅ Updated "${oldName}" to "${newName}"`);
    }

    console.log('\n✅ Database update complete!\n');
    console.log('📌 Next steps:');
    console.log('   1. Go to the People section');
    console.log('   2. Find these technicians by their real names');
    console.log('   3. Assign them to departments');
    console.log('   4. Their sales will count toward department totals\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

lookupAndUpdateTechnicians();
