// Local script to backfill October data
// Run with: node backfill-october-local.js

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

// ServiceTitan API configuration
const ST_CONFIG = {
  baseUrl: env.ST_BASE_URL,
  authUrl: env.ST_AUTH_URL,
  tenantId: env.ST_TENANT_ID,
  applicationKey: env.ST_APP_KEY,
  clientId: env.ST_CLIENT_ID,
  clientSecret: env.ST_CLIENT_SECRET,
};

// Supabase configuration
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error(`   SUPABASE_URL: ${SUPABASE_URL ? 'found' : 'MISSING'}`);
  console.error(`   SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_KEY ? 'found' : 'MISSING'}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Get ServiceTitan OAuth token
async function getServiceTitanToken() {
  console.log('🔑 Fetching ServiceTitan token...');

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
  console.log('✅ Token obtained\n');
  return tokenData.access_token;
}

// Fetch sold estimates from ServiceTitan API
async function getSoldEstimates(soldAfter, bearerToken) {
  const url = `${ST_CONFIG.baseUrl}/sales/v2/tenant/${ST_CONFIG.tenantId}/estimates?soldAfter=${encodeURIComponent(soldAfter)}`;

  console.log(`📡 Fetching estimates from ServiceTitan...`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'ST-App-Key': ST_CONFIG.applicationKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }

  const data = await response.json();
  return data.data || [];
}

// Get technician name by ID (with caching)
const technicianCache = new Map();
async function getTechnician(technicianId, bearerToken) {
  if (technicianCache.has(technicianId)) {
    return technicianCache.get(technicianId);
  }

  try {
    const url = `${ST_CONFIG.baseUrl}/settings/v2/tenant/${ST_CONFIG.tenantId}/technicians/${technicianId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'ST-App-Key': ST_CONFIG.applicationKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return `Technician #${technicianId}`;
    }

    const data = await response.json();
    const name = data.name || `Technician #${technicianId}`;
    technicianCache.set(technicianId, name);
    return name;
  } catch (error) {
    return `Technician #${technicianId}`;
  }
}

// Get customer name by ID (with caching)
const customerCache = new Map();
async function getCustomer(customerId, bearerToken) {
  if (customerCache.has(customerId)) {
    return customerCache.get(customerId);
  }

  try {
    const url = `${ST_CONFIG.baseUrl}/crm/v2/tenant/${ST_CONFIG.tenantId}/customers/${customerId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'ST-App-Key': ST_CONFIG.applicationKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return `Customer #${customerId}`;
    }

    const data = await response.json();
    const name = data.name || `Customer #${customerId}`;
    customerCache.set(customerId, name);
    return name;
  } catch (error) {
    return `Customer #${customerId}`;
  }
}

// Format customer name
function formatCustomerName(rawName) {
  if (rawName.indexOf(',') !== -1) {
    const parts = rawName.split(',');
    if (parts.length === 2) {
      const last = parts[0].trim();
      const first = parts[1].trim();
      return `${first} ${last}`;
    }
  }
  return rawName;
}

// Main function
async function backfillOctober() {
  try {
    console.log('🔄 ===== STARTING OCTOBER BACKFILL =====\n');

    // Get settings from database
    const { data: settings } = await supabase
      .from('app_state')
      .select('key, value')
      .in('key', ['big_sale_threshold', 'tgl_option_name']);

    const settingsMap = {};
    (settings || []).forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    const BIG_SALE_THRESHOLD = parseInt(settingsMap.big_sale_threshold || '700', 10);
    const TGL_OPTION_NAME = settingsMap.tgl_option_name
      ? JSON.parse(settingsMap.tgl_option_name)
      : 'Option C - System Update';

    console.log(`⚙️  Settings: Threshold=$${BIG_SALE_THRESHOLD}, TGL="${TGL_OPTION_NAME}"\n`);

    // Get token
    const token = await getServiceTitanToken();

    // Fetch October estimates (Oct 1, 2025 at midnight)
    const startDate = '2025-10-01T00:00:00';
    const endDate = new Date('2025-10-28T00:00:00'); // Through Oct 27

    console.log(`📅 Fetching estimates from ${startDate}...\n`);
    const allEstimates = await getSoldEstimates(startDate, token);
    console.log(`✅ Found ${allEstimates.length} total estimates from ServiceTitan\n`);

    // Filter to October only
    const octoberEstimates = allEstimates.filter((est) => {
      const soldDate = new Date(est.soldOn);
      return soldDate < endDate;
    });

    console.log(`📊 Filtered to ${octoberEstimates.length} estimates in October\n`);

    // Check which ones exist in database
    const estimateIds = octoberEstimates.map(e => e.id);
    const { data: existing } = await supabase
      .from('estimates')
      .select('estimate_id')
      .in('estimate_id', estimateIds);

    const existingIds = new Set((existing || []).map(e => e.estimate_id));
    console.log(`🔍 Found ${existingIds.size} estimates already in database\n`);

    console.log('═══════════════════════════════════════════════════\n');

    // Process estimates
    const updates = [];
    let tglCount = 0;
    let bigSaleCount = 0;

    for (let i = 0; i < octoberEstimates.length; i++) {
      const estimate = octoberEstimates[i];
      const estimateId = estimate.id;

      // Fetch names
      const salesperson = await getTechnician(estimate.soldBy, token);
      const rawCustomerName = await getCustomer(estimate.customerId, token);
      const customerName = formatCustomerName(rawCustomerName);
      const amount = estimate.subtotal || 0;
      const soldAt = estimate.soldOn;
      const estimateName = estimate.name || '';

      // NEW TGL DETECTION LOGIC
      const isTGL = estimateName.includes(TGL_OPTION_NAME);
      const isBigSale = amount > BIG_SALE_THRESHOLD;

      if (isTGL) tglCount++;
      if (isBigSale) bigSaleCount++;

      const status = existingIds.has(estimateId) ? '🔄 UPDATE' : '✨ INSERT';
      console.log(`${i + 1}. ${status} | ID: ${estimateId}`);
      console.log(`   Salesperson: ${salesperson}`);
      console.log(`   Amount: $${amount.toFixed(2)}`);
      console.log(`   Name: "${estimateName}"`);
      console.log(`   TGL: ${isTGL ? '✅' : '❌'} | Big Sale: ${isBigSale ? '✅' : '❌'}`);
      console.log('');

      updates.push({
        estimate_id: estimateId,
        salesperson,
        customer_name: customerName,
        amount,
        sold_at: soldAt,
        option_name: estimateName,
        is_tgl: isTGL,
        is_big_sale: isBigSale,
        raw_data: estimate,
        poll_log_id: null,
        processed_at: new Date().toISOString(),
      });
    }

    console.log('═══════════════════════════════════════════════════\n');
    console.log('📋 SUMMARY:');
    console.log(`   Total Estimates: ${octoberEstimates.length}`);
    console.log(`   TGLs Found: ${tglCount}`);
    console.log(`   Big Sales Found: ${bigSaleCount}`);
    console.log(`   Already in DB: ${existingIds.size}`);
    console.log(`   New Records: ${octoberEstimates.length - existingIds.size}`);
    console.log('\n═══════════════════════════════════════════════════\n');

    // Ask for confirmation
    console.log('⚠️  READY TO UPDATE DATABASE');
    console.log('   This will UPSERT (insert or update) all records.');
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('💾 Updating database...\n');

    // Update database in batches of 10
    const batchSize = 10;
    let updated = 0;

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      const { error } = await supabase
        .from('estimates')
        .upsert(batch, {
          onConflict: 'estimate_id',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error(`❌ Error updating batch ${Math.floor(i / batchSize) + 1}:`, error.message);
      } else {
        updated += batch.length;
        console.log(`✅ Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(updates.length / batchSize)} updated (${updated}/${updates.length})`);
      }
    }

    console.log('\n✅ ===== BACKFILL COMPLETE =====');
    console.log(`   Records Updated: ${updated}`);
    console.log('═══════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Error during backfill:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the backfill
backfillOctober();
