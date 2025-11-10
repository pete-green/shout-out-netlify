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

export const handler: Handler = async (event) => {
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

    // Get date ranges in Eastern Time
    const todayStart = getTodayStartET();
    const todayEnd = new Date().toISOString();
    const monthStart = getMonthStartET();

    console.log(`Today range: ${todayStart} to ${todayEnd}`);
    console.log(`Month range: ${monthStart} to ${todayEnd}`);

    // Fetch today's sales data
    const todaySales = await fetchSalesData(todayStart, todayEnd);
    const todayByDept = aggregateByDepartment(todaySales);
    const todayTotal = calculateTotal(todayByDept);

    // Fetch month-to-date sales data
    const mtdSales = await fetchSalesData(monthStart, todayEnd);
    const mtdByDept = aggregateByDepartment(mtdSales);
    const mtdTotal = calculateTotal(mtdByDept);

    // Calculate work days for MTD
    const workDays = await calculateWorkDays(monthStart, todayEnd);

    // Fetch TGL counts
    const todayTGLs = await fetchTGLCount(todayStart, todayEnd);
    const mtdTGLs = await fetchTGLCount(monthStart, todayEnd);

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
 * Get start of today in Eastern Time (midnight)
 */
function getTodayStartET(): string {
  const now = new Date();
  // Convert to ET by formatting with ET timezone
  const etDateString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etDateString);

  // Set to midnight
  etDate.setHours(0, 0, 0, 0);

  // Convert back to ISO string
  return etDate.toISOString();
}

/**
 * Get start of current month in Eastern Time
 */
function getMonthStartET(): string {
  const now = new Date();
  const etDateString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etDateString);

  // Set to first day of month at midnight
  etDate.setDate(1);
  etDate.setHours(0, 0, 0, 0);

  return etDate.toISOString();
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
 * Aggregate sales by department
 */
function aggregateByDepartment(sales: any[]): SalesByDepartment {
  const byDept: SalesByDepartment = {};

  // Initialize all departments
  SALES_DEPARTMENTS.forEach(dept => {
    byDept[dept] = { total: 0, count: 0 };
  });

  // Aggregate sales
  sales.forEach(sale => {
    const dept = sale.business_unit;
    const amount = parseFloat(sale.amount);

    if (SALES_DEPARTMENTS.includes(dept) && !isNaN(amount)) {
      byDept[dept].total += amount;
      byDept[dept].count++;
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
 */
async function fetchTGLCount(startDate: string, endDate: string): Promise<number> {
  const { data, error } = await supabase
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('is_tgl', true)
    .gte('sold_at', startDate)
    .lte('sold_at', endDate);

  if (error) {
    console.error('Error fetching TGL count:', error);
    throw new Error(`Failed to fetch TGL count: ${error.message}`);
  }

  return data || 0;
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
