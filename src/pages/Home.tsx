import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useIsMobile } from '../hooks/useDeviceType';

interface TopSalesperson {
  name: string;
  total: number;
  count: number;
  headshot_url: string | null;
}

interface DepartmentStats {
  department: string;
  total: number;
  count: number;
  topSalesperson: TopSalesperson | null;
}

interface DashboardData {
  dateRange: {
    start: string;
    end: string;
  };
  companyTotal: number;
  departments: DepartmentStats[];
  timestamp: string;
}

const API_URL = '/.netlify/functions';

// Get today's date in YYYY-MM-DD format in Eastern Time
function getTodayET(): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  return `${year}-${month}-${day}`;
}

// Department color mapping
const departmentColors: { [key: string]: string } = {
  'Plumbing Service': '#3b82f6', // Blue
  'Plumbing Install': '#0ea5e9', // Cyan
  'HVAC Service': '#f59e0b', // Amber
  'HVAC Install': '#f97316', // Orange
  'Electrical Service': '#8b5cf6', // Purple
  'Electrical Install': '#a855f7', // Violet
  'Inside Sales': '#10b981', // Green
};

function Home() {
  const isMobile = useIsMobile();
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

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Format timestamp
  const formatTimestamp = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div
      style={{
        padding: isMobile ? '1rem' : '2rem',
        maxWidth: '1400px',
        margin: '0 auto',
        minHeight: 'calc(100vh - 80px)',
      }}
    >
      {/* Header */}
      <div
        style={{
          marginBottom: isMobile ? '1.5rem' : '2rem',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: '1rem',
        }}
      >
        <h1 style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: 'bold', margin: 0 }}>
          📊 Sales Dashboard
        </h1>

        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1rem', alignItems: 'stretch' }}>
          {/* Date Range Picker */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                flex: isMobile ? 1 : 'none',
                padding: isMobile ? '0.75rem' : '0.5rem',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.375rem',
                color: '#f1f5f9',
                fontSize: isMobile ? '1rem' : '0.875rem',
                minHeight: isMobile ? '44px' : 'auto',
              }}
            />
            <span style={{ color: '#94a3b8' }}>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                flex: isMobile ? 1 : 'none',
                padding: isMobile ? '0.75rem' : '0.5rem',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.375rem',
                color: '#f1f5f9',
                fontSize: isMobile ? '1rem' : '0.875rem',
                minHeight: isMobile ? '44px' : 'auto',
              }}
            />
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchDashboard}
            disabled={loading}
            style={{
              padding: isMobile ? '0.75rem 1rem' : '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: isMobile ? '1rem' : '0.875rem',
              fontWeight: '500',
              opacity: loading ? 0.5 : 1,
              minHeight: isMobile ? '44px' : 'auto',
            }}
          >
            {loading ? '⟳ Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {/* Last Updated */}
      {lastUpdated && !loading && (
        <div style={{ marginBottom: '1rem', color: '#64748b', fontSize: '0.875rem' }}>
          Last updated: {formatTimestamp(lastUpdated)}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#7f1d1d',
            border: '1px solid #991b1b',
            borderRadius: '0.5rem',
            marginBottom: '2rem',
          }}
        >
          <p style={{ margin: 0, color: '#fca5a5' }}>❌ {error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && !data && (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⟳</div>
          <p>Loading dashboard data...</p>
        </div>
      )}

      {/* Dashboard Content */}
      {data && (
        <>
          {/* Company Total Card */}
          <div
            style={{
              backgroundColor: '#1e293b',
              border: '2px solid #3b82f6',
              borderRadius: '0.75rem',
              padding: isMobile ? '1.5rem' : '2rem',
              marginBottom: isMobile ? '1.5rem' : '2rem',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: isMobile ? '0.875rem' : '1rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
              Company Total
            </div>
            <div style={{ fontSize: isMobile ? '2rem' : '3rem', fontWeight: 'bold', color: '#3b82f6' }}>
              {formatCurrency(data.companyTotal)}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
              {startDate === endDate
                ? `for ${new Date(startDate).toLocaleDateString()}`
                : `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`}
            </div>
          </div>

          {/* Department Sales Grid */}
          <div style={{ marginBottom: isMobile ? '2rem' : '3rem' }}>
            <h2 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              Department Sales
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: isMobile ? '0.75rem' : '1rem',
              }}
            >
              {data.departments.map((dept) => (
                <div
                  key={dept.department}
                  style={{
                    backgroundColor: '#1e293b',
                    border: `2px solid ${departmentColors[dept.department] || '#334155'}`,
                    borderRadius: '0.5rem',
                    padding: isMobile ? '1.25rem' : '1.5rem',
                    transition: isMobile ? 'none' : 'transform 0.2s, box-shadow 0.2s',
                    cursor: 'default',
                  }}
                  onMouseEnter={isMobile ? undefined : (e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = `0 10px 25px -5px ${departmentColors[dept.department]}40`;
                  }}
                  onMouseLeave={isMobile ? undefined : (e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      color: departmentColors[dept.department] || '#94a3b8',
                      marginBottom: '0.75rem',
                    }}
                  >
                    {dept.department}
                  </div>
                  <div style={{ fontSize: isMobile ? '1.75rem' : '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    {formatCurrency(dept.total)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {dept.count} {dept.count === 1 ? 'sale' : 'sales'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Performers */}
          <div>
            <h2 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 'bold', marginBottom: isMobile ? '1rem' : '1.5rem' }}>
              🏆 Top Performers by Department
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '0.75rem' : '1rem' }}>
              {data.departments.map((dept) => (
                <div
                  key={dept.department}
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '0.5rem',
                    padding: isMobile ? '1rem' : '1.25rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: isMobile ? '0.75rem' : '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.75rem' : '1rem' }}>
                    <div
                      style={{
                        width: '4px',
                        height: isMobile ? '50px' : '60px',
                        backgroundColor: departmentColors[dept.department] || '#334155',
                        borderRadius: '2px',
                      }}
                    />
                    {dept.topSalesperson && dept.topSalesperson.headshot_url ? (
                      <img
                        src={dept.topSalesperson.headshot_url}
                        alt={dept.topSalesperson.name}
                        style={{
                          width: isMobile ? '50px' : '60px',
                          height: isMobile ? '50px' : '60px',
                          objectFit: 'cover',
                          borderRadius: '50%',
                          border: `2px solid ${departmentColors[dept.department] || '#475569'}`,
                        }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const placeholder = target.nextElementSibling as HTMLDivElement;
                          if (placeholder) placeholder.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    {dept.topSalesperson && !dept.topSalesperson.headshot_url ? (
                      <div
                        style={{
                          width: isMobile ? '50px' : '60px',
                          height: isMobile ? '50px' : '60px',
                          borderRadius: '50%',
                          backgroundColor: '#334155',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: isMobile ? '1.25rem' : '1.5rem',
                          fontWeight: 'bold',
                          color: '#94a3b8',
                          border: `2px solid ${departmentColors[dept.department] || '#475569'}`,
                        }}
                      >
                        {dept.topSalesperson.name.charAt(0).toUpperCase()}
                      </div>
                    ) : null}
                    <div>
                      <div style={{ fontSize: isMobile ? '0.75rem' : '0.875rem', color: '#94a3b8' }}>
                        {dept.department}
                      </div>
                      {dept.topSalesperson ? (
                        <>
                          <div style={{ fontSize: isMobile ? '1rem' : '1.125rem', fontWeight: '600' }}>
                            {dept.topSalesperson.name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {dept.topSalesperson.count} {dept.topSalesperson.count === 1 ? 'sale' : 'sales'}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: isMobile ? '0.875rem' : '1rem', color: '#64748b', fontStyle: 'italic' }}>
                          No sales yet
                        </div>
                      )}
                    </div>
                  </div>
                  {dept.topSalesperson && (
                    <div
                      style={{
                        fontSize: isMobile ? '1.25rem' : '1.5rem',
                        fontWeight: 'bold',
                        color: departmentColors[dept.department] || '#94a3b8',
                      }}
                    >
                      {formatCurrency(dept.topSalesperson.total)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Home;
