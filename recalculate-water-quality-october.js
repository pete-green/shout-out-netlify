/**
 * Recalculate Water Quality for October 2025 from Database
 *
 * This script processes estimates already in the database and recalculates
 * their Water Quality metrics using the items data we already have.
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

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

const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Cache for cross-sale group lookups
const crossSaleGroupCache = new Map();

async function loadCrossSaleGroupCache() {
  console.log('📚 Loading cross-sale group cache...');

  // Fetch ALL items with pagination to avoid 1000 row limit
  let allItems = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('pricebook_items')
      .select('sku_id, cross_sale_group')
      .not('cross_sale_group', 'is', null)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('Error loading cache:', error);
      throw error;
    }

    if (data && data.length > 0) {
      allItems.push(...data);
      hasMore = data.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }

  crossSaleGroupCache.clear();
  for (const item of allItems) {
    crossSaleGroupCache.set(item.sku_id, item.cross_sale_group);
  }

  console.log(`✅ Loaded ${crossSaleGroupCache.size} items with cross-sale groups\n`);
}

function calculateWaterQualityFromRawData(rawData) {
  const items = rawData?.items || [];
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

async function recalculateOctober() {
  console.log('🚀 Recalculating Water Quality for October 2025');
  console.log('='.repeat(80));
  console.log('📅 Processing estimates from database\n');

  const startTime = Date.now();

  // Load cache
  await loadCrossSaleGroupCache();

  // Fetch all October estimates from database
  console.log('📡 Fetching October estimates from database...');
  const { data: estimates, error } = await supabase
    .from('estimates')
    .select('id, estimate_id, salesperson, amount, sold_at, raw_data')
    .gte('sold_at', '2025-10-01T00:00:00Z')
    .lt('sold_at', '2025-11-01T00:00:00Z')
    .order('sold_at');

  if (error) {
    console.error('❌ Error fetching estimates:', error);
    throw error;
  }

  console.log(`✅ Found ${estimates.length} October estimates\n`);

  let totalProcessed = 0;
  let waterQualitySalesCount = 0;
  let totalWaterQualityAmount = 0;
  let updateCount = 0;
  let errorCount = 0;

  console.log('💧 Recalculating Water Quality metrics...\n');

  for (const estimate of estimates) {
    try {
      const wqMetrics = calculateWaterQualityFromRawData(estimate.raw_data);

      if (wqMetrics.hasWaterQuality) {
        waterQualitySalesCount++;
        totalWaterQualityAmount += wqMetrics.waterQualityAmount;

        console.log(`💧 Estimate ${estimate.estimate_id} (${estimate.salesperson}): $${wqMetrics.waterQualityAmount.toFixed(2)}`);
        wqMetrics.waterQualityItems.forEach(item => {
          console.log(`   - ${item.skuName}: $${item.total.toFixed(2)}`);
        });
      }

      // Update database
      const { error: updateError } = await supabase
        .from('estimates')
        .update({
          has_water_quality: wqMetrics.hasWaterQuality,
          water_quality_amount: wqMetrics.waterQualityAmount,
          water_quality_item_count: wqMetrics.waterQualityItemCount
        })
        .eq('id', estimate.id);

      if (updateError) {
        console.error(`❌ Error updating estimate ${estimate.estimate_id}:`, updateError.message);
        errorCount++;
      } else {
        updateCount++;
      }

      totalProcessed++;

      if (totalProcessed % 50 === 0) {
        console.log(`\n✓ Processed ${totalProcessed}/${estimates.length}...\n`);
      }

    } catch (error) {
      console.error(`Error processing estimate ${estimate.estimate_id}:`, error.message);
      errorCount++;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '='.repeat(80));
  console.log('✅ RECALCULATION COMPLETE');
  console.log('='.repeat(80));
  console.log(`📊 Total estimates processed: ${totalProcessed}`);
  console.log(`💧 Sales with Water Quality: ${waterQualitySalesCount}`);
  console.log(`💰 Total Water Quality amount: $${totalWaterQualityAmount.toFixed(2)}`);
  console.log(`📈 Water Quality percentage: ${((waterQualitySalesCount / totalProcessed) * 100).toFixed(1)}%`);
  console.log(`✏️  Database updates: ${updateCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`⏱️  Duration: ${duration}s`);
  console.log('='.repeat(80));

  if (waterQualitySalesCount > 0) {
    const avgWQAmount = totalWaterQualityAmount / waterQualitySalesCount;
    console.log(`\n💡 Average Water Quality amount per WQ sale: $${avgWQAmount.toFixed(2)}`);
  }
}

recalculateOctober().catch(error => {
  console.error('\n💥 ERROR:', error);
  process.exit(1);
});
