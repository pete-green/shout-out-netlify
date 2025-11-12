// Check if October 25th has data in ServiceTitan
import { readFileSync } from 'fs';

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

async function checkDate(startDate, endDate, token) {
  const allEstimates = [];
  let page = 1;
  const pageSize = 5000;
  let hasMore = true;

  console.log(`📡 Checking ServiceTitan for estimates from ${startDate} to ${endDate}...\n`);

  while (hasMore) {
    const url = `${ST_CONFIG.baseUrl}/sales/v2/tenant/${ST_CONFIG.tenantId}/estimates?soldAfter=${encodeURIComponent(startDate)}&page=${page}&pageSize=${pageSize}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'ST-App-Key': ST_CONFIG.applicationKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    const data = await response.json();
    const estimates = data.data || [];

    allEstimates.push(...estimates);

    if (estimates.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  // Filter to the specific date range
  const filtered = allEstimates.filter(est => {
    const soldDate = new Date(est.soldOn);
    return soldDate >= new Date(startDate) && soldDate < new Date(endDate);
  });

  return filtered;
}

async function main() {
  try {
    const token = await getServiceTitanToken();

    // Check specific problem dates
    const datesToCheck = [
      { name: 'October 25', start: '2025-10-25T00:00:00', end: '2025-10-26T00:00:00' },
      { name: 'October 4', start: '2025-10-04T00:00:00', end: '2025-10-05T00:00:00' },
      { name: 'October 5', start: '2025-10-05T00:00:00', end: '2025-10-06T00:00:00' },
      { name: 'October 11', start: '2025-10-11T00:00:00', end: '2025-10-12T00:00:00' },
      { name: 'October 12', start: '2025-10-12T00:00:00', end: '2025-10-13T00:00:00' },
    ];

    console.log('═══════════════════════════════════════════════════\n');

    for (const date of datesToCheck) {
      const estimates = await checkDate(date.start, date.end, token);
      const dayOfWeek = new Date(date.start).toLocaleDateString('en-US', { weekday: 'long' });

      console.log(`📅 ${date.name} (${dayOfWeek}): ${estimates.length} estimates in ServiceTitan`);

      if (estimates.length === 0) {
        console.log(`   ℹ️  Legitimately had no sales that day\n`);
      } else if (estimates.length > 5) {
        console.log(`   ⚠️  MISSING DATA! Should have ${estimates.length} estimates\n`);
      } else {
        console.log(`   ✅ Low count appears accurate\n`);
      }
    }

    console.log('═══════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
