import { Handler } from '@netlify/functions';
import { supabase } from './lib/supabase';
import { getAllPricebookItems } from './lib/servicetitan';

/**
 * Sync pricebook items from ServiceTitan API to database
 * Fetches materials, equipment, and services with cross-sale group information
 * Supports both manual trigger and scheduled execution
 */
export const handler: Handler = async (_event, _context) => {
  const startTime = Date.now();

  console.log('🔄 Starting pricebook sync...');

  try {
    // Fetch all pricebook items from ServiceTitan
    const pricebookData = await getAllPricebookItems();

    const allItems = [
      ...pricebookData.materials.map((item: any) => ({ ...item, type: 'Material' })),
      ...pricebookData.equipment.map((item: any) => ({ ...item, type: 'Equipment' })),
      ...pricebookData.services.map((item: any) => ({ ...item, type: 'Service' })),
    ];

    console.log(`\n💾 Syncing ${allItems.length} items to database...`);

    let syncedCount = 0;
    let waterQualityCount = 0;
    let errorCount = 0;

    // Upsert each item into the database
    for (const item of allItems) {
      try {
        const skuId = item.id;
        const skuCode = item.code || null;
        const skuType = item.type; // 'Material', 'Equipment', or 'Service'
        const displayName = item.displayName || null;
        const description = item.description || null;
        const crossSaleGroup = item.crossSaleGroup || null;
        const price = item.price || 0;
        const cost = item.cost || 0;
        const active = item.active !== undefined ? item.active : true;
        const categories = item.categories || [];

        // Track Water Quality items
        if (crossSaleGroup === 'WATER QUALITY') {
          waterQualityCount++;
        }

        // Upsert into pricebook_items table
        const { error } = await supabase
          .from('pricebook_items')
          .upsert(
            {
              sku_id: skuId,
              sku_code: skuCode,
              sku_type: skuType,
              display_name: displayName,
              description,
              cross_sale_group: crossSaleGroup,
              price,
              cost,
              active,
              categories,
              raw_data: item,
              last_synced_at: new Date().toISOString(),
            },
            {
              onConflict: 'sku_id',
            }
          );

        if (error) {
          throw error;
        }

        syncedCount++;

        // Log progress every 100 items
        if (syncedCount % 100 === 0) {
          console.log(`  ✓ Synced ${syncedCount}/${allItems.length} items...`);
        }
      } catch (error: any) {
        console.error(`❌ Error syncing SKU ${item.id}:`, error.message);
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;

    console.log('\n✅ Pricebook sync completed!');
    console.log(`   📊 Total items synced: ${syncedCount}`);
    console.log(`   💧 Water Quality items: ${waterQualityCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   ⏱️  Duration: ${(duration / 1000).toFixed(2)}s`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Pricebook sync completed successfully',
        stats: {
          totalItems: allItems.length,
          syncedCount,
          waterQualityCount,
          errorCount,
          durationMs: duration,
        },
      }),
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('❌ Pricebook sync failed:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        durationMs: duration,
      }),
    };
  }
};
