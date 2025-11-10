import { Handler } from '@netlify/functions';
import { supabase } from './lib/supabase';
import { calculateWorkDays as calculateWorkDaysFromHolidays } from './lib/holidays-service';

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
  'Other', // Catch-all for salespeople not in main departments
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
    const monthEndDate = getMonthEndDateET();
    const yearStartDate = getYearStartDateET();
    const yearEndDate = getYearEndDateET();

    console.log(`Today date: ${todayDate}`);
    console.log(`Month: ${monthStartDate} to ${monthEndDate}`);
    console.log(`Year: ${yearStartDate} to ${yearEndDate}`);

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

    // Fetch year-to-date sales data
    const ytdSales = await fetchSalesData(yearStartDate, todayDate);
    const ytdByDept = aggregateByDepartment(ytdSales, salespersonMap);
    const ytdTotal = calculateTotal(ytdByDept);

    // Calculate work days for MTD and YTD (elapsed so far)
    const workDays = await calculateWorkDays(monthStartDate, todayDate);
    const ytdWorkDays = await calculateWorkDays(yearStartDate, todayDate);

    // Calculate total work days for entire month and year
    const totalMonthWorkDays = await calculateWorkDays(monthStartDate, monthEndDate);
    const totalYearWorkDays = await calculateWorkDays(yearStartDate, yearEndDate);

    // Fetch TGL counts
    const todayTGLs = await fetchTGLCount(todayDate, todayDate);
    const mtdTGLs = await fetchTGLCount(monthStartDate, todayDate);

    // Calculate averages
    const avgSalesPerDay = workDays > 0 ? mtdTotal / workDays : 0;
    const ytdAvgSalesPerDay = ytdWorkDays > 0 ? ytdTotal / ytdWorkDays : 0;
    const avgTGLsPerDay = workDays > 0 ? mtdTGLs / workDays : 0;

    // Calculate pace projections
    const mtdPaceProjection = avgSalesPerDay * totalMonthWorkDays;
    const ytdPaceProjection = ytdAvgSalesPerDay * totalYearWorkDays;

    // Format and send the report
    const reportCard = formatReportCard({
      todayTotal,
      todayByDept,
      mtdTotal,
      mtdByDept,
      workDays,
      avgSalesPerDay,
      totalMonthWorkDays,
      mtdPaceProjection,
      ytdTotal,
      ytdByDept,
      ytdWorkDays,
      ytdAvgSalesPerDay,
      totalYearWorkDays,
      ytdPaceProjection,
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
 * Get first day of current year in Eastern Time as YYYY-MM-DD format
 */
function getYearStartDateET(): string {
  const now = new Date();
  const etDateString = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  // Split YYYY-MM-DD and replace month and day with 01-01
  const [year] = etDateString.split('-');
  return `${year}-01-01`;
}

/**
 * Get last day of current month in Eastern Time as YYYY-MM-DD format
 */
function getMonthEndDateET(): string {
  const now = new Date();
  const etDateString = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [year, month] = etDateString.split('-');

  // Create date for first day of next month, then subtract 1 day
  const nextMonth = new Date(`${year}-${month}-01`);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(0); // Sets to last day of previous month

  return nextMonth.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Get last day of current year in Eastern Time as YYYY-MM-DD format
 */
function getYearEndDateET(): string {
  const now = new Date();
  const etDateString = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [year] = etDateString.split('-');
  return `${year}-12-31`;
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

  // Main 7 departments (excluding "Other")
  const mainDepartments = SALES_DEPARTMENTS.slice(0, -1);

  // Initialize all departments
  SALES_DEPARTMENTS.forEach(dept => {
    byDept[dept] = { total: 0, count: 0 };
  });

  // Aggregate sales
  sales.forEach(sale => {
    const salesperson = sale.salesperson;
    const businessUnit = salespersonMap[salesperson];
    const amount = parseFloat(sale.amount);

    if (!isNaN(amount)) {
      // If salesperson has a business unit in the main 7 departments, use it
      // Otherwise, categorize as "Other"
      const targetDept = businessUnit && mainDepartments.includes(businessUnit)
        ? businessUnit
        : 'Other';

      byDept[targetDept].total += amount;
      byDept[targetDept].count++;
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
 * Now uses the call-board API to fetch holidays
 */
async function calculateWorkDays(startDate: string, endDate: string): Promise<number> {
  return await calculateWorkDaysFromHolidays(startDate, endDate);
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
  totalMonthWorkDays: number;
  mtdPaceProjection: number;
  ytdTotal: number;
  ytdByDept: SalesByDepartment;
  ytdWorkDays: number;
  ytdAvgSalesPerDay: number;
  totalYearWorkDays: number;
  ytdPaceProjection: number;
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

  // Build department breakdown text for today (show all departments)
  const todayDeptLines = SALES_DEPARTMENTS
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

  // Calculate comparison percentages
  const todayVsAvg = data.avgSalesPerDay > 0
    ? ((data.todayTotal - data.avgSalesPerDay) / data.avgSalesPerDay * 100)
    : 0;
  const todayTrend = todayVsAvg >= 0 ? '🟢' : '🔴';
  const todayTrendText = todayVsAvg >= 0
    ? `+${todayVsAvg.toFixed(1)}% vs MTD avg`
    : `${todayVsAvg.toFixed(1)}% vs MTD avg`;

  // Format card with proper sections and dividers
  return {
    cardsV2: [
      {
        cardId: `daily-report-${Date.now()}`,
        card: {
          header: {
            title: '📊 Sales Performance Report',
            subtitle: `${dateString} • ${timeString} ET`,
          },
          sections: [
            // Key Metrics Section
            {
              header: '💰 KEY METRICS',
              collapsible: false,
              widgets: [
                {
                  decoratedText: {
                    topLabel: 'Today\'s Sales',
                    text: `<font color="#1a73e8"><b>${formatCurrency(data.todayTotal)}</b></font>`,
                    bottomLabel: `${todayTrend} ${todayTrendText}`,
                  },
                },
                {
                  decoratedText: {
                    topLabel: 'MTD Average per Work Day',
                    text: `<font color="#34a853"><b>${formatCurrency(data.avgSalesPerDay)}</b></font>`,
                    bottomLabel: `${data.workDays} work days this month`,
                  },
                },
                {
                  decoratedText: {
                    topLabel: 'YTD Average per Work Day',
                    text: `<font color="#ea4335"><b>${formatCurrency(data.ytdAvgSalesPerDay)}</b></font>`,
                    bottomLabel: `${data.ytdWorkDays} work days this year`,
                  },
                },
              ],
            },
            // Divider
            {
              widgets: [
                {
                  divider: {},
                },
              ],
            },
            // Today's Sales Detail section
            {
              header: '📈 TODAY\'S SALES DETAIL',
              collapsible: true,
              widgets: [
                {
                  textParagraph: {
                    text: `<b>Total: ${formatCurrency(data.todayTotal)}</b>\n\n${todayDeptLines}`,
                  },
                },
              ],
            },
            // MTD Sales Detail section
            {
              header: '📅 MONTH-TO-DATE DETAIL',
              collapsible: true,
              widgets: [
                {
                  textParagraph: {
                    text: `<b>Total: ${formatCurrency(data.mtdTotal)}</b>\n<b>Average per work day: ${formatCurrency(data.avgSalesPerDay)}</b>\n<b>Work days: ${data.workDays} of ${data.totalMonthWorkDays}</b>\n\n${mtdDeptLines}`,
                  },
                },
                {
                  decoratedText: {
                    topLabel: 'Month-End Projection (at current pace)',
                    text: `<font color="#f9ab00"><b>${formatCurrency(data.mtdPaceProjection)}</b></font>`,
                    bottomLabel: `Based on ${formatCurrency(data.avgSalesPerDay)}/day × ${data.totalMonthWorkDays} work days`,
                  },
                },
              ],
            },
            // YTD Summary section
            {
              header: '🎯 YEAR-TO-DATE SUMMARY',
              collapsible: false,
              widgets: [
                {
                  decoratedText: {
                    topLabel: 'Total YTD Sales',
                    text: `<b>${formatCurrency(data.ytdTotal)}</b>`,
                  },
                },
                {
                  decoratedText: {
                    topLabel: 'Average Revenue per Work Day',
                    text: `<b>${formatCurrency(data.ytdAvgSalesPerDay)}</b>`,
                  },
                },
                {
                  decoratedText: {
                    topLabel: 'YTD Work Days',
                    text: `<b>${data.ytdWorkDays} of ${data.totalYearWorkDays} days</b>`,
                    bottomLabel: 'Excludes weekends and company holidays',
                  },
                },
                {
                  decoratedText: {
                    topLabel: 'Year-End Projection (at current pace)',
                    text: `<font color="#9334e6"><b>${formatCurrency(data.ytdPaceProjection)}</b></font>`,
                    bottomLabel: `Based on ${formatCurrency(data.ytdAvgSalesPerDay)}/day × ${data.totalYearWorkDays} work days`,
                  },
                },
              ],
            },
            // Divider
            {
              widgets: [
                {
                  divider: {},
                },
              ],
            },
            // TGL Tracking section
            {
              header: '🌟 TGL TRACKING',
              collapsible: false,
              widgets: [
                {
                  decoratedText: {
                    topLabel: 'Today\'s TGLs',
                    text: `<b>${data.todayTGLs} ${data.todayTGLs === 1 ? 'TGL' : 'TGLs'}</b>`,
                  },
                },
                {
                  decoratedText: {
                    topLabel: 'MTD Average per Work Day',
                    text: `<b>${data.avgTGLsPerDay.toFixed(1)} TGLs</b>`,
                  },
                },
                {
                  decoratedText: {
                    topLabel: 'MTD Total',
                    text: `<b>${data.mtdTGLs} ${data.mtdTGLs === 1 ? 'TGL' : 'TGLs'}</b>`,
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
