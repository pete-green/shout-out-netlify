/**
 * Recalculate Air Quality for All Months in 2025
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

function calculateAirQualityFromRawData(rawData) {
  const items = rawData?.items || [];
  let airQualityAmount = 0;
  let airQualityItemCount = 0;
  const airQualityItems = [];

  for (const item of items) {
    const skuId = item.sku?.id;
    if (!skuId) continue;
    const crossSaleGroup = crossSaleGroupCache.get(skuId);

    if (crossSaleGroup === 'AIR QUALITY') {
      const itemTotal = item.total || 0;
      airQualityAmount += itemTotal;
      airQualityItemCount++;
      airQualityItems.push({
        skuId,
        skuName: item.sku?.displayName || item.sku?.name || `SKU #${skuId}`,
        total: itemTotal,
        quantity: item.qty || 1
      });
    }
  }

  return { hasAirQuality: airQualityAmount > 0, airQualityAmount, airQualityItemCount, airQualityItems };
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

  let airQualitySalesCount = 0;
  let totalAirQualityAmount = 0;

  for (let i = 0; i < estimates.length; i++) {
    const estimate = estimates[i];
    const aqMetrics = calculateAirQualityFromRawData(estimate.raw_data);

    if (aqMetrics.hasAirQuality) {
      airQualitySalesCount++;
      totalAirQualityAmount += aqMetrics.airQualityAmount;
    }

    await supabase.from('estimates').update({
      has_air_quality: aqMetrics.hasAirQuality,
      air_quality_amount: aqMetrics.airQualityAmount,
      air_quality_item_count: aqMetrics.airQualityItemCount
    }).eq('id', estimate.id);

    if ((i + 1) % 100 === 0) {
      console.log(`  ✓ Processed ${i + 1}/${estimates.length}...`);
    }
  }

  const monthDuration = ((Date.now() - monthStart) / 1000).toFixed(2);

  console.log(`\n✅ ${monthName} Complete:`);
  console.log(`   🌪️  AQ Sales: ${airQualitySalesCount} (${((airQualitySalesCount / estimates.length) * 100).toFixed(1)}%)`);
  console.log(`   💰 AQ Amount: $${totalAirQualityAmount.toFixed(2)}`);
  if (airQualitySalesCount > 0) {
    console.log(`   📊 Average: $${(totalAirQualityAmount / airQualitySalesCount).toFixed(2)}`);
  }
  console.log(`   ⏱️  Duration: ${monthDuration}s`);

  return {
    monthName,
    totalEstimates: estimates.length,
    aqSalesCount: airQualitySalesCount,
    aqAmount: totalAirQualityAmount
  };
}

async function main() {
  console.log('🚀 2025 FULL YEAR AIR QUALITY BACKFILL');
  console.log('='.repeat(80));
  console.log('Processing all months: January - November 2025');
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
    { name: 'August 2025', start: '2025-08-01T00:00:00Z', end: '2025-09-01T00:00:00Z' },
    { name: 'September 2025', start: '2025-09-01T00:00:00Z', end: '2025-10-01T00:00:00Z' },
    { name: 'October 2025', start: '2025-10-01T00:00:00Z', end: '2025-11-01T00:00:00Z' },
    { name: 'November 2025', start: '2025-11-01T00:00:00Z', end: '2025-12-01T00:00:00Z' },
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
  let yearAQSales = 0;
  let yearAQAmount = 0;

  results.forEach(result => {
    yearTotal += result.totalEstimates;
    yearAQSales += result.aqSalesCount;
    yearAQAmount += result.aqAmount;

    const percentage = result.totalEstimates > 0
      ? ((result.aqSalesCount / result.totalEstimates) * 100).toFixed(1)
      : '0.0';

    console.log(`${result.monthName.padEnd(20)} ${result.aqSalesCount} AQ sales (${percentage}%)  $${result.aqAmount.toFixed(2)}`);
  });

  console.log('\n' + '-'.repeat(80));
  console.log(`${'TOTAL 2025'.padEnd(20)} ${yearAQSales} AQ sales (${((yearAQSales / yearTotal) * 100).toFixed(1)}%)  $${yearAQAmount.toFixed(2)}`);
  console.log('-'.repeat(80));
  console.log(`\n⏱️  Total Duration: ${overallDuration}s`);
  if (yearAQSales > 0) {
    console.log(`💡 Average AQ Sale: $${(yearAQAmount / yearAQSales).toFixed(2)}`);
  }
  console.log('\n✨ All 2025 Air Quality data is now ready for dashboard display!');
}

main().catch(error => {
  console.error('\n💥 ERROR:', error);
  process.exit(1);
});
