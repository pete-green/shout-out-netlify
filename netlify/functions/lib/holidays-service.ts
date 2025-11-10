/**
 * Holidays Service
 * Fetches company holidays from the call-board API server
 */

interface Holiday {
  id?: number;
  name: string;
  date: string; // ISO date string (YYYY-MM-DD)
  recurring: boolean;
  recurring_pattern?: string;
  affects_all_departments: boolean;
  created_at?: string;
  created_by?: string;
}

interface HolidaysApiResponse {
  holidays: Holiday[];
}

/**
 * Fetches holidays from the call-board API server
 * @param startDate Start date in YYYY-MM-DD format (optional)
 * @param endDate End date in YYYY-MM-DD format (optional)
 * @returns Array of holiday date strings in YYYY-MM-DD format
 */
export async function fetchHolidays(
  startDate?: string,
  endDate?: string
): Promise<string[]> {
  const apiUrl = process.env.CALL_BOARD_API_URL || 'http://localhost:3000';

  try {
    // Build query parameters
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const queryString = params.toString();
    const url = `${apiUrl}/api/holidays${queryString ? `?${queryString}` : ''}`;

    console.log(`[Holidays Service] Fetching holidays from: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Set a reasonable timeout
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data: HolidaysApiResponse = await response.json();

    // Extract just the dates for easy comparison
    const holidayDates = data.holidays.map(h => h.date);

    console.log(`[Holidays Service] Successfully fetched ${holidayDates.length} holidays`);

    return holidayDates;
  } catch (error) {
    console.error('[Holidays Service] Error fetching holidays from call-board API:', error);

    // Return empty array as fallback - this allows the calculation to continue
    // without holidays if the API is unavailable
    console.warn('[Holidays Service] Returning empty array as fallback');
    return [];
  }
}

/**
 * Calculates the number of work days between two dates
 * Excludes weekends (Saturday/Sunday) and company holidays
 * @param startDate Start date in YYYY-MM-DD format
 * @param endDate End date in YYYY-MM-DD format
 * @returns Number of work days
 */
export async function calculateWorkDays(
  startDate: string,
  endDate: string
): Promise<number> {
  try {
    // Fetch holidays for the date range
    const holidays = await fetchHolidays(startDate, endDate);
    const holidaySet = new Set(holidays);

    // Convert dates to Date objects
    const start = new Date(startDate);
    const end = new Date(endDate);

    let workDays = 0;
    const currentDate = new Date(start);

    // Iterate through each day in the range
    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
      const dateString = currentDate.toISOString().split('T')[0];

      // Count if it's not a weekend and not a holiday
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateString)) {
        workDays++;
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log(`[Holidays Service] Calculated ${workDays} work days between ${startDate} and ${endDate}`);

    return workDays;
  } catch (error) {
    console.error('[Holidays Service] Error calculating work days:', error);
    throw new Error(`Failed to calculate work days: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
