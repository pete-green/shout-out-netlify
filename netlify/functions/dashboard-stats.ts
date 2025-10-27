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

interface DepartmentStats {
  department: string;
  total: number;
  count: number;
  topSalesperson: {
    name: string;
    total: number;
    count: number;
    headshot_url: string | null;
  } | null;
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

      console.log(`📊 Fetching dashboard stats for ${startDate} to ${endDate}`);

      // Use raw SQL with AT TIME ZONE to properly filter by Eastern Time
      // This query filters sold_at timestamps by their Eastern Time date, not UTC
      const { data: salesData, error: salesError } = await supabase
        .rpc('get_sales_by_date_range', {
          p_start_date: startDate,
          p_end_date: endDate
        });

      if (salesError) {
        console.error('❌ Error fetching sales data:', salesError);
        throw new Error(`Failed to fetch sales data: ${salesError.message}`);
      }

      console.log(`✅ Found ${salesData?.length || 0} paid sales in date range`);

      // Fetch all salespeople to get business units and headshots
      const { data: salespeople, error: salespeopleError } = await supabase
        .from('salespeople')
        .select('name, business_unit, headshot_url');

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

      // Initialize department stats
      departments.forEach(dept => {
        departmentStats[dept] = {
          department: dept,
          total: 0,
          count: 0,
          topSalesperson: null,
        };
      });

      // Group sales by department and salesperson
      const salesByDeptAndPerson: { [dept: string]: { [person: string]: { total: number; count: number } } } = {};

      salesData?.forEach((sale: any) => {
        const salesperson = sale.salesperson;
        const personData = salespersonMap[salesperson];
        const amount = parseFloat(sale.amount);

        // Skip if no business unit found or not in our list
        if (!personData || !departments.includes(personData.business_unit)) {
          return;
        }

        const businessUnit = personData.business_unit;
        companyTotal += amount;

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
      });

      // Find top salesperson for each department
      Object.keys(salesByDeptAndPerson).forEach(dept => {
        const salespeople = salesByDeptAndPerson[dept];
        let topPerson: string | null = null;
        let topTotal = 0;

        Object.keys(salespeople).forEach(person => {
          if (salespeople[person].total > topTotal) {
            topTotal = salespeople[person].total;
            topPerson = person;
          }
        });

        if (topPerson) {
          departmentStats[dept].topSalesperson = {
            name: topPerson,
            total: salespeople[topPerson].total,
            count: salespeople[topPerson].count,
            headshot_url: salespersonMap[topPerson]?.headshot_url || null,
          };
        }
      });

      // Convert to array for response
      const departmentArray = departments.map(dept => departmentStats[dept]);

      // ===== TGL STATISTICS =====

      // Query TGL data using the same RPC function, then filter for TGLs
      const { data: allEstimatesData, error: estimatesError } = await supabase
        .from('estimates')
        .select('id, salesperson, is_tgl')
        .eq('is_tgl', true)
        .gte('sold_at', `${startDate}T00:00:00`)
        .lte('sold_at', `${endDate}T23:59:59.999`);

      if (estimatesError) {
        console.error('❌ Error fetching TGL data:', estimatesError);
        // Don't fail the whole request, just return 0 TGLs
      }

      console.log(`✅ Found ${allEstimatesData?.length || 0} TGLs in date range`);

      let tglTotal = 0;
      const tglBySalesperson: { [person: string]: number } = {};

      // Count TGLs by salesperson
      allEstimatesData?.forEach((estimate: any) => {
        const salesperson = estimate.salesperson;
        if (salesperson) {
          tglTotal++;
          tglBySalesperson[salesperson] = (tglBySalesperson[salesperson] || 0) + 1;
        }
      });

      // Build TGL leaders list (only people with TGLs > 0)
      const tglLeaders: TGLLeader[] = Object.keys(tglBySalesperson)
        .map(person => {
          const personData = salespersonMap[person];
          return {
            name: person,
            tglCount: tglBySalesperson[person],
            department: personData?.business_unit || 'Unknown',
            headshot_url: personData?.headshot_url || null,
          };
        })
        .sort((a, b) => b.tglCount - a.tglCount); // Sort by TGL count descending

      console.log(`✅ TGL Leaders: ${tglLeaders.length} people with TGLs`);

      const result = {
        dateRange: {
          start: startDate,
          end: endDate,
        },
        companyTotal,
        departments: departmentArray,
        tglTotal,
        tglLeaders,
        timestamp: new Date().toISOString(),
      };

      console.log(`✅ Dashboard stats calculated: Company total $${companyTotal.toFixed(2)}, TGLs: ${tglTotal}`);

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
