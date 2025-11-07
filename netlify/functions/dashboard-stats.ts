import { Handler, HandlerResponse } from '@netlify/functions';
import { supabase } from './lib/supabase';

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

interface Salesperson {
  name: string;
  total: number;
  count: number;
  headshot_url: string | null;
}

interface DepartmentStats {
  department: string;
  total: number;
  count: number;
  topSalesperson: Salesperson | null;
  allSalespeople: Salesperson[]; // All salespeople ranked by total
}

interface TGLLeader {
  name: string;
  tglCount: number;
  department: string;
  headshot_url: string | null;
}

/**
 * Dashboard Statistics API
 * GET /?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 * Returns sales statistics by department for the specified date range
 *
 * Company total includes ALL sales, department breakdown shows only 7 main depts
 */
export const handler: Handler = async (event, _context) => {
  const { httpMethod, queryStringParameters } = event;

  try {
    // OPTIONS - CORS preflight
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

    // GET - Fetch dashboard statistics
    if (httpMethod === 'GET') {
      const startDate = queryStringParameters?.start_date;
      const endDate = queryStringParameters?.end_date;

      if (!startDate || !endDate) {
        return createResponse(400, {
          error: 'start_date and end_date query parameters are required',
          example: '?start_date=2025-01-24&end_date=2025-01-24'
        });
      }

      console.log(`📊 Fetching dashboard stats for ${startDate} to ${endDate} (v2)`);

      // Use raw SQL with AT TIME ZONE to properly filter by Eastern Time
      // This query filters sold_at timestamps by their Eastern Time date, not UTC
      // CRITICAL: Supabase JS client has a default 1000 row limit on RPC calls
      // Fetch data in batches to work around the 1000 row limit
      const allSalesData: any[] = [];
      let batchNum = 0;
      const batchSize = 1000;
      let hasMore = true;

      console.log(`🔄 Fetching sales data in batches...`);

      while (hasMore && batchNum < 10) { // Safety limit of 10 batches (10,000 records)
        const { data: batchData, error: batchError } = await supabase
          .rpc('get_sales_by_date_range', {
            p_start_date: startDate,
            p_end_date: endDate
          })
          .range(batchNum * batchSize, (batchNum + 1) * batchSize - 1);

        if (batchError) {
          console.error(`❌ Error fetching batch ${batchNum}:`, batchError);
          throw new Error(`Failed to fetch sales data: ${batchError.message}`);
        }

        if (batchData && batchData.length > 0) {
          allSalesData.push(...batchData);
          console.log(`  ✅ Batch ${batchNum + 1}: fetched ${batchData.length} records (total: ${allSalesData.length})`);
          hasMore = batchData.length === batchSize;
          batchNum++;
        } else {
          hasMore = false;
        }
      }

      const salesData = allSalesData;

      console.log(`✅ Found ${salesData?.length || 0} paid sales in date range`);
      console.log(`🔍 DEBUG: RPC called with p_limit=10000, received ${salesData?.length || 0} records`);

      // Fetch all salespeople to get business units and headshots
      const { data: salespeople, error: salespeopleError } = await supabase
        .from('salespeople')
        .select('name, business_unit, headshot_url')
        .limit(1000); // Ensure we get all salespeople

      if (salespeopleError) {
        console.error('❌ Error fetching salespeople:', salespeopleError);
        throw new Error(`Failed to fetch salespeople: ${salespeopleError.message}`);
      }

      // Create lookup maps for salesperson -> business_unit and headshot
      const salespersonMap: { [name: string]: { business_unit: string; headshot_url: string | null } } = {};
      salespeople?.forEach(person => {
        if (person.name && person.business_unit) {
          salespersonMap[person.name] = {
            business_unit: person.business_unit,
            headshot_url: person.headshot_url || null,
          };
        }
      });

      console.log(`✅ Loaded ${Object.keys(salespersonMap).length} salespeople with business units`);

      // Define the departments we care about
      const departments = [
        'Plumbing Service',
        'Plumbing Install',
        'HVAC Service',
        'HVAC Install',
        'Electrical Service',
        'Electrical Install',
        'Inside Sales',
      ];

      // Calculate statistics
      let companyTotal = 0;
      const departmentStats: { [key: string]: DepartmentStats } = {};

      // Initialize department stats (including "Other")
      departments.forEach(dept => {
        departmentStats[dept] = {
          department: dept,
          total: 0,
          count: 0,
          topSalesperson: null,
          allSalespeople: [],
        };
      });

      // Initialize "Other" department for employees not in main departments
      departmentStats['Other'] = {
        department: 'Other',
        total: 0,
        count: 0,
        topSalesperson: null,
        allSalespeople: [],
      };

      // Group sales by department and salesperson
      const salesByDeptAndPerson: { [dept: string]: { [person: string]: { total: number; count: number } } } = {};

      salesData?.forEach((sale: any) => {
        const salesperson = sale.salesperson;
        const personData = salespersonMap[salesperson];
        const amount = parseFloat(sale.amount);

        // ALWAYS add to company total, regardless of department
        companyTotal += amount;

        // Check if person has a recognized business unit
        if (personData && departments.includes(personData.business_unit)) {
          const businessUnit = personData.business_unit;

          // Update department totals
          departmentStats[businessUnit].total += amount;
          departmentStats[businessUnit].count += 1;

          // Track by person for top performer calculation
          if (!salesByDeptAndPerson[businessUnit]) {
            salesByDeptAndPerson[businessUnit] = {};
          }
          if (!salesByDeptAndPerson[businessUnit][salesperson]) {
            salesByDeptAndPerson[businessUnit][salesperson] = { total: 0, count: 0 };
          }
          salesByDeptAndPerson[businessUnit][salesperson].total += amount;
          salesByDeptAndPerson[businessUnit][salesperson].count += 1;
        } else {
          // Add to "Other" category for employees not in main departments
          departmentStats['Other'].total += amount;
          departmentStats['Other'].count += 1;

          // Track by person for top performer calculation in "Other"
          if (!salesByDeptAndPerson['Other']) {
            salesByDeptAndPerson['Other'] = {};
          }
          if (!salesByDeptAndPerson['Other'][salesperson]) {
            salesByDeptAndPerson['Other'][salesperson] = { total: 0, count: 0 };
          }
          salesByDeptAndPerson['Other'][salesperson].total += amount;
          salesByDeptAndPerson['Other'][salesperson].count += 1;
        }
      });

      // Find top salesperson and build ranked list for each department
      Object.keys(salesByDeptAndPerson).forEach(dept => {
        const salespeople = salesByDeptAndPerson[dept];

        // Build array of all salespeople with their stats
        const salespeopleArray: Salesperson[] = Object.keys(salespeople).map(person => ({
          name: person,
          total: salespeople[person].total,
          count: salespeople[person].count,
          headshot_url: salespersonMap[person]?.headshot_url || null,
        }));

        // Sort by total descending
        salespeopleArray.sort((a, b) => b.total - a.total);

        // Set all salespeople
        departmentStats[dept].allSalespeople = salespeopleArray;

        // Set top salesperson (first in sorted array)
        if (salespeopleArray.length > 0) {
          departmentStats[dept].topSalesperson = salespeopleArray[0];
        }
      });

      // Convert to array for response (main departments + "Other")
      const departmentArray = [
        ...departments.map(dept => departmentStats[dept]),
        departmentStats['Other'] // Add "Other" at the end
      ];

      // ===== TGL STATISTICS =====

      // Use database aggregation to count TGLs by salesperson (much more efficient!)
      // This avoids loading thousands of records into memory
      const { data: tglAggregateData, error: estimatesError } = await supabase
        .rpc('get_tgl_counts_by_salesperson', {
          p_start_date: startDate,
          p_end_date: endDate
        });

      if (estimatesError) {
        console.error('❌ Error fetching TGL data:', estimatesError);
        // Don't fail the whole request, just return 0 TGLs
      }

      console.log(`✅ Found TGL data for ${tglAggregateData?.length || 0} salespeople`);

      let tglTotal = 0;

      // Build TGL leaders list from aggregated data
      const tglLeaders: TGLLeader[] = (tglAggregateData || [])
        .map((row: any) => {
          const person = row.salesperson;
          const count = parseInt(row.tgl_count || '0', 10);
          tglTotal += count;
          const personData = salespersonMap[person];
          return {
            name: person,
            tglCount: count,
            department: personData?.business_unit || 'Unknown',
            headshot_url: personData?.headshot_url || null,
          };
        })
        .filter((leader: TGLLeader) => leader.tglCount > 0) // Only include people with TGLs
        .sort((a: TGLLeader, b: TGLLeader) => b.tglCount - a.tglCount); // Sort by TGL count descending

      console.log(`✅ TGL Leaders: ${tglLeaders.length} people with TGLs`);

      // Calculate work days in the date range
      const { data: workDaysData, error: workDaysError } = await supabase
        .rpc('calculate_work_days', {
          p_start_date: startDate,
          p_end_date: endDate
        });

      if (workDaysError) {
        console.error('❌ Error calculating work days:', workDaysError);
        // Don't fail the whole request, just set to 0
      }

      const workDays = workDaysData || 0;
      console.log(`✅ Work days in range: ${workDays}`);

      const result = {
        dateRange: {
          start: startDate,
          end: endDate,
        },
        companyTotal,
        companyWorkDays: workDays,
        companyAvgPerWorkDay: workDays > 0 ? companyTotal / workDays : 0,
        departments: departmentArray,
        tglTotal,
        tglWorkDays: workDays,
        tglAvgPerWorkDay: workDays > 0 ? tglTotal / workDays : 0,
        tglLeaders,
        timestamp: new Date().toISOString(),
      };

      console.log(`✅ Dashboard stats calculated: Company total $${companyTotal.toFixed(2)}, TGLs: ${tglTotal}, Work days: ${workDays}`);

      return createResponse(200, result);
    }

    // Method not allowed
    return createResponse(405, { error: 'Method not allowed' });
  } catch (error: any) {
    console.error('❌ Error in dashboard-stats function:', error);

    return createResponse(500, {
      error: error.message || 'Internal server error',
    });
  }
};
