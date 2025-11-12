// Quick script to check ServiceTitan API for Chris McCue's $5,659 sale around 6:06 PM
// Run with: node check-missing-sale.js

import { readFileSync } from 'fs';

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

// Get ServiceTitan OAuth token
async function getServiceTitanToken() {
  console.log('🔑 Fetching ServiceTitan token...\n');

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

// Get technician name by ID
async function getTechnician(technicianId, bearerToken) {
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
    return data.name || `Technician #${technicianId}`;
  } catch (error) {
    return `Technician #${technicianId}`;
  }
}

// Get customer name by ID
async function getCustomer(customerId, bearerToken) {
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
    return data.name || `Customer #${customerId}`;
  } catch (error) {
    return `Customer #${customerId}`;
  }
}

async function checkMissingSale() {
  try {
    console.log('🔍 Checking ServiceTitan API for missing sale...\n');

    const token = await getServiceTitanToken();

    // Query for estimates sold after 6:00 PM today (Nov 6, 2025)
    const soldAfter = '2025-11-06T18:00:00'; // 6:00 PM ET in UTC would be 23:00:00 UTC, but ST uses local time

    const url = `${ST_CONFIG.baseUrl}/sales/v2/tenant/${ST_CONFIG.tenantId}/estimates?soldAfter=${encodeURIComponent(soldAfter)}&pageSize=100`;

    console.log(`📡 Querying: ${url}\n`);

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
      throw new Error(`API Error: ${errorText}`);
    }

    const data = await response.json();
    const estimates = data.data || [];

    console.log(`✅ Found ${estimates.length} estimates sold after 6:00 PM\n`);

    if (estimates.length === 0) {
      console.log('⚠️  No estimates found. The sale may not be marked as "sold" in ServiceTitan yet.\n');
      return;
    }

    console.log('📋 ESTIMATES FOUND:\n');

    for (const estimate of estimates) {
      const salesperson = await getTechnician(estimate.soldBy, token);
      const customerName = await getCustomer(estimate.customerId, token);
      const amount = estimate.subtotal || 0;
      const soldOn = new Date(estimate.soldOn);
      const timeStr = soldOn.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit' });

      console.log(`   ID: ${estimate.id}`);
      console.log(`   Salesperson: ${salesperson}`);
      console.log(`   Customer: ${customerName}`);
      console.log(`   Amount: $${amount.toFixed(2)}`);
      console.log(`   Sold At: ${timeStr}`);
      console.log(`   Name: ${estimate.name || 'N/A'}`);
      console.log('');

      // Check if this matches the reported missing sale
      if (salesperson.toLowerCase().includes('mccue') && Math.abs(amount - 5659) < 1) {
        console.log('   ✨ THIS APPEARS TO BE THE MISSING SALE! ✨\n');
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkMissingSale();
