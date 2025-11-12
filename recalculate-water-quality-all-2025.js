/**
 * Recalculate Water Quality for All Months in 2025
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
const crossSaleGroupCache = new Map();

async function loadCrossSaleGroupCache() {
  console.log('📚 Loading cross-sale group cache...');
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

    if (error) throw error;
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
  console.log(`✅ Loaded ${crossSaleGroupCache.size} items\n`);
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

  return { hasWaterQuality: waterQualityAmount > 0, waterQualityAmount, waterQualityItemCount, waterQualityItems };
}

async function recalculateMonth(monthName, startDate, endDate) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🗓️  Processing ${monthName}`);
  console.log('='.repeat(80));

  const monthStart = Date.now();

  const { data: estimates, error } = await supabase
    .from('estimates')
    .select('id, estimate_id, salesperson, amount, sold_at, raw_data')
    .gte('sold_at', startDate)
    .lt('sold_at', endDate)
    .order('sold_at');

  if (error) throw error;
  console.log(`📊 Found ${estimates.length} estimates`);

  let waterQualitySalesCount = 0;
  let totalWaterQualityAmount = 0;

  for (let i = 0; i < estimates.length; i++) {
    const estimate = estimates[i];
    const wqMetrics = calculateWaterQualityFromRawData(estimate.raw_data);

    if (wqMetrics.hasWaterQuality) {
      waterQualitySalesCount++;
      totalWaterQualityAmount += wqMetrics.waterQualityAmount;
    }

    await supabase.from('estimates').update({
      has_water_quality: wqMetrics.hasWaterQuality,
      water_quality_amount: wqMetrics.waterQualityAmount,
      water_quality_item_count: wqMetrics.waterQualityItemCount
    }).eq('id', estimate.id);

    if ((i + 1) % 100 === 0) {
      console.log(`  ✓ Processed ${i + 1}/${estimates.length}...`);
    }
  }

  const monthDuration = ((Date.now() - monthStart) / 1000).toFixed(2);

  console.log(`\n✅ ${monthName} Complete:`);
  console.log(`   💧 WQ Sales: ${waterQualitySalesCount} (${((waterQualitySalesCount / estimates.length) * 100).toFixed(1)}%)`);
  console.log(`   💰 WQ Amount: $${totalWaterQualityAmount.toFixed(2)}`);
  if (waterQualitySalesCount > 0) {
    console.log(`   📊 Average: $${(totalWaterQualityAmount / waterQualitySalesCount).toFixed(2)}`);
  }
  console.log(`   ⏱️  Duration: ${monthDuration}s`);

  return {
    monthName,
    totalEstimates: estimates.length,
    wqSalesCount: waterQualitySalesCount,
    wqAmount: totalWaterQualityAmount
  };
}

async function main() {
  console.log('🚀 2025 FULL YEAR WATER QUALITY BACKFILL');
  console.log('='.repeat(80));
  console.log('Processing all months: January - July 2025');
  console.log('='.repeat(80));

  const overallStart = Date.now();

  await loadCrossSaleGroupCache();

  const months = [
    { name: 'January 2025', start: '2025-01-01T00:00:00Z', end: '2025-02-01T00:00:00Z' },
    { name: 'February 2025', start: '2025-02-01T00:00:00Z', end: '2025-03-01T00:00:00Z' },
    { name: 'March 2025', start: '2025-03-01T00:00:00Z', end: '2025-04-01T00:00:00Z' },
    { name: 'April 2025', start: '2025-04-01T00:00:00Z', end: '2025-05-01T00:00:00Z' },
    { name: 'May 2025', start: '2025-05-01T00:00:00Z', end: '2025-06-01T00:00:00Z' },
    { name: 'June 2025', start: '2025-06-01T00:00:00Z', end: '2025-07-01T00:00:00Z' },
    { name: 'July 2025', start: '2025-07-01T00:00:00Z', end: '2025-08-01T00:00:00Z' },
  ];

  const results = [];

  for (const month of months) {
    const result = await recalculateMonth(month.name, month.start, month.end);
    results.push(result);
  }

  const overallDuration = ((Date.now() - overallStart) / 1000).toFixed(2);

  console.log('\n\n' + '='.repeat(80));
  console.log('🎉 ALL 2025 MONTHS COMPLETE');
  console.log('='.repeat(80));
  console.log('\n📊 Summary by Month:\n');

  let yearTotal = 0;
  let yearWQSales = 0;
  let yearWQAmount = 0;

  results.forEach(result => {
    yearTotal += result.totalEstimates;
    yearWQSales += result.wqSalesCount;
    yearWQAmount += result.wqAmount;

    const percentage = result.totalEstimates > 0
      ? ((result.wqSalesCount / result.totalEstimates) * 100).toFixed(1)
      : '0.0';

    console.log(`${result.monthName.padEnd(20)} ${result.wqSalesCount} WQ sales (${percentage}%)  $${result.wqAmount.toFixed(2)}`);
  });

  console.log('\n' + '-'.repeat(80));
  console.log(`${'TOTAL 2025'.padEnd(20)} ${yearWQSales} WQ sales (${((yearWQSales / yearTotal) * 100).toFixed(1)}%)  $${yearWQAmount.toFixed(2)}`);
  console.log('-'.repeat(80));
  console.log(`\n⏱️  Total Duration: ${overallDuration}s`);
  console.log(`💡 Average WQ Sale: $${(yearWQAmount / yearWQSales).toFixed(2)}`);
  console.log('\n✨ All 2025 data is now ready for dashboard display!');
}

main().catch(error => {
  console.error('\n💥 ERROR:', error);
  process.exit(1);
});
