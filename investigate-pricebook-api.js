/**
 * Investigation Script: ServiceTitan Pricebook API
 *
 * Purpose: Test Pricebook API endpoints to understand structure and identify
 * cross-sale group information for Water Quality items.
 *
 * Run: node investigate-pricebook-api.js
 */

import { readFileSync } from 'fs';

// Load environment variables from .env file
const envFile = readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      // Remove quotes if present
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

// Validate config
Object.entries(ST_CONFIG).forEach(([key, value]) => {
  if (!value) {
    console.error(`❌ Missing required environment variable for ${key}`);
    process.exit(1);
  }
});

let cachedToken = null;
let tokenExpiry = null;

/**
 * Get ServiceTitan OAuth token
 */
async function getServiceTitanToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  console.log('🔑 Fetching new ServiceTitan OAuth token...');

  const authBody = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: ST_CONFIG.clientId,
    client_secret: ST_CONFIG.clientSecret,
  });

  const response = await fetch(ST_CONFIG.authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: authBody.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get ServiceTitan token: ${response.status} ${error}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min early

  console.log('✅ Token obtained successfully');
  return cachedToken;
}

/**
 * Make authenticated ServiceTitan API call
 */
async function callServiceTitanAPI(endpoint, params = {}) {
  const token = await getServiceTitanToken();

  const url = new URL(`${ST_CONFIG.baseUrl}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  console.log(`\n📡 Calling: ${url.pathname}${url.search}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'ST-App-Key': ST_CONFIG.applicationKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API call failed: ${response.status} ${error}`);
  }

  return await response.json();
}

/**
 * Test Materials endpoint
 */
async function testMaterialsEndpoint() {
  console.log('\n' + '='.repeat(80));
  console.log('🔧 TESTING MATERIALS ENDPOINT');
  console.log('='.repeat(80));

  try {
    const data = await callServiceTitanAPI(
      `/pricebook/v2/tenant/${ST_CONFIG.tenantId}/materials`,
      { page: 1, pageSize: 5 }
    );

    console.log('\n📊 Response Structure:');
    console.log(JSON.stringify(data, null, 2));

    if (data.data && data.data.length > 0) {
      console.log('\n📋 Sample Material:');
      console.log(JSON.stringify(data.data[0], null, 2));

      console.log('\n🔍 Available Fields:');
      console.log(Object.keys(data.data[0]).join(', '));
    }

    return data;
  } catch (error) {
    console.error('❌ Materials endpoint error:', error.message);
    return null;
  }
}

/**
 * Test Equipment endpoint
 */
async function testEquipmentEndpoint() {
  console.log('\n' + '='.repeat(80));
  console.log('⚙️  TESTING EQUIPMENT ENDPOINT');
  console.log('='.repeat(80));

  try {
    const data = await callServiceTitanAPI(
      `/pricebook/v2/tenant/${ST_CONFIG.tenantId}/equipment`,
      { page: 1, pageSize: 5 }
    );

    console.log('\n📊 Response Structure:');
    console.log(JSON.stringify(data, null, 2));

    if (data.data && data.data.length > 0) {
      console.log('\n📋 Sample Equipment:');
      console.log(JSON.stringify(data.data[0], null, 2));

      console.log('\n🔍 Available Fields:');
      console.log(Object.keys(data.data[0]).join(', '));
    }

    return data;
  } catch (error) {
    console.error('❌ Equipment endpoint error:', error.message);
    return null;
  }
}

/**
 * Test Services endpoint
 */
async function testServicesEndpoint() {
  console.log('\n' + '='.repeat(80));
  console.log('🛠️  TESTING SERVICES ENDPOINT');
  console.log('='.repeat(80));

  try {
    const data = await callServiceTitanAPI(
      `/pricebook/v2/tenant/${ST_CONFIG.tenantId}/services`,
      { page: 1, pageSize: 5 }
    );

    console.log('\n📊 Response Structure:');
    console.log(JSON.stringify(data, null, 2));

    if (data.data && data.data.length > 0) {
      console.log('\n📋 Sample Service:');
      console.log(JSON.stringify(data.data[0], null, 2));

      console.log('\n🔍 Available Fields:');
      console.log(Object.keys(data.data[0]).join(', '));
    }

    return data;
  } catch (error) {
    console.error('❌ Services endpoint error:', error.message);
    return null;
  }
}

/**
 * Search for Water Quality items
 */
async function searchForWaterQuality() {
  console.log('\n' + '='.repeat(80));
  console.log('💧 SEARCHING FOR WATER QUALITY ITEMS');
  console.log('='.repeat(80));

  const waterQualityItems = [];

  // Search in each pricebook type
  for (const itemType of ['materials', 'equipment', 'services']) {
    console.log(`\n🔍 Searching in ${itemType}...`);

    try {
      let page = 1;
      let hasMore = true;
      let totalChecked = 0;

      while (hasMore && page <= 10) { // Limit to 10 pages for investigation
        const data = await callServiceTitanAPI(
          `/pricebook/v2/tenant/${ST_CONFIG.tenantId}/${itemType}`,
          { page, pageSize: 100 }
        );

        if (!data.data || data.data.length === 0) {
          hasMore = false;
          break;
        }

        totalChecked += data.data.length;

        // Check each item for Water Quality indicators
        data.data.forEach(item => {
          const itemStr = JSON.stringify(item).toLowerCase();

          // Look for Water Quality in any field
          if (itemStr.includes('water quality') ||
              itemStr.includes('water_quality') ||
              itemStr.includes('waterquality')) {
            waterQualityItems.push({
              type: itemType,
              item: item
            });
          }
        });

        console.log(`  Page ${page}: Checked ${data.data.length} items (Total: ${totalChecked})`);

        // Check if there are more pages
        hasMore = data.hasMore || (data.data.length === 100);
        page++;
      }

      console.log(`✅ Finished ${itemType}: Checked ${totalChecked} items`);

    } catch (error) {
      console.error(`❌ Error searching ${itemType}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`💧 FOUND ${waterQualityItems.length} WATER QUALITY ITEMS`);
  console.log('='.repeat(80));

  if (waterQualityItems.length > 0) {
    waterQualityItems.forEach((wqItem, index) => {
      console.log(`\n[${index + 1}] ${wqItem.type.toUpperCase()}`);
      console.log(JSON.stringify(wqItem.item, null, 2));
    });
  } else {
    console.log('\n⚠️  No items found with "Water Quality" in any field');
    console.log('This could mean:');
    console.log('  1. The cross-sale group field has a different name');
    console.log('  2. We need to search with different keywords');
    console.log('  3. The field is not exposed in the API response');
  }

  return waterQualityItems;
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 ServiceTitan Pricebook API Investigation');
  console.log('='.repeat(80));
  console.log(`Tenant ID: ${ST_CONFIG.tenantId}`);
  console.log('='.repeat(80));

  // Test each endpoint with small samples
  await testMaterialsEndpoint();
  await testEquipmentEndpoint();
  await testServicesEndpoint();

  // Search for Water Quality items
  await searchForWaterQuality();

  console.log('\n' + '='.repeat(80));
  console.log('✅ INVESTIGATION COMPLETE');
  console.log('='.repeat(80));
  console.log('\nNext Steps:');
  console.log('1. Review the response structures above');
  console.log('2. Identify the field name for cross-sale group');
  console.log('3. Note the SKU IDs of Water Quality items');
  console.log('4. Determine the best approach for caching pricebook data');
}

main().catch(error => {
  console.error('\n💥 FATAL ERROR:', error);
  process.exit(1);
});
