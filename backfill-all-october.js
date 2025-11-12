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

const TGL_OPTION_NAME = 'Option C - System Update';
const BIG_SALE_THRESHOLD = 10000;

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

async function fetchAllEstimates(accessToken, startDate, endDate) {
  const baseUrl = `${env.ST_BASE_URL}/sales/v2/tenant/${env.ST_TENANT_ID}/estimates/export`;

  let allEstimates = [];
  let page = 1;
  let continueToken = null;

  console.log(`\n🔄 Fetching ALL paid estimates from ${startDate} to ${endDate}...\n`);

  while (true) {
    const url = new URL(baseUrl);
    url.searchParams.append('soldOnOrAfter', startDate);
    url.searchParams.append('soldOnOrBefore', endDate);
    url.searchParams.append('status', 'Sold');
    url.searchParams.append('pageSize', '500'); // Max page size

    if (continueToken) {
      url.searchParams.append('continueFrom', continueToken);
    }

    console.log(`   📄 Fetching page ${page}...`);

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'ST-App-Key': env.ST_APP_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch estimates page ${page}: ${response.status}`);
    }

    const data = await response.json();
    const estimates = data.data || [];

    console.log(`   ✅ Got ${estimates.length} estimates on page ${page}`);

    allEstimates = allEstimates.concat(estimates);

    if (!data.continueFrom || estimates.length === 0) {
      console.log(`\n✅ Finished fetching! Total estimates: ${allEstimates.length}\n`);
      break;
    }

    continueToken = data.continueFrom;
    page++;

    // Rate limit delay
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return allEstimates;
}

async function processEstimate(estimate, accessToken) {
  const estimateId = estimate.id.toString();
  const soldAt = estimate.soldOn;
  const amount = estimate.subtotal || 0;

  // Check if already exists
  const { data: existing } = await supabase
    .from('estimates')
    .select('id')
    .eq('estimate_id', estimateId)
    .single();

  if (existing) {
    return { action: 'skipped', estimateId };
  }

  // Fetch customer details
  const customerUrl = `${env.ST_BASE_URL}/crm/v2/tenant/${env.ST_TENANT_ID}/customers/${estimate.customerId}`;
  const customerResponse = await fetch(customerUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'ST-App-Key': env.ST_APP_KEY,
    },
  });

  let customerName = 'Unknown Customer';
  if (customerResponse.ok) {
    const customerData = await customerResponse.json();
    customerName = customerData.name || 'Unknown Customer';
  }

  // Fetch salesperson details
  const technicianUrl = `${env.ST_BASE_URL}/settings/v2/tenant/${env.ST_TENANT_ID}/technicians/${estimate.soldBy}`;
  const technicianResponse = await fetch(technicianUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'ST-App-Key': env.ST_APP_KEY,
    },
  });

  let salesperson = 'Unknown';
  if (technicianResponse.ok) {
    const technicianData = await technicianResponse.json();
    salesperson = technicianData.name || 'Unknown';
  }

  // Detect TGL from estimate name
  const estimateName = estimate.name || '';
  const isTGL = estimateName.includes(TGL_OPTION_NAME);
  const isBigSale = amount > BIG_SALE_THRESHOLD;

  // Prepare data
  const estimateData = {
    estimate_id: estimateId,
    sold_at: soldAt,
    amount,
    salesperson,
    customer_name: customerName,
    option_name: estimateName,
    is_tgl: isTGL,
    is_big_sale: isBigSale,
  };

  // Insert into database
  const { error } = await supabase.from('estimates').insert(estimateData);

  if (error) {
    console.error(`   ❌ Failed to insert ${estimateId}:`, error.message);
    return { action: 'error', estimateId, error: error.message };
  }

  return { action: 'inserted', estimateId, isTGL, isBigSale, salesperson, amount };
}

async function main() {
  const startDate = '2025-10-01';
  const endDate = '2025-10-31';

  console.log('🚀 Starting COMPLETE October backfill...');
  console.log(`📅 Date range: ${startDate} to ${endDate}`);

  const accessToken = await getAccessToken();
  console.log('✅ Authenticated with ServiceTitan');

  const estimates = await fetchAllEstimates(accessToken, startDate, endDate);

  console.log(`\n📦 Processing ${estimates.length} estimates...\n`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  let tglsFound = 0;
  let bigSalesFound = 0;

  for (let i = 0; i < estimates.length; i++) {
    const estimate = estimates[i];

    if (i % 10 === 0 && i > 0) {
      console.log(`   Progress: ${i}/${estimates.length} (${Math.round(i/estimates.length*100)}%)`);
    }

    const result = await processEstimate(estimate, accessToken);

    if (result.action === 'inserted') {
      inserted++;
      if (result.isTGL) {
        tglsFound++;
        console.log(`   🎯 TGL: ${result.estimateId} | ${result.salesperson}`);
      }
      if (result.isBigSale) {
        bigSalesFound++;
      }
    } else if (result.action === 'skipped') {
      skipped++;
    } else if (result.action === 'error') {
      errors++;
    }

    // Rate limit delay
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log('\n✅ ===== BACKFILL COMPLETE =====');
  console.log(`   Total processed: ${estimates.length}`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Skipped (already exist): ${skipped}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   TGLs found: ${tglsFound}`);
  console.log(`   Big Sales found: ${bigSalesFound}`);
}

main().catch(console.error);
