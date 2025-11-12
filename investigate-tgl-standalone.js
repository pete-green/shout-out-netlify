// Standalone script to investigate ServiceTitan TGL data
// Run with: node investigate-tgl-standalone.js

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

/**
 * Get ServiceTitan OAuth token
 */
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

/**
 * Fetch sold estimates from ServiceTitan API
 */
async function getSoldEstimates(soldAfter, bearerToken) {
  const url = `${ST_CONFIG.baseUrl}/sales/v2/tenant/${ST_CONFIG.tenantId}/estimates?soldAfter=${encodeURIComponent(soldAfter)}`;

  console.log(`📡 Fetching estimates from ServiceTitan...`);
  console.log(`   URL: ${url}\n`);

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
    console.error('❌ Service Titan API Error:', errorText);
    throw new Error(errorText);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Deep search for a string in an object
 */
function findStringInObject(obj, searchTerm, path = '') {
  const results = [];

  if (obj === null || obj === undefined) {
    return results;
  }

  // If it's a string, check if it contains the search term
  if (typeof obj === 'string') {
    if (obj.toLowerCase().includes(searchTerm.toLowerCase())) {
      results.push({ path, value: obj });
    }
    return results;
  }

  // If it's an array, search each element
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      results.push(...findStringInObject(item, searchTerm, itemPath));
    });
    return results;
  }

  // If it's an object, search each property
  if (typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      const propertyPath = path ? `${path}.${key}` : key;
      results.push(...findStringInObject(obj[key], searchTerm, propertyPath));
    });
  }

  return results;
}

/**
 * Main investigation function
 */
async function investigate() {
  try {
    console.log('🔍 TGL Investigation Script\n');
    console.log('═══════════════════════════════════════════════════\n');

    // Get token
    const token = await getServiceTitanToken();

    // Get estimates from last 24 hours
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    const soldAfter = yesterday.toISOString();

    console.log(`📅 Searching for estimates sold after: ${soldAfter}\n`);

    const estimates = await getSoldEstimates(soldAfter, token);
    console.log(`✅ Found ${estimates.length} total estimates\n`);
    console.log('═══════════════════════════════════════════════════\n');

    let tglCount = 0;

    // Search for "Option C" and "System Update" in each estimate
    for (let i = 0; i < estimates.length; i++) {
      const estimate = estimates[i];
      console.log(`\n📊 Estimate #${i + 1} of ${estimates.length}`);
      console.log(`   ID: ${estimate.id}`);
      console.log(`   Subtotal: $${estimate.subtotal || 0}`);
      console.log(`   Sold On: ${estimate.soldOn}`);

      // Search for option-related strings
      const optionCMatches = findStringInObject(estimate, 'Option C');
      const systemUpdateMatches = findStringInObject(estimate, 'System Update');

      if (optionCMatches.length > 0 || systemUpdateMatches.length > 0) {
        tglCount++;
        console.log(`\n   ✨ POTENTIAL TGL FOUND! ✨`);

        if (optionCMatches.length > 0) {
          console.log(`\n   🔍 "Option C" found in ${optionCMatches.length} location(s):`);
          optionCMatches.forEach(match => {
            console.log(`      Path: ${match.path}`);
            console.log(`      Value: "${match.value}"`);
          });
        }

        if (systemUpdateMatches.length > 0) {
          console.log(`\n   🔍 "System Update" found in ${systemUpdateMatches.length} location(s):`);
          systemUpdateMatches.forEach(match => {
            console.log(`      Path: ${match.path}`);
            console.log(`      Value: "${match.value}"`);
          });
        }

        // Show the full estimate structure (first level keys)
        console.log(`\n   📦 Top-level fields in this estimate:`);
        Object.keys(estimate).forEach(key => {
          const value = estimate[key];
          const type = Array.isArray(value) ? `Array(${value.length})` : typeof value;
          console.log(`      - ${key}: ${type}`);
        });

        // Show items array in detail if it exists
        if (estimate.items && Array.isArray(estimate.items)) {
          console.log(`\n   📋 Items array (${estimate.items.length} items):`);
          estimate.items.forEach((item, idx) => {
            console.log(`      Item ${idx + 1}:`);
            console.log(`         skuName: ${item.skuName || 'N/A'}`);
            console.log(`         total: $${item.total || 0}`);
          });
        }

        console.log('\n   ' + '─'.repeat(60));
      } else {
        console.log(`   No TGL indicators found`);
      }
    }

    console.log('\n\n═══════════════════════════════════════════════════');
    console.log(`📋 Investigation Complete!`);
    console.log(`   Total estimates: ${estimates.length}`);
    console.log(`   Potential TGLs found: ${tglCount}`);
    console.log('═══════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Error during investigation:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the investigation
investigate();
