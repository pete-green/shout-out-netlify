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

const supabase = createClient(env.VITE_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const TGL_OPTION_NAME = 'Option C - System Update';
const BIG_SALE_THRESHOLD = 10000;

async function getAccessToken() {
  const authUrl = env.ST_AUTH_URL;
  const authBody = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.ST_CLIENT_ID,
    client_secret: env.ST_CLIENT_SECRET,
  });

  const authResponse = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: authBody,
  });

  if (!authResponse.ok) {
    throw new Error(`Auth failed: ${authResponse.status}`);
  }

  const authData = await authResponse.json();
  return authData.access_token;
}

// Use the CORRECT endpoint (not /export)
async function getSoldEstimates(accessToken, soldAfter) {
  const url = `${env.ST_BASE_URL}/sales/v2/tenant/${env.ST_TENANT_ID}/estimates?soldAfter=${encodeURIComponent(soldAfter)}`;

  console.log(`📡 Fetching estimates sold after: ${soldAfter}`);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'ST-App-Key': env.ST_APP_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch estimates: ${response.status}`);
  }

  const data = await response.json();
  return data.data || [];
}

async function getTechnician(accessToken, technicianId) {
  const url = `${env.ST_BASE_URL}/settings/v2/tenant/${env.ST_TENANT_ID}/technicians/${technicianId}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'ST-App-Key': env.ST_APP_KEY,
    },
  });

  if (!response.ok) {
    return `Technician #${technicianId}`;
  }

  const data = await response.json();
  return data.name || `Technician #${technicianId}`;
}

async function getCustomer(accessToken, customerId) {
  const url = `${env.ST_BASE_URL}/crm/v2/tenant/${env.ST_TENANT_ID}/customers/${customerId}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'ST-App-Key': env.ST_APP_KEY,
    },
  });

  if (!response.ok) {
    return `Customer #${customerId}`;
  }

  const data = await response.json();
  return data.name || `Customer #${customerId}`;
}

async function main() {
  console.log('🚀 Backfilling October 2025 using CORRECT API endpoint...\n');

  // Start from Oct 1, 2025 00:00:00
  const startDate = '2025-10-01T00:00:00Z';

  const accessToken = await getAccessToken();
  console.log('✅ Authenticated\n');

  const estimates = await getSoldEstimates(accessToken, startDate);

  console.log(`✅ Found ${estimates.length} estimates sold since ${startDate}\n`);

  // Filter to only October (soldOn between Oct 1 and Oct 31)
  const octoberEstimates = estimates.filter(est => {
    if (!est.soldOn) return false;
    const soldDate = new Date(est.soldOn);
    return soldDate >= new Date('2025-10-01T00:00:00Z') &&
           soldDate <= new Date('2025-10-31T23:59:59.999Z');
  });

  console.log(`📅 ${octoberEstimates.length} estimates sold in October\n`);

  let inserted = 0;
  let skipped = 0;
  let tglsFound = 0;
  let bigSalesFound = 0;

  for (let i = 0; i < octoberEstimates.length; i++) {
    const estimate = octoberEstimates[i];
    const estimateId = estimate.id.toString();

    if (i % 20 === 0 && i > 0) {
      console.log(`   Progress: ${i}/${octoberEstimates.length} (${Math.round(i/octoberEstimates.length*100)}%)`);
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from('estimates')
      .select('id')
      .eq('estimate_id', estimateId)
      .single();

    if (existing) {
      skipped++;
      continue;
    }

    const amount = estimate.subtotal || 0;
    const estimateName = estimate.name || '';
    const isTGL = estimateName.includes(TGL_OPTION_NAME);
    const isBigSale = amount > BIG_SALE_THRESHOLD;

    // Fetch salesperson
    const salesperson = await getTechnician(accessToken, estimate.soldBy);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Fetch customer
    const customerName = await getCustomer(accessToken, estimate.customerId);
    await new Promise(resolve => setTimeout(resolve, 100));

    // Insert
    const { error } = await supabase.from('estimates').insert({
      estimate_id: estimateId,
      sold_at: estimate.soldOn,
      amount,
      salesperson,
      customer_name: customerName,
      option_name: estimateName,
      is_tgl: isTGL,
      is_big_sale: isBigSale,
    });

    if (error) {
      console.error(`   ❌ Error inserting ${estimateId}:`, error.message);
      continue;
    }

    inserted++;
    if (isTGL) {
      tglsFound++;
      console.log(`   🎯 TGL: ${estimateId} | ${salesperson} | $${amount}`);
    }
    if (isBigSale) {
      bigSalesFound++;
    }
  }

  console.log('\n✅ ===== BACKFILL COMPLETE =====');
  console.log(`   Total found: ${octoberEstimates.length}`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped (already exist): ${skipped}`);
  console.log(`   TGLs found: ${tglsFound}`);
  console.log(`   Big Sales found: ${bigSalesFound}`);
}

main().catch(console.error);
