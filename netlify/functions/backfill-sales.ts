import { Handler, HandlerResponse } from '@netlify/functions';
import { supabase } from './lib/supabase';
import { getSoldEstimates, getTechnician, getCustomer } from './lib/servicetitan';

/**
 * Historical Data Backfill Function
 *
 * Safely backfills sold estimates from ServiceTitan into the database
 * WITHOUT triggering celebrations or notifications.
 *
 * Query Parameters:
 * - start_date: YYYY-MM-DD (required) - Start of date range
 * - end_date: YYYY-MM-DD (required) - End of date range
 * - batch_size: number (optional, default 10) - Estimates per batch
 * - dry_run: boolean (optional) - If true, don't insert data, just report what would be done
 *
 * Example: /.netlify/functions/backfill-sales?start_date=2025-10-01&end_date=2025-10-02&batch_size=10
 */

function createResponse(statusCode: number, body: any): HandlerResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

interface EstimateItem {
  skuName: string;
  total: number;
}

interface Estimate {
  id: string;
  soldOn: string;
  soldBy: number;
  customerId: number;
  items: EstimateItem[];
  subtotal: number;
}

/**
 * Format customer name from "LastName, FirstName" to "FirstName LastName"
 */
function formatCustomerName(rawName: string): string {
  if (rawName.indexOf(',') !== -1) {
    const parts = rawName.split(',');
    if (parts.length === 2) {
      const last = parts[0].trim();
      const first = parts[1].trim();
      return `${first} ${last}`;
    }
  }
  return rawName;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const handler: Handler = async (event, _context) => {
  const { httpMethod, queryStringParameters } = event;

  // Handle OPTIONS for CORS
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  const startTime = Date.now();

  try {
    // Validate parameters
    const startDate = queryStringParameters?.start_date;
    const endDate = queryStringParameters?.end_date;
    const batchSize = parseInt(queryStringParameters?.batch_size || '10', 10);
    const dryRun = queryStringParameters?.dry_run === 'true';

    if (!startDate || !endDate) {
      return createResponse(400, {
        error: 'start_date and end_date query parameters are required',
        example: '?start_date=2025-10-01&end_date=2025-10-02&batch_size=10',
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return createResponse(400, {
        error: 'Dates must be in YYYY-MM-DD format',
      });
    }

    console.log('🔄 ===== STARTING BACKFILL =====');
    console.log(`📅 Date Range: ${startDate} to ${endDate}`);
    console.log(`📦 Batch Size: ${batchSize}`);
    console.log(`🧪 Dry Run: ${dryRun ? 'YES' : 'NO'}`);

    // Fetch app settings for TGL option name and threshold
    const { data: settings } = await supabase
      .from('app_state')
      .select('key, value')
      .in('key', ['big_sale_threshold', 'tgl_option_name']);

    const settingsMap: any = {};
    (settings || []).forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    const BIG_SALE_THRESHOLD = parseInt(settingsMap.big_sale_threshold || '700', 10);
    const TGL_OPTION_NAME = settingsMap.tgl_option_name
      ? JSON.parse(settingsMap.tgl_option_name)
      : 'Option C - System Update';

    console.log(`⚙️  Settings: Threshold=$${BIG_SALE_THRESHOLD}, TGL="${TGL_OPTION_NAME}"`);

    // Query ServiceTitan for estimates in date range
    // API uses soldAfter parameter, so we query from start date at midnight
    const queryTimestamp = `${startDate}T00:00:00`;
    console.log(`📡 Querying ServiceTitan API for estimates sold after ${queryTimestamp}...`);

    const allEstimates: Estimate[] = await getSoldEstimates(queryTimestamp);
    console.log(`✅ Found ${allEstimates.length} total estimates from ServiceTitan`);

    // Filter to only estimates within our date range
    const endDateTime = new Date(`${endDate}T23:59:59`);
    const estimatesInRange = allEstimates.filter((est) => {
      const soldDate = new Date(est.soldOn);
      return soldDate <= endDateTime;
    });

    console.log(`📊 Filtered to ${estimatesInRange.length} estimates within date range`);

    if (estimatesInRange.length === 0) {
      console.log('ℹ️  No estimates found in date range');
      return createResponse(200, {
        success: true,
        message: 'No estimates found in date range',
        dateRange: { start: startDate, end: endDate },
        estimatesFound: 0,
        estimatesProcessed: 0,
        estimatesSkipped: 0,
        errors: [],
        durationMs: Date.now() - startTime,
      });
    }

    // Check which estimates already exist in database
    const estimateIds = estimatesInRange.map(e => e.id);
    const { data: existing } = await supabase
      .from('estimates')
      .select('estimate_id')
      .in('estimate_id', estimateIds);

    const existingIds = new Set((existing || []).map(e => e.estimate_id));
    console.log(`🔍 Found ${existingIds.size} estimates already in database`);

    // Statistics
    let processed = 0;
    let skipped = 0;
    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    // Process in batches
    for (let i = 0; i < estimatesInRange.length; i += batchSize) {
      const batch = estimatesInRange.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(estimatesInRange.length / batchSize);

      console.log(`\n📦 Processing Batch ${batchNum}/${totalBatches} (${batch.length} estimates)`);

      for (const estimate of batch) {
        const estimateId = estimate.id;

        try {
          // Resolve technician and customer names
          // These calls are cached, so subsequent calls are fast
          const salesperson = await getTechnician(estimate.soldBy);
          const rawCustomerName = await getCustomer(estimate.customerId);
          const customerName = formatCustomerName(rawCustomerName);
          const amount = estimate.subtotal || 0;
          const soldAt = estimate.soldOn;

          // Find TGL option in items
          let optionName = '';
          if (estimate.items && Array.isArray(estimate.items)) {
            const optionItem = estimate.items.find((item: EstimateItem) =>
              item.skuName?.includes(TGL_OPTION_NAME)
            );
            if (optionItem) {
              optionName = optionItem.skuName;
            }
          }

          // Determine if TGL or Big Sale
          const isTGL = amount === 0 && optionName.includes(TGL_OPTION_NAME);
          const isBigSale = amount > BIG_SALE_THRESHOLD;

          console.log(`  ${existingIds.has(estimateId) ? '🔄' : '✨'} ${estimateId}: ${salesperson}, $${amount.toFixed(2)}, TGL:${isTGL}, BigSale:${isBigSale}`);

          if (dryRun) {
            console.log(`    [DRY RUN] Would ${existingIds.has(estimateId) ? 'update' : 'insert'} estimate`);
            processed++;
            continue;
          }

          // UPSERT: Insert or update if exists
          const { error: upsertError } = await supabase
            .from('estimates')
            .upsert({
              estimate_id: estimateId,
              salesperson,
              customer_name: customerName,
              amount,
              sold_at: soldAt,
              option_name: optionName,
              is_tgl: isTGL,
              is_big_sale: isBigSale,
              raw_data: estimate,
              poll_log_id: null, // NULL indicates backfilled data
              processed_at: new Date().toISOString(),
            }, {
              onConflict: 'estimate_id',
              ignoreDuplicates: false, // Update if exists
            });

          if (upsertError) {
            console.error(`    ❌ Failed to upsert estimate ${estimateId}:`, upsertError.message);
            errors.push(`${estimateId}: ${upsertError.message}`);
            skipped++;
          } else {
            if (existingIds.has(estimateId)) {
              console.log(`    ✅ Updated existing estimate`);
              updated++;
            } else {
              console.log(`    ✅ Inserted new estimate`);
              inserted++;
            }
            processed++;
          }

          // Rate limiting: 500ms delay between estimates
          await sleep(500);

        } catch (error: any) {
          console.error(`    ❌ Error processing estimate ${estimateId}:`, error.message);
          errors.push(`${estimateId}: ${error.message}`);
          skipped++;
        }
      }

      // Batch delay: 3 seconds between batches
      if (i + batchSize < estimatesInRange.length) {
        console.log(`⏸️  Pausing 3 seconds before next batch...`);
        await sleep(3000);
      }
    }

    const durationMs = Date.now() - startTime;
    const durationMin = (durationMs / 60000).toFixed(2);

    console.log('\n✅ ===== BACKFILL COMPLETE =====');
    console.log(`📊 Statistics:`);
    console.log(`   - Total Found: ${estimatesInRange.length}`);
    console.log(`   - Processed: ${processed}`);
    console.log(`   - Inserted: ${inserted}`);
    console.log(`   - Updated: ${updated}`);
    console.log(`   - Skipped: ${skipped}`);
    console.log(`   - Errors: ${errors.length}`);
    console.log(`   - Duration: ${durationMin} minutes`);

    return createResponse(200, {
      success: true,
      message: dryRun ? 'Dry run completed - no data changed' : 'Backfill completed',
      dateRange: { start: startDate, end: endDate },
      batchSize,
      dryRun,
      statistics: {
        estimatesFound: estimatesInRange.length,
        estimatesProcessed: processed,
        estimatesInserted: inserted,
        estimatesUpdated: updated,
        estimatesSkipped: skipped,
        errorCount: errors.length,
      },
      errors: errors.slice(0, 10), // Return first 10 errors
      durationMs,
      note: '⚠️ NO celebrations were sent for backfilled data'
    });

  } catch (error: any) {
    console.error('❌ Backfill error:', error);

    return createResponse(500, {
      error: error.message || 'Internal server error',
      stack: error.stack,
    });
  }
};
