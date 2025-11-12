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
    const errorText = await authResponse.text();
    throw new Error(`Auth failed: ${authResponse.status} - ${errorText}`);
  }

  const authData = await authResponse.json();
  return authData.access_token;
}

async function investigateExport() {
  console.log('🔍 Investigating ServiceTitan Export API...\n');

  const accessToken = await getAccessToken();
  console.log('✅ Authenticated\n');

  // Test: Get just 5 estimates from Oct 27 (a day we know has data)
  const testDate = '2025-10-27';
  const baseUrl = `${env.ST_BASE_URL}/sales/v2/tenant/${env.ST_TENANT_ID}/estimates/export`;

  const url = new URL(baseUrl);
  url.searchParams.append('soldOnOrAfter', testDate);
  url.searchParams.append('soldOnOrBefore', testDate);
  url.searchParams.append('status', 'Sold');
  url.searchParams.append('pageSize', '5'); // Just get 5 to examine

  console.log(`📡 Requesting: ${url.toString()}\n`);

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'ST-App-Key': env.ST_APP_KEY,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Request failed: ${response.status}`);
    console.error(errorText);
    return;
  }

  const data = await response.json();

  console.log('📊 Response structure:');
  console.log(`   - data.length: ${data.data?.length || 0}`);
  console.log(`   - hasMore: ${data.hasMore}`);
  console.log(`   - continueFrom: ${data.continueFrom ? 'present' : 'null'}\n`);

  if (data.data && data.data.length > 0) {
    console.log('📝 First estimate structure:\n');
    const firstEstimate = data.data[0];
    console.log(JSON.stringify(firstEstimate, null, 2));

    console.log('\n\n📋 Key fields from first 5 estimates:');
    data.data.forEach((est, i) => {
      console.log(`\n${i + 1}. ID: ${est.id}`);
      console.log(`   Name: ${est.name || '(no name)'}`);
      console.log(`   Status: ${est.status}`);
      console.log(`   Sold On: ${est.soldOn || '(null)'}`);
      console.log(`   Created On: ${est.createdOn}`);
      console.log(`   Modified On: ${est.modifiedOn}`);
      console.log(`   Subtotal: $${est.subtotal || 0}`);
      console.log(`   Sold By: ${est.soldBy || '(null)'}`);
    });
  }

  // Now check what the total count might be
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔢 Checking actual count for Oct 27...\n');

  let totalCount = 0;
  let soldCount = 0;
  let page = 1;
  let continueToken = null;

  while (page <= 3) { // Only check first 3 pages
    const url2 = new URL(baseUrl);
    url2.searchParams.append('soldOnOrAfter', testDate);
    url2.searchParams.append('soldOnOrBefore', testDate);
    url2.searchParams.append('status', 'Sold');
    url2.searchParams.append('pageSize', '500');

    if (continueToken) {
      url2.searchParams.append('continueFrom', continueToken);
    }

    const response2 = await fetch(url2.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'ST-App-Key': env.ST_APP_KEY,
      },
    });

    if (!response2.ok) break;

    const data2 = await response2.json();
    const estimates = data2.data || [];

    totalCount += estimates.length;

    // Count how many actually have soldOn date
    const sold = estimates.filter(e => e.soldOn && e.soldOn.startsWith(testDate));
    soldCount += sold.length;

    console.log(`   Page ${page}: ${estimates.length} estimates, ${sold.length} actually sold on ${testDate}`);

    if (!data2.continueFrom || estimates.length === 0) break;

    continueToken = data2.continueFrom;
    page++;

    if (page > 3) {
      console.log(`\n   ⚠️ Stopping after 3 pages for testing...`);
      console.log(`   (There are likely more pages)`);
    }
  }

  console.log(`\n📊 Summary (first 3 pages):  `);
  console.log(`   Total estimates returned: ${totalCount}`);
  console.log(`   Actually sold on ${testDate}: ${soldCount}`);
  console.log(`\n💡 This suggests the API filter might not be working as expected!`);
}

investigateExport().catch(console.error);
