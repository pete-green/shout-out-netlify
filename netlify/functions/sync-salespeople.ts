import { Handler } from '@netlify/functions';
import { supabase } from './lib/supabase';
import { listTechnicians } from './lib/servicetitan';

/**
 * Sync salespeople from ServiceTitan API to database
 * Supports both manual trigger and scheduled execution
 */
export const handler: Handler = async (_event, _context) => {
  const startTime = Date.now();

  console.log('🔄 Starting salespeople sync...');

  try {
    let allTechnicians: any[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    // Fetch all pages of technicians
    while (hasMore) {
      console.log(`📡 Fetching page ${page}...`);
      const technicians = await listTechnicians(page, pageSize);

      if (technicians.length === 0) {
        hasMore = false;
      } else {
        allTechnicians = allTechnicians.concat(technicians);
        hasMore = technicians.length === pageSize; // Continue if we got a full page
        page++;
      }
    }

    console.log(`✅ Fetched ${allTechnicians.length} technicians from ServiceTitan`);

    // Fetch all existing technician_ids in one query
    const { data: existingPeople, error: fetchError } = await supabase
      .from('salespeople')
      .select('technician_id')
      .limit(10000);

    if (fetchError) {
      throw new Error(`Failed to fetch existing salespeople: ${fetchError.message}`);
    }

    const existingIds = new Set((existingPeople || []).map(p => p.technician_id));
    console.log(`✅ Found ${existingIds.size} existing salespeople in database`);

    const now = new Date().toISOString();

    // Split into new vs existing
    const newRecords: any[] = [];
    const updateRecords: any[] = [];

    let skippedCount = 0;

    for (const tech of allTechnicians) {
      // Skip technicians with no name — these are junk records from ServiceTitan
      if (!tech.name || !tech.name.trim()) {
        skippedCount++;
        continue;
      }

      const record = {
        technician_id: tech.id,
        name: tech.name,
        email: tech.email || null,
        phone: tech.phone || tech.mobileNumber || null,
        st_active: tech.active !== undefined ? tech.active : true,
        raw_data: tech,
        last_synced_at: now,
      };

      if (existingIds.has(tech.id)) {
        updateRecords.push(record);
      } else {
        newRecords.push({ ...record, is_active: true });
      }
    }

    if (skippedCount > 0) {
      console.log(`⏩ Skipped ${skippedCount} technicians with no name`);
    }

    let syncedCount = 0;
    let errorCount = 0;

    // Batch insert new records
    if (newRecords.length > 0) {
      const { error: insertError } = await supabase
        .from('salespeople')
        .insert(newRecords);

      if (insertError) {
        console.error('❌ Error inserting new salespeople:', insertError.message);
        errorCount += newRecords.length;
      } else {
        syncedCount += newRecords.length;
        console.log(`➕ Inserted ${newRecords.length} new salespeople: ${newRecords.map(r => r.name).join(', ')}`);
      }
    }

    // Batch upsert existing records (preserves user-set fields like business_unit, headshot_url, gender, is_active)
    if (updateRecords.length > 0) {
      const { error: upsertError } = await supabase
        .from('salespeople')
        .upsert(updateRecords, { onConflict: 'technician_id' });

      if (upsertError) {
        console.error('❌ Error updating existing salespeople:', upsertError.message);
        errorCount += updateRecords.length;
      } else {
        syncedCount += updateRecords.length;
        console.log(`🔄 Updated ${updateRecords.length} existing salespeople`);
      }
    }

    const duration = Date.now() - startTime;

    console.log(
      `✅ Sync completed: ${syncedCount} synced (${newRecords.length} new, ${updateRecords.length} updated), ${errorCount} errors in ${duration}ms`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        totalFetched: allTechnicians.length,
        synced: syncedCount,
        new: newRecords.length,
        updated: updateRecords.length,
        errors: errorCount,
        durationMs: duration,
      }),
    };
  } catch (error: any) {
    console.error('❌ Error in sync-salespeople function:', error);

    const duration = Date.now() - startTime;

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to sync salespeople',
        durationMs: duration,
      }),
    };
  }
};
