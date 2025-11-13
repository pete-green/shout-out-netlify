import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DashboardData } from '../types/dashboard';
import { getTodayET, formatTimestamp, formatDateString } from '../utils/formatters';
import { CompanyMetricsCard } from '../components/dashboard/CompanyMetricsCard';
import { DepartmentGrid } from '../components/dashboard/DepartmentGrid';
import { TGLLeaderboard } from '../components/dashboard/TGLLeaderboard';
import { TopPerformers } from '../components/dashboard/TopPerformers';
import { DateRangePicker } from '../components/dashboard/DateRangePicker';
import styles from './Home.module.css';

const API_URL = '/.netlify/functions';

function Home() {
  const [startDate, setStartDate] = useState<string>(getTodayET());
  const [endDate, setEndDate] = useState<string>(getTodayET());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch dashboard data
  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${API_URL}/dashboard-stats?start_date=${startDate}&end_date=${endDate}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch dashboard data');
      }

      const dashboardData = await response.json();
      setData(dashboardData);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchDashboard();
  }, [startDate, endDate]);

  // Real-time subscription - listen for new sales
  useEffect(() => {
    console.log('📡 Setting up Realtime subscription for dashboard');

    const channel = supabase
      .channel('dashboard-estimates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'estimates',
        },
        (payload) => {
          console.log('🔔 New sale detected via Realtime!', payload);
          // Refresh dashboard when new estimate is added
          fetchDashboard();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime subscription active for dashboard');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime subscription error');
        }
      });

    return () => {
      console.log('🔌 Cleaning up Realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [startDate, endDate]);

  if (loading && !data) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h2>Error Loading Dashboard</h2>
          <p>{error}</p>
          <button onClick={fetchDashboard} className={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>No data available</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header Section */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h2 className={styles.title}>Sales Dashboard</h2>
          <div className={styles.dateInfo}>
            {formatDateString(data.dateRange.start)} - {formatDateString(data.dateRange.end)}
          </div>
        </div>

        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onRefresh={fetchDashboard}
          lastUpdated={lastUpdated}
          formatTimestamp={formatTimestamp}
        />
      </div>

      {/* Company Metrics Cards */}
      <div className={styles.companyMetrics}>
        <CompanyMetricsCard
          title="Company Total Sales"
          total={data.companyTotal}
          workDays={data.companyWorkDays}
          avgPerWorkDay={data.companyAvgPerWorkDay}
          waterQualityTotal={data.companyWaterQualityTotal}
          waterQualityCount={data.companyWaterQualityCount}
          waterQualityPercentage={data.companyWaterQualityPercentage}
          waterQualityAverage={data.companyWaterQualityAverage}
          airQualityTotal={data.companyAirQualityTotal}
          airQualityCount={data.companyAirQualityCount}
          airQualityPercentage={data.companyAirQualityPercentage}
          airQualityAverage={data.companyAirQualityAverage}
        />

        <CompanyMetricsCard
          title="Total TGLs"
          total={data.tglTotal}
          workDays={data.tglWorkDays}
          avgPerWorkDay={data.tglAvgPerWorkDay}
          isTGL={true}
        />
      </div>

      {/* Department Sales Section */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Department Sales</h3>
        <DepartmentGrid
          departments={data.departments}
          workDays={data.companyWorkDays}
        />
      </div>

      {/* TGL Leaderboard and Top Performers */}
      <div className={styles.bottomSection}>
        {/* TGL Leaderboard */}
        {data.tglLeaders && data.tglLeaders.length > 0 && (
          <div className={styles.leaderboardSection}>
            <TGLLeaderboard
              leaders={data.tglLeaders}
              workDays={data.tglWorkDays}
            />
          </div>
        )}

        {/* Top Performers */}
        <div className={styles.performersSection}>
          <TopPerformers
            departments={data.departments}
            workDays={data.companyWorkDays}
          />
        </div>
      </div>
    </div>
  );
}

export default Home;
