import { Handler } from '@netlify/functions';
import { supabase } from './lib/supabase';

// Hardcoded webhook URL for daily reports
const DAILY_REPORT_WEBHOOK = 'https://chat.googleapis.com/v1/spaces/AAAAQCULUHM/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=D8HownKjGqw7V4Do1ptAosVz4jCqNi6rq9gXpOt4CTE';

// Sales departments to report on
const SALES_DEPARTMENTS = [
  'Plumbing Service',
  'Plumbing Install',
  'HVAC Service',
  'HVAC Install',
  'Electrical Service',
  'Electrical Install',
  'Inside Sales',
];

interface SalesByDepartment {
  [department: string]: {
    total: number;
    count: number;
  };
}

export const handler: Handler = async (_event, _context) => {
  try {
    console.log('Starting daily sales report generation...');

    // Check if today is a weekday (Monday-Friday)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log('Today is weekend, skipping report');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Weekend - no report sent' }),
      };
    }

    // Get date ranges in Eastern Time (YYYY-MM-DD format for RPC function)
    const todayDate = getTodayDateET();
    const monthStartDate = getMonthStartDateET();

    console.log(`Today date: ${todayDate}`);
    console.log(`Month start date: ${monthStartDate}`);

    // Fetch salespeople map for business unit lookup
    const salespersonMap = await fetchSalespeopleMap();

    // Fetch today's sales data
    const todaySales = await fetchSalesData(todayDate, todayDate);
    const todayByDept = aggregateByDepartment(todaySales, salespersonMap);
    const todayTotal = calculateTotal(todayByDept);

    // Fetch month-to-date sales data
    const mtdSales = await fetchSalesData(monthStartDate, todayDate);
    const mtdByDept = aggregateByDepartment(mtdSales, salespersonMap);
    const mtdTotal = calculateTotal(mtdByDept);

    // Calculate work days for MTD
    const workDays = await calculateWorkDays(monthStartDate, todayDate);

    // Fetch TGL counts
    const todayTGLs = await fetchTGLCount(todayDate, todayDate);
    const mtdTGLs = await fetchTGLCount(monthStartDate, todayDate);

    // Calculate averages
    const avgSalesPerDay = workDays > 0 ? mtdTotal / workDays : 0;
    const avgTGLsPerDay = workDays > 0 ? mtdTGLs / workDays : 0;

    // Format and send the report
    const reportCard = formatReportCard({
      todayTotal,
      todayByDept,
      mtdTotal,
      mtdByDept,
      workDays,
      avgSalesPerDay,
      todayTGLs,
      mtdTGLs,
      avgTGLsPerDay,
    });

    console.log('Sending report to Google Chat...');
    await sendToGoogleChat(reportCard);

    console.log('Daily sales report sent successfully');
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Report sent successfully' }),
    };
  } catch (error) {
    console.error('Error sending daily report:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
    };
  }
};

/**
 * Get today's date in Eastern Time as YYYY-MM-DD format
 * The RPC function expects date strings, not timestamps
 */
function getTodayDateET(): string {
  const now = new Date();
  // Format as YYYY-MM-DD in ET timezone
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Get first day of current month in Eastern Time as YYYY-MM-DD format
 */
function getMonthStartDateET(): string {
  const now = new Date();
  const etDateString = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  // Split YYYY-MM-DD and replace day with 01
  const [year, month] = etDateString.split('-');
  return `${year}-${month}-01`;
}

/**
 * Fetch sales data for a date range
 */
async function fetchSalesData(startDate: string, endDate: string) {
  const allSales: any[] = [];
  let batchNum = 0;
  const batchSize = 1000;

  while (true) {
    const { data: batchData, error: batchError } = await supabase
      .rpc('get_sales_by_date_range', {
        p_start_date: startDate,
        p_end_date: endDate,
      })
      .range(batchNum * batchSize, (batchNum + 1) * batchSize - 1);

    if (batchError) {
      console.error('Error fetching sales:', batchError);
      throw new Error(`Failed to fetch sales: ${batchError.message}`);
    }

    if (!batchData || batchData.length === 0) {
      break;
    }

    allSales.push(...batchData);

    if (batchData.length < batchSize) {
      break;
    }

    batchNum++;
  }

  console.log(`Fetched ${allSales.length} sales records`);
  return allSales;
}

/**
 * Fetch salespeople to get their business units
 */
async function fetchSalespeopleMap() {
  const { data: salespeople, error } = await supabase
    .from('salespeople')
    .select('name, business_unit')
    .limit(1000);

  if (error) {
    console.error('Error fetching salespeople:', error);
    throw new Error(`Failed to fetch salespeople: ${error.message}`);
  }

  // Create lookup map: salesperson name -> business_unit
  const salespersonMap: { [name: string]: string } = {};
  salespeople?.forEach(person => {
    if (person.name && person.business_unit) {
      salespersonMap[person.name] = person.business_unit;
    }
  });

  console.log(`Loaded ${Object.keys(salespersonMap).length} salespeople with business units`);
  return salespersonMap;
}

/**
 * Aggregate sales by department
 */
function aggregateByDepartment(sales: any[], salespersonMap: { [name: string]: string }): SalesByDepartment {
  const byDept: SalesByDepartment = {};

  // Initialize all departments
  SALES_DEPARTMENTS.forEach(dept => {
    byDept[dept] = { total: 0, count: 0 };
  });

  // Aggregate sales
  sales.forEach(sale => {
    const salesperson = sale.salesperson;
    const businessUnit = salespersonMap[salesperson];
    const amount = parseFloat(sale.amount);

    if (businessUnit && SALES_DEPARTMENTS.includes(businessUnit) && !isNaN(amount)) {
      byDept[businessUnit].total += amount;
      byDept[businessUnit].count++;
    }
  });

  return byDept;
}

/**
 * Calculate total sales across all departments
 */
function calculateTotal(byDept: SalesByDepartment): number {
  return Object.values(byDept).reduce((sum, dept) => sum + dept.total, 0);
}

/**
 * Calculate work days in a date range (excluding weekends and holidays)
 */
async function calculateWorkDays(startDate: string, endDate: string): Promise<number> {
  const { data, error } = await supabase.rpc('calculate_work_days', {
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) {
    console.error('Error calculating work days:', error);
    throw new Error(`Failed to calculate work days: ${error.message}`);
  }

  return data || 0;
}

/**
 * Fetch TGL count for a date range
 * startDate and endDate should be in YYYY-MM-DD format
 * We need to convert to full day ranges in Eastern Time
 */
async function fetchTGLCount(startDate: string, endDate: string): Promise<number> {
  // Convert YYYY-MM-DD to timestamp range
  // Start at 00:00:00 ET, End at 23:59:59 ET
  const startTimestamp = `${startDate}T00:00:00-05:00`; // EST (adjust for EDT if needed)
  const endTimestamp = `${endDate}T23:59:59-05:00`;

  const { count, error } = await supabase
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('is_tgl', true)
    .gte('sold_at', startTimestamp)
    .lte('sold_at', endTimestamp);

  if (error) {
    console.error('Error fetching TGL count:', error);
    throw new Error(`Failed to fetch TGL count: ${error.message}`);
  }

  return count || 0;
}

/**
 * Format the report data as a Google Chat Card V2
 */
function formatReportCard(data: {
  todayTotal: number;
  todayByDept: SalesByDepartment;
  mtdTotal: number;
  mtdByDept: SalesByDepartment;
  workDays: number;
  avgSalesPerDay: number;
  todayTGLs: number;
  mtdTGLs: number;
  avgTGLsPerDay: number;
}) {
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const dateString = now.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Build department breakdown text for today
  const todayDeptLines = SALES_DEPARTMENTS
    .filter(dept => data.todayByDept[dept].total > 0)
    .map(dept => {
      const { total, count } = data.todayByDept[dept];
      return `  • ${dept}: ${formatCurrency(total)} (${count} ${count === 1 ? 'sale' : 'sales'})`;
    })
    .join('\n');

  // Build department breakdown text for MTD
  const mtdDeptLines = SALES_DEPARTMENTS
    .map(dept => {
      const { total, count } = data.mtdByDept[dept];
      return `  • ${dept}: ${formatCurrency(total)} (${count} ${count === 1 ? 'sale' : 'sales'})`;
    })
    .join('\n');

  const reportText = `📊 *Sales Report*
${dateString} • ${timeString} ET

━━━━━━━━━━━━━━━━━━━━━━

📈 *TODAY'S SALES*
*Total: ${formatCurrency(data.todayTotal)}*

${todayDeptLines || '  No sales yet today'}

━━━━━━━━━━━━━━━━━━━━━━

📅 *MONTH-TO-DATE SALES*
*Total: ${formatCurrency(data.mtdTotal)}*
*Average per work day: ${formatCurrency(data.avgSalesPerDay)}*
*Work days: ${data.workDays}*

${mtdDeptLines}

━━━━━━━━━━━━━━━━━━━━━━

🎯 *TGL TRACKING*
*Today: ${data.todayTGLs} ${data.todayTGLs === 1 ? 'TGL' : 'TGLs'}*
*MTD Average: ${data.avgTGLsPerDay.toFixed(1)} TGLs per work day*
*MTD Total: ${data.mtdTGLs} ${data.mtdTGLs === 1 ? 'TGL' : 'TGLs'}*`;

  return {
    cardsV2: [
      {
        cardId: `daily-report-${Date.now()}`,
        card: {
          sections: [
            {
              widgets: [
                {
                  textParagraph: {
                    text: reportText,
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

/**
 * Format number as currency
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Send the formatted card to Google Chat
 */
async function sendToGoogleChat(payload: any): Promise<void> {
  const response = await fetch(DAILY_REPORT_WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send to Google Chat: ${response.status} ${errorText}`);
  }

  console.log('Successfully sent to Google Chat');
}
