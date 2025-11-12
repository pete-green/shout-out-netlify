// Script to look up actual names for technician IDs
// Run with: node lookup-technician-names.js

import { readFileSync } from 'fs';

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

// Get technician details
async function getTechnicianDetails(technicianId, token) {
  const url = `${ST_CONFIG.baseUrl}/settings/v2/tenant/${ST_CONFIG.tenantId}/technicians/${technicianId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'ST-App-Key': ST_CONFIG.applicationKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
}

async function lookupTechnicians() {
  try {
    console.log('🔍 Looking up technician names from ServiceTitan API...\n');

    const technicianIds = [
      117091306,
      117210360,
      151755676,
      151899218,
      17438063
    ];

    const token = await getServiceTitanToken();
    console.log('✅ Authenticated with ServiceTitan\n');

    for (const id of technicianIds) {
      console.log(`📋 Technician #${id}:`);

      const details = await getTechnicianDetails(id, token);

      if (details) {
        console.log(`   ✅ Found: ${details.name || 'NO NAME'}`);
        console.log(`   Active: ${details.active || false}`);
        console.log(`   Email: ${details.email || 'N/A'}`);
        console.log(`   Phone: ${details.phone || 'N/A'}`);
      } else {
        console.log(`   ❌ Not found in ServiceTitan (deleted or invalid ID)`);
      }
      console.log('');

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log('✅ Lookup complete\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

lookupTechnicians();
