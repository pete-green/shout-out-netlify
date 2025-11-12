/**
 * Backfill Script: November 2025 with Water Quality Tracking
 *
 * Purpose: Fetch all sold estimates from November 2025 and calculate Water Quality
 * cross-sale amounts for each estimate. Updates estimates table with WQ data.
 *
 * Run: node backfill-november-2025-water-quality.js
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
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Cache for cross-sale group lookups
const crossSaleGroupCache = new Map();

/**
 * Load cross-sale group cache from database
 */
async function loadCrossSaleGroupCache() {
  console.log('📚 Loading cross-sale group cache...');

  const { data, error } = await supabase
    .from('pricebook_items')
    .select('sku_id, cross_sale_group')
    .not('cross_sale_group', 'is', null);

  if (error) {
    console.error('Error loading cache:', error);
    throw error;
  }

  crossSaleGroupCache.clear();
  for (const item of data) {
    crossSaleGroupCache.set(item.sku_id, item.cross_sale_group);
  }

  console.log(`✅ Loaded ${crossSaleGroupCache.size} items with cross-sale groups\n`);
}

/**
 * Calculate Water Quality metrics from estimate items
 */
function calculateWaterQualityMetrics(estimate) {
  const items = estimate.items || [];
  let waterQualityAmount = 0;
  let waterQualityItemCount = 0;
  const waterQualityItems = [];

  for (const item of items) {
    const skuId = item.sku?.id;
    if (!skuId) continue;

    const crossSaleGroup = crossSaleGroupCache.get(skuId);

    if (crossSaleGroup === 'WATER QUALITY') {
      const itemTotal = item.total || 0;
      waterQualityAmount += itemTotal;
      waterQualityItemCount++;

      waterQualityItems.push({
        skuId,
        skuName: item.sku?.displayName || item.sku?.name || `SKU #${skuId}`,
        total: itemTotal,
        quantity: item.qty || 1
      });
    }
  }

  return {
    hasWaterQuality: waterQualityAmount > 0,
    waterQualityAmount,
    waterQualityItemCount,
    waterQualityItems
  };
}

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
 * Fetch sold estimates from ServiceTitan with pagination
 */
async function getAllSoldEstimates(soldAfter, bearerToken) {
  const allEstimates = [];
  let page = 1;
  const pageSize = 5000;
  let hasMore = true;

  console.log('📡 Fetching estimates from ServiceTitan...');

  while (hasMore) {
    const url = `${ST_CONFIG.baseUrl}/sales/v2/tenant/${ST_CONFIG.tenantId}/estimates?soldAfter=${encodeURIComponent(soldAfter)}&page=${page}&pageSize=${pageSize}`;

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
      throw new Error(`Failed to fetch estimates: ${errorText}`);
    }

    const data = await response.json();
    const estimates = data.data || [];

    console.log(`  Page ${page}: ${estimates.length} estimates`);
    allEstimates.push(...estimates);

    if (estimates.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  console.log(`✅ Total estimates fetched: ${allEstimates.length}\n`);
  return allEstimates;
}

/**
 * Process and update estimates with Water Quality data
 */
async function processEstimates(estimates) {
  console.log('💧 Calculating Water Quality metrics for estimates...\n');

  let totalProcessed = 0;
  let waterQualitySalesCount = 0;
  let totalWaterQualityAmount = 0;
  let errorCount = 0;

  for (const estimate of estimates) {
    try {
      // Calculate Water Quality metrics
      const wqMetrics = calculateWaterQualityMetrics(estimate);

      if (wqMetrics.hasWaterQuality) {
        waterQualitySalesCount++;
        totalWaterQualityAmount += wqMetrics.waterQualityAmount;

        console.log(`💧 Estimate ${estimate.id}: $${wqMetrics.waterQualityAmount.toFixed(2)} in Water Quality`);
        if (wqMetrics.waterQualityItems.length > 0) {
          wqMetrics.waterQualityItems.forEach(item => {
            console.log(`   - ${item.skuName}: $${item.total.toFixed(2)}`);
          });
        }
      }

      // Update estimate in database
      const { error } = await supabase
        .from('estimates')
        .update({
          has_water_quality: wqMetrics.hasWaterQuality,
          water_quality_amount: wqMetrics.waterQualityAmount,
          water_quality_item_count: wqMetrics.waterQualityItemCount
        })
        .eq('estimate_id', estimate.id.toString());

      if (error) {
        console.error(`Error updating estimate ${estimate.id}:`, error.message);
        errorCount++;
      }

      totalProcessed++;

      // Progress indicator every 10 estimates
      if (totalProcessed % 10 === 0) {
        console.log(`\n✓ Processed ${totalProcessed}/${estimates.length} estimates...`);
      }

    } catch (error) {
      console.error(`Error processing estimate ${estimate.id}:`, error.message);
      errorCount++;
    }
  }

  return {
    totalProcessed,
    waterQualitySalesCount,
    totalWaterQualityAmount,
    errorCount
  };
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();

  console.log('🚀 November 2025 Water Quality Backfill');
  console.log('='.repeat(80));
  console.log('📅 Date Range: November 1-30, 2025');
  console.log('='.repeat(80) + '\n');

  try {
    // Load cross-sale group cache
    await loadCrossSaleGroupCache();

    // Get ServiceTitan token
    const token = await getServiceTitanToken();

    // Fetch estimates for November 2025
    // November 1, 2025 00:00:00 UTC
    const soldAfter = '2025-11-01T00:00:00.000Z';
    const estimates = await getAllSoldEstimates(soldAfter, token);

    // Filter to only November (before December 1)
    const novemberEstimates = estimates.filter(est => {
      const soldDate = new Date(est.soldOn);
      return soldDate < new Date('2025-12-01T00:00:00.000Z');
    });

    console.log(`📊 November estimates: ${novemberEstimates.length}\n`);

    if (novemberEstimates.length === 0) {
      console.log('⚠️  No estimates found for November 2025');
      return;
    }

    // Process estimates and update with WQ data
    const results = await processEstimates(novemberEstimates);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(80));
    console.log('✅ BACKFILL COMPLETE');
    console.log('='.repeat(80));
    console.log(`📊 Total estimates processed: ${results.totalProcessed}`);
    console.log(`💧 Sales with Water Quality: ${results.waterQualitySalesCount}`);
    console.log(`💰 Total Water Quality amount: $${results.totalWaterQualityAmount.toFixed(2)}`);
    console.log(`📈 Water Quality percentage: ${((results.waterQualitySalesCount / results.totalProcessed) * 100).toFixed(1)}%`);
    console.log(`❌ Errors: ${results.errorCount}`);
    console.log(`⏱️  Duration: ${duration}s`);
    console.log('='.repeat(80));

    if (results.waterQualitySalesCount > 0) {
      const avgWQAmount = results.totalWaterQualityAmount / results.waterQualitySalesCount;
      console.log(`\n💡 Average Water Quality amount per WQ sale: $${avgWQAmount.toFixed(2)}`);
    }

    console.log('\n✨ November 2025 data is now ready for dashboard display!');

  } catch (error) {
    console.error('\n💥 ERROR:', error);
    process.exit(1);
  }
}

main();
