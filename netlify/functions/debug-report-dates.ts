import { Handler } from '@netlify/functions';
import { supabase } from './lib/supabase';

/**
 * Debug endpoint to see what dates the report is using
 */
export const handler: Handler = async (_event, _context) => {
  try {
    // Current implementation
    const now = new Date();
    const etDateString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const etDate = new Date(etDateString);
    etDate.setHours(0, 0, 0, 0);
    const todayStart = etDate.toISOString();
    const todayEnd = new Date().toISOString();

    const etDateStringMonth = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const etDateMonth = new Date(etDateStringMonth);
    etDateMonth.setDate(1);
    etDateMonth.setHours(0, 0, 0, 0);
    const monthStart = etDateMonth.toISOString();

    // Query sales in today's range
    const { data: todaySales, error: todayError } = await supabase
      .rpc('get_sales_by_date_range', {
        p_start_date: todayStart,
        p_end_date: todayEnd,
      });

    // Query sales in month range
    const { data: monthSales, error: monthError } = await supabase
      .rpc('get_sales_by_date_range', {
        p_start_date: monthStart,
        p_end_date: todayEnd,
      });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        now: now.toISOString(),
        etDateString,
        todayStart,
        todayEnd,
        monthStart,
        todaySalesCount: todaySales?.length || 0,
        todaySalesError: todayError?.message,
        monthSalesCount: monthSales?.length || 0,
        monthSalesError: monthError?.message,
        sampleSales: monthSales?.slice(0, 3),
      }, null, 2),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
