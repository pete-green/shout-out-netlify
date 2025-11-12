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

// Missing days from October
const MISSING_DAYS = [8, 18, 19, 21, 25, 28, 29, 30, 31];

async function getAccessToken() {
  const authUrl = env.ST_AUTH_URL || 'https://auth.servicetitan.io/connect/token';
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

async function fetchEstimatesForDay(accessToken, date) {
  const baseUrl = `${env.ST_BASE_URL}/sales/v2/tenant/${env.ST_TENANT_ID}/estimates/export`;
  const estimates = [];
  let continueToken = null;
  let page = 1;

  console.log(`\n   🔄 Fetching estimates for ${date}...`);

  while (true) {
    const url = new URL(baseUrl);
    url.searchParams.append('soldOnOrAfter', date);
    url.searchParams.append('soldOnOrBefore', date);
    url.searchParams.append('status', 'Sold');
    url.searchParams.append('pageSize', '500');

    if (continueToken) {
      url.searchParams.append('continueFrom', continueToken);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'ST-App-Key': env.ST_APP_KEY,
      },
    });

    if (!response.ok) {
      console.error(`   ❌ Failed to fetch page ${page}: ${response.status}`);
      break;
    }

    const data = await response.json();
    const pageEstimates = data.data || [];

    if (pageEstimates.length > 0) {
      estimates.push(...pageEstimates);
      console.log(`      Page ${page}: ${pageEstimates.length} estimates (total: ${estimates.length})`);
    }

    if (!data.continueFrom || pageEstimates.length === 0) {
      break;
    }

    continueToken = data.continueFrom;
    page++;
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`   ✅ Total for ${date}: ${estimates.length} estimates`);
  return estimates;
}

async function processEstimate(estimate, accessToken) {
  const estimateId = estimate.id.toString();

  // Check if already exists
  const { data: existing } = await supabase
    .from('estimates')
    .select('id')
    .eq('estimate_id', estimateId)
    .single();

  if (existing) {
    return { action: 'skipped' };
  }

  const amount = estimate.subtotal || 0;
  const estimateName = estimate.name || '';
  const isTGL = estimateName.includes(TGL_OPTION_NAME);
  const isBigSale = amount > BIG_SALE_THRESHOLD;

  // Fetch customer
  let customerName = 'Unknown Customer';
  try {
    const customerUrl = `${env.ST_BASE_URL}/crm/v2/tenant/${env.ST_TENANT_ID}/customers/${estimate.customerId}`;
    const customerResponse = await fetch(customerUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'ST-App-Key': env.ST_APP_KEY,
      },
    });

    if (customerResponse.ok) {
      const customerData = await customerResponse.json();
      customerName = customerData.name || 'Unknown Customer';
    }
  } catch (error) {
    console.error(`      ⚠️ Could not fetch customer for ${estimateId}`);
  }

  // Fetch salesperson
  let salesperson = 'Unknown';
  try {
    const technicianUrl = `${env.ST_BASE_URL}/settings/v2/tenant/${env.ST_TENANT_ID}/technicians/${estimate.soldBy}`;
    const technicianResponse = await fetch(technicianUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'ST-App-Key': env.ST_APP_KEY,
      },
    });

    if (technicianResponse.ok) {
      const technicianData = await technicianResponse.json();
      salesperson = technicianData.name || 'Unknown';
    }
  } catch (error) {
    console.error(`      ⚠️ Could not fetch technician for ${estimateId}`);
  }

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
    return { action: 'error', error: error.message };
  }

  return { action: 'inserted', isTGL, isBigSale, salesperson };
}

async function main() {
  console.log('🚀 Backfilling missing October days...\n');
  console.log(`📅 Missing days: ${MISSING_DAYS.join(', ')}\n`);

  const accessToken = await getAccessToken();
  console.log('✅ Authenticated with ServiceTitan\n');

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalTGLs = 0;

  for (const day of MISSING_DAYS) {
    const date = `2025-10-${day.toString().padStart(2, '0')}`;
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📆 Processing ${date}...`);

    const estimates = await fetchEstimatesForDay(accessToken, date);

    if (estimates.length === 0) {
      console.log(`   ⚠️ No estimates found for this day`);
      continue;
    }

    console.log(`\n   🔄 Processing ${estimates.length} estimates...`);

    let dayInserted = 0;
    let daySkipped = 0;
    let dayErrors = 0;
    let dayTGLs = 0;

    for (let i = 0; i < estimates.length; i++) {
      if (i % 50 === 0 && i > 0) {
        console.log(`      Progress: ${i}/${estimates.length}`);
      }

      const result = await processEstimate(estimates[i], accessToken);

      if (result.action === 'inserted') {
        dayInserted++;
        if (result.isTGL) {
          dayTGLs++;
          console.log(`      🎯 TGL found: ${result.salesperson}`);
        }
      } else if (result.action === 'skipped') {
        daySkipped++;
      } else if (result.action === 'error') {
        dayErrors++;
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    totalInserted += dayInserted;
    totalSkipped += daySkipped;
    totalErrors += dayErrors;
    totalTGLs += dayTGLs;

    console.log(`\n   ✅ ${date} complete:`);
    console.log(`      Inserted: ${dayInserted}`);
    console.log(`      Skipped: ${daySkipped}`);
    console.log(`      TGLs: ${dayTGLs}`);
    console.log(`      Errors: ${dayErrors}`);
  }

  console.log('\n\n✅ ===== BACKFILL COMPLETE =====');
  console.log(`   Total inserted: ${totalInserted}`);
  console.log(`   Total skipped: ${totalSkipped}`);
  console.log(`   Total TGLs found: ${totalTGLs}`);
  console.log(`   Total errors: ${totalErrors}`);
}

main().catch(console.error);
