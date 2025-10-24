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

    let syncedCount = 0;
    let errorCount = 0;

    // Upsert each technician into the database
    for (const tech of allTechnicians) {
      try {
        const technicianId = tech.id;
        const name = tech.name || `Technician #${technicianId}`;
        const email = tech.email || null;
        const phone = tech.phone || tech.mobileNumber || null;
        const stActive = tech.active !== undefined ? tech.active : true;

        // Check if technician already exists
        const { data: existing } = await supabase
          .from('salespeople')
          .select('id, business_unit, headshot_url, is_active')
          .eq('technician_id', technicianId)
          .single();

        if (existing) {
          // Update existing record (preserve user-set fields)
          await supabase
            .from('salespeople')
            .update({
              name,
              email,
              phone,
              st_active: stActive,
              raw_data: tech,
              last_synced_at: new Date().toISOString(),
            })
            .eq('technician_id', technicianId);

          console.log(`🔄 Updated technician ${technicianId}: ${name}`);
        } else {
          // Insert new record
          await supabase.from('salespeople').insert({
            technician_id: technicianId,
            name,
            email,
            phone,
            st_active: stActive,
            is_active: true, // Default to active for new salespeople
            raw_data: tech,
            last_synced_at: new Date().toISOString(),
          });

          console.log(`➕ Added new technician ${technicianId}: ${name}`);
        }

        syncedCount++;
      } catch (error: any) {
        console.error(`❌ Error syncing technician ${tech.id}:`, error.message);
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;

    console.log(
      `✅ Sync completed: ${syncedCount} synced, ${errorCount} errors in ${duration}ms`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        totalFetched: allTechnicians.length,
        synced: syncedCount,
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
