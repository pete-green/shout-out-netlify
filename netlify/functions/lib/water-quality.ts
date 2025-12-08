/**
 * Cross-Sale Calculation Utilities
 *
 * Functions for identifying and calculating Water Quality and Air Quality cross-sale amounts
 * from ServiceTitan estimates
 */

import { supabase } from './supabase';

/**
 * SKU ID to cross-sale group mapping cache
 * This is populated from the pricebook_items table
 */
const crossSaleGroupCache = new Map<number, string | null>();
let cacheLastUpdated: Date | null = null;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

/**
 * Load cross-sale group data from database into cache
 */
async function loadCrossSaleGroupCache(): Promise<void> {
  const now = new Date();

  // Check if cache needs refresh
  if (cacheLastUpdated && (now.getTime() - cacheLastUpdated.getTime()) < CACHE_TTL_MS) {
    return; // Cache is still fresh
  }

  console.log('📚 Loading cross-sale group cache from database...');

  try {
    // Fetch ALL items with pagination to avoid 1000 row limit
    let allItems: any[] = [];
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
        console.error('Failed to load cross-sale group cache:', error);
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

    // Clear existing cache
    crossSaleGroupCache.clear();

    // Populate cache
    for (const item of allItems) {
      crossSaleGroupCache.set(item.sku_id, item.cross_sale_group);
    }

    cacheLastUpdated = now;
    console.log(`✅ Loaded ${crossSaleGroupCache.size} items with cross-sale groups into cache`);
  } catch (error: any) {
    console.error('Error loading cross-sale group cache:', error.message);
    // Don't throw - allow function to continue with empty/stale cache
  }
}

/**
 * Get cross-sale group for a SKU ID
 * @param skuId The SKU ID to look up
 * @returns Cross-sale group name or null
 */
async function getCrossSaleGroup(skuId: number): Promise<string | null> {
  // Ensure cache is loaded
  await loadCrossSaleGroupCache();

  // Check cache
  if (crossSaleGroupCache.has(skuId)) {
    return crossSaleGroupCache.get(skuId) || null;
  }

  // Not in cache - query database directly
  const { data } = await supabase
    .from('pricebook_items')
    .select('cross_sale_group')
    .eq('sku_id', skuId)
    .single();

  const crossSaleGroup = data?.cross_sale_group || null;

  // Add to cache for future lookups
  crossSaleGroupCache.set(skuId, crossSaleGroup);

  return crossSaleGroup;
}

/**
 * Calculate cross-sale metrics (Water Quality & Air Quality) from an estimate's items
 * @param estimate The estimate object from ServiceTitan (must include items array)
 * @returns Object with both Water Quality and Air Quality metrics
 */
export async function calculateCrossSaleMetrics(estimate: any): Promise<{
  waterQuality: {
    hasWaterQuality: boolean;
    waterQualityAmount: number;
    waterQualityItemCount: number;
    waterQualityItems: Array<{
      skuId: number;
      skuName: string;
      total: number;
      quantity: number;
    }>;
  };
  airQuality: {
    hasAirQuality: boolean;
    airQualityAmount: number;
    airQualityItemCount: number;
    airQualityItems: Array<{
      skuId: number;
      skuName: string;
      total: number;
      quantity: number;
    }>;
  };
}> {
  const items = estimate.items || [];

  if (items.length === 0) {
    return {
      waterQuality: {
        hasWaterQuality: false,
        waterQualityAmount: 0,
        waterQualityItemCount: 0,
        waterQualityItems: [],
      },
      airQuality: {
        hasAirQuality: false,
        airQualityAmount: 0,
        airQualityItemCount: 0,
        airQualityItems: [],
      },
    };
  }

  let waterQualityAmount = 0;
  let waterQualityItemCount = 0;
  const waterQualityItems: Array<{ skuId: number; skuName: string; total: number; quantity: number }> = [];

  let airQualityAmount = 0;
  let airQualityItemCount = 0;
  const airQualityItems: Array<{ skuId: number; skuName: string; total: number; quantity: number }> = [];

  // Ensure cache is loaded before processing items
  await loadCrossSaleGroupCache();

  // Process each item in the estimate
  for (const item of items) {
    const skuId = item.sku?.id;
    const itemTotal = item.total || 0;
    const quantity = item.qty || item.quantity || 1;

    if (!skuId) {
      continue; // Skip items without SKU ID
    }

    // Check if this SKU belongs to a cross-sale group
    const crossSaleGroup = await getCrossSaleGroup(skuId);

    if (crossSaleGroup === 'WATER QUALITY') {
      waterQualityAmount += itemTotal;
      waterQualityItemCount++;

      waterQualityItems.push({
        skuId,
        skuName: item.sku?.displayName || item.sku?.name || `SKU #${skuId}`,
        total: itemTotal,
        quantity,
      });
    } else if (crossSaleGroup === 'AIR QUALITY' || crossSaleGroup === 'HUMIDIFIERS') {
      airQualityAmount += itemTotal;
      airQualityItemCount++;

      airQualityItems.push({
        skuId,
        skuName: item.sku?.displayName || item.sku?.name || `SKU #${skuId}`,
        total: itemTotal,
        quantity,
      });
    }
  }

  return {
    waterQuality: {
      hasWaterQuality: waterQualityAmount > 0,
      waterQualityAmount,
      waterQualityItemCount,
      waterQualityItems,
    },
    airQuality: {
      hasAirQuality: airQualityAmount > 0,
      airQualityAmount,
      airQualityItemCount,
      airQualityItems,
    },
  };
}

/**
 * Calculate Water Quality amount from an estimate's items
 * @param estimate The estimate object from ServiceTitan (must include items array)
 * @returns Object with Water Quality metrics
 * @deprecated Use calculateCrossSaleMetrics instead for both WQ and AQ
 */
export async function calculateWaterQualityMetrics(estimate: any): Promise<{
  hasWaterQuality: boolean;
  waterQualityAmount: number;
  waterQualityItemCount: number;
  waterQualityItems: Array<{
    skuId: number;
    skuName: string;
    total: number;
    quantity: number;
  }>;
}> {
  const result = await calculateCrossSaleMetrics(estimate);
  return result.waterQuality;
}

/**
 * Batch calculate Water Quality metrics for multiple estimates
 * More efficient than calling calculateWaterQualityMetrics individually
 * @param estimates Array of estimate objects from ServiceTitan
 * @returns Array of Water Quality metrics corresponding to each estimate
 */
export async function batchCalculateWaterQualityMetrics(
  estimates: any[]
): Promise<Array<{
  estimateId: string | number;
  hasWaterQuality: boolean;
  waterQualityAmount: number;
  waterQualityItemCount: number;
  waterQualityItems: Array<{
    skuId: number;
    skuName: string;
    total: number;
    quantity: number;
  }>;
}>> {
  // Pre-load cache once for all estimates
  await loadCrossSaleGroupCache();

  const results = [];

  for (const estimate of estimates) {
    const metrics = await calculateWaterQualityMetrics(estimate);
    results.push({
      estimateId: estimate.id || estimate.estimate_id,
      ...metrics,
    });
  }

  return results;
}

/**
 * Manually refresh the cross-sale group cache
 * Useful after syncing new pricebook data
 */
export async function refreshCrossSaleGroupCache(): Promise<void> {
  cacheLastUpdated = null; // Force refresh
  await loadCrossSaleGroupCache();
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats() {
  return {
    cacheSize: crossSaleGroupCache.size,
    cacheLastUpdated: cacheLastUpdated?.toISOString() || null,
    cacheTTL: CACHE_TTL_MS,
  };
}
