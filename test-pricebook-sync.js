/**
 * Test Script: Pricebook Sync to Database
 *
 * Purpose: Test syncing pricebook items from ServiceTitan to Supabase database
 * This will populate the pricebook_items table with all items including Water Quality items
 *
 * Run: node test-pricebook-sync.js
 */

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
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let cachedToken = null;
let tokenExpiry = null;

/**
 * Get ServiceTitan OAuth token
 */
async function getServiceTitanToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  console.log('🔑 Fetching ServiceTitan token...');

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
    throw new Error(`Failed to get token: ${response.status} ${error}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;

  console.log('✅ Token obtained');
  return cachedToken;
}

/**
 * Fetch pricebook items
 */
async function fetchPricebookItems(itemType, page = 1, pageSize = 100) {
  const token = await getServiceTitanToken();
  const url = `${ST_CONFIG.baseUrl}/pricebook/v2/tenant/${ST_CONFIG.tenantId}/${itemType}?page=${page}&pageSize=${pageSize}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'ST-App-Key': ST_CONFIG.applicationKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch ${itemType}: ${response.status} ${error}`);
  }

  return await response.json();
}

/**
 * Fetch all pricebook items with pagination
 */
async function getAllPricebookItems() {
  console.log('\n🔄 Fetching all pricebook items...');

  const allItems = {
    materials: [],
    equipment: [],
    services: [],
  };

  // Fetch materials
  console.log('\n📦 Fetching Materials...');
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const data = await fetchPricebookItems('materials', page, 100);
    const items = data.data || [];
    allItems.materials.push(...items);

    console.log(`  Page ${page}: ${items.length} items (Total: ${allItems.materials.length})`);

    hasMore = data.hasMore || (items.length === 100);
    page++;

    if (page > 100) break; // Safety limit
  }

  // Fetch equipment
  console.log('\n⚙️  Fetching Equipment...');
  page = 1;
  hasMore = true;

  while (hasMore) {
    const data = await fetchPricebookItems('equipment', page, 100);
    const items = data.data || [];
    allItems.equipment.push(...items);

    console.log(`  Page ${page}: ${items.length} items (Total: ${allItems.equipment.length})`);

    hasMore = data.hasMore || (items.length === 100);
    page++;

    if (page > 100) break;
  }

  // Fetch services
  console.log('\n🛠️  Fetching Services...');
  page = 1;
  hasMore = true;

  while (hasMore) {
    const data = await fetchPricebookItems('services', page, 100);
    const items = data.data || [];
    allItems.services.push(...items);

    console.log(`  Page ${page}: ${items.length} items (Total: ${allItems.services.length})`);

    hasMore = data.hasMore || (items.length === 100);
    page++;

    if (page > 100) break;
  }

  const total = allItems.materials.length + allItems.equipment.length + allItems.services.length;
  console.log(`\n✅ Total items fetched: ${total}`);

  return allItems;
}

/**
 * Sync items to database
 */
async function syncToDatabase(pricebookData) {
  console.log('\n💾 Syncing to database...');

  const allItems = [
    ...pricebookData.materials.map(item => ({ ...item, type: 'Material' })),
    ...pricebookData.equipment.map(item => ({ ...item, type: 'Equipment' })),
    ...pricebookData.services.map(item => ({ ...item, type: 'Service' })),
  ];

  let syncedCount = 0;
  let waterQualityCount = 0;
  let errorCount = 0;

  for (const item of allItems) {
    try {
      const { error } = await supabase
        .from('pricebook_items')
        .upsert({
          sku_id: item.id,
          sku_code: item.code || null,
          sku_type: item.type,
          display_name: item.displayName || null,
          description: item.description || null,
          cross_sale_group: item.crossSaleGroup || null,
          price: item.price || 0,
          cost: item.cost || 0,
          active: item.active !== undefined ? item.active : true,
          categories: item.categories || [],
          raw_data: item,
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: 'sku_id',
        });

      if (error) throw error;

      if (item.crossSaleGroup === 'WATER QUALITY') {
        waterQualityCount++;
      }

      syncedCount++;

      if (syncedCount % 100 === 0) {
        console.log(`  ✓ Synced ${syncedCount}/${allItems.length}...`);
      }
    } catch (error) {
      console.error(`❌ Error syncing SKU ${item.id}:`, error.message);
      errorCount++;
    }
  }

  console.log('\n✅ Sync complete!');
  console.log(`   📊 Total synced: ${syncedCount}`);
  console.log(`   💧 Water Quality items: ${waterQualityCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);

  return { syncedCount, waterQualityCount, errorCount };
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();

  console.log('🚀 Pricebook Sync Test');
  console.log('='.repeat(80));

  try {
    // Fetch all pricebook items
    const pricebookData = await getAllPricebookItems();

    // Sync to database
    const stats = await syncToDatabase(pricebookData);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(80));
    console.log('✅ TEST COMPLETE');
    console.log('='.repeat(80));
    console.log(`Duration: ${duration}s`);
    console.log('\nYou can now query the pricebook_items table to see the synced data.');
    console.log('Water Quality items can be found with:');
    console.log('  SELECT * FROM pricebook_items WHERE cross_sale_group = \'WATER QUALITY\';');

  } catch (error) {
    console.error('\n💥 ERROR:', error);
    process.exit(1);
  }
}

main();
