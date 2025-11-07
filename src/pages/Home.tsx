import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
  allSalespeople: TopSalesperson[];
}

interface TGLLeader {
  name: string;
  tglCount: number;
  department: string;
  headshot_url: string | null;
}

interface DashboardData {
  dateRange: {
    start: string;
    end: string;
  };
  companyTotal: number;
  departments: DepartmentStats[];
  tglTotal: number;
  tglLeaders: TGLLeader[];
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
  'Other': '#64748b', // Slate gray
};

function Home() {
  const [startDate, setStartDate] = useState<string>(getTodayET());
  const [endDate, setEndDate] = useState<string>(getTodayET());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());

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

  // Format date string (YYYY-MM-DD) to local date display
  // Avoids timezone conversion issues by treating the date as local
  const formatDateString = (dateStr: string): string => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString();
  };

  // Toggle department expansion
  const toggleDepartment = (department: string) => {
    setExpandedDepartments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(department)) {
        newSet.delete(department);
      } else {
        newSet.add(department);
      }
      return newSet;
    });
  };

  return (
    <div
      style={{
        padding: '2rem',
        maxWidth: '1400px',
        margin: '0 auto',
        minHeight: 'calc(100vh - 80px)',
      }}
    >
      {/* Header */}
      <div
        style={{
          marginBottom: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>
          📊 Sales Dashboard
        </h1>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Date Range Picker */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                padding: '0.5rem',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.375rem',
                color: '#f1f5f9',
                fontSize: '0.875rem',
              }}
            />
            <span style={{ color: '#94a3b8' }}>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                padding: '0.5rem',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '0.375rem',
                color: '#f1f5f9',
                fontSize: '0.875rem',
              }}
            />
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchDashboard}
            disabled={loading}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              opacity: loading ? 0.5 : 1,
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
          {/* Top Cards: Company Total & TGL Total */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '1.5rem',
              marginBottom: '2rem',
            }}
          >
            {/* Company Total Card */}
            <div
              style={{
                backgroundColor: '#1e293b',
                border: '2px solid #3b82f6',
                borderRadius: '0.75rem',
                padding: '2rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                Company Total
              </div>
              <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#3b82f6' }}>
                {formatCurrency(data.companyTotal)}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                {startDate === endDate
                  ? `for ${formatDateString(startDate)}`
                  : `${formatDateString(startDate)} - ${formatDateString(endDate)}`}
              </div>
            </div>

            {/* TGL Total Card */}
            <div
              style={{
                backgroundColor: '#1e293b',
                border: '2px solid #10b981',
                borderRadius: '0.75rem',
                padding: '2rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                Total TGLs
              </div>
              <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#10b981' }}>
                {data.tglTotal}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                {startDate === endDate
                  ? `for ${formatDateString(startDate)}`
                  : `${formatDateString(startDate)} - ${formatDateString(endDate)}`}
              </div>
            </div>
          </div>

          {/* Department Sales Grid */}
          <div style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
              Department Sales
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '1rem',
              }}
            >
              {data.departments.map((dept) => (
                <div
                  key={dept.department}
                  style={{
                    backgroundColor: '#1e293b',
                    border: `2px solid ${departmentColors[dept.department] || '#334155'}`,
                    borderRadius: '0.5rem',
                    padding: '1.5rem',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    cursor: 'default',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = `0 10px 25px -5px ${departmentColors[dept.department]}40`;
                  }}
                  onMouseLeave={(e) => {
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
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    {formatCurrency(dept.total)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {dept.count} {dept.count === 1 ? 'sale' : 'sales'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TGL Leaderboard */}
          {data.tglLeaders && data.tglLeaders.length > 0 && (
            <div style={{ marginBottom: '3rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
                🎯 TGL Leaderboard
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {data.tglLeaders.map((leader, index) => (
                  <div
                    key={leader.name}
                    style={{
                      backgroundColor: '#1e293b',
                      border: index === 0 ? '2px solid #10b981' : '1px solid #334155',
                      borderRadius: '0.5rem',
                      padding: '1.25rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {/* Rank badge */}
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          backgroundColor: index === 0 ? '#10b981' : '#334155',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.25rem',
                          fontWeight: 'bold',
                          color: index === 0 ? '#ffffff' : '#94a3b8',
                        }}
                      >
                        {index + 1}
                      </div>

                      {/* Headshot or initial */}
                      {leader.headshot_url ? (
                        <img
                          src={leader.headshot_url}
                          alt={leader.name}
                          style={{
                            width: '60px',
                            height: '60px',
                            objectFit: 'cover',
                            borderRadius: '50%',
                            border: '2px solid #10b981',
                          }}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '50%',
                            backgroundColor: '#334155',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.5rem',
                            fontWeight: 'bold',
                            color: '#94a3b8',
                            border: '2px solid #10b981',
                          }}
                        >
                          {leader.name.charAt(0).toUpperCase()}
                        </div>
                      )}

                      {/* Name and department */}
                      <div>
                        <div style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                          {leader.name}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                          {leader.department}
                        </div>
                      </div>
                    </div>

                    {/* TGL count */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div
                        style={{
                          fontSize: '2rem',
                          fontWeight: 'bold',
                          color: '#10b981',
                        }}
                      >
                        {leader.tglCount}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                        {leader.tglCount === 1 ? 'TGL' : 'TGLs'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Performers */}
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
              🏆 Top Performers by Department
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {data.departments.map((dept) => {
                const isExpanded = expandedDepartments.has(dept.department);
                const hasMultipleSalespeople = dept.allSalespeople.length > 1;

                return (
                  <div
                    key={dept.department}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '0.5rem',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Header - Always visible */}
                    <div
                      onClick={() => hasMultipleSalespeople && toggleDepartment(dept.department)}
                      style={{
                        padding: '1.25rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '1rem',
                        cursor: hasMultipleSalespeople ? 'pointer' : 'default',
                        transition: 'background-color 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (hasMultipleSalespeople) {
                          e.currentTarget.style.backgroundColor = '#334155';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                        <div
                          style={{
                            width: '4px',
                            height: '60px',
                            backgroundColor: departmentColors[dept.department] || '#334155',
                            borderRadius: '2px',
                          }}
                        />
                        {dept.topSalesperson && dept.topSalesperson.headshot_url ? (
                          <img
                            src={dept.topSalesperson.headshot_url}
                            alt={dept.topSalesperson.name}
                            style={{
                              width: '60px',
                              height: '60px',
                              objectFit: 'cover',
                              borderRadius: '50%',
                              border: `2px solid ${departmentColors[dept.department] || '#475569'}`,
                            }}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        ) : null}
                        {dept.topSalesperson && !dept.topSalesperson.headshot_url ? (
                          <div
                            style={{
                              width: '60px',
                              height: '60px',
                              borderRadius: '50%',
                              backgroundColor: '#334155',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.5rem',
                              fontWeight: 'bold',
                              color: '#94a3b8',
                              border: `2px solid ${departmentColors[dept.department] || '#475569'}`,
                            }}
                          >
                            {dept.topSalesperson.name.charAt(0).toUpperCase()}
                          </div>
                        ) : null}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                            {dept.department}
                            {hasMultipleSalespeople && (
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                                ({dept.allSalespeople.length} {dept.allSalespeople.length === 1 ? 'person' : 'people'})
                              </span>
                            )}
                          </div>
                          {dept.topSalesperson ? (
                            <>
                              <div style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                                {dept.topSalesperson.name}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                {dept.topSalesperson.count} {dept.topSalesperson.count === 1 ? 'sale' : 'sales'} • Avg: {formatCurrency(dept.topSalesperson.total / dept.topSalesperson.count)}
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: '1rem', color: '#64748b', fontStyle: 'italic' }}>
                              No sales yet
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {dept.topSalesperson && (
                          <div
                            style={{
                              fontSize: '1.5rem',
                              fontWeight: 'bold',
                              color: departmentColors[dept.department] || '#94a3b8',
                            }}
                          >
                            {formatCurrency(dept.topSalesperson.total)}
                          </div>
                        )}
                        {hasMultipleSalespeople && (
                          <div
                            style={{
                              fontSize: '1.25rem',
                              color: '#64748b',
                              transition: 'transform 0.2s',
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            }}
                          >
                            ▼
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expanded content - All salespeople */}
                    {isExpanded && hasMultipleSalespeople && (
                      <div
                        style={{
                          borderTop: '1px solid #334155',
                          backgroundColor: '#0f172a',
                          padding: '1rem',
                        }}
                      >
                        {dept.allSalespeople.slice(1).map((person, index) => (
                          <div
                            key={person.name}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '0.75rem',
                              marginBottom: index < dept.allSalespeople.length - 2 ? '0.5rem' : 0,
                              backgroundColor: '#1e293b',
                              borderRadius: '0.375rem',
                              border: '1px solid #334155',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              {/* Rank badge */}
                              <div
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  backgroundColor: '#334155',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.875rem',
                                  fontWeight: 'bold',
                                  color: '#94a3b8',
                                }}
                              >
                                {index + 2}
                              </div>

                              {/* Headshot or initial */}
                              {person.headshot_url ? (
                                <img
                                  src={person.headshot_url}
                                  alt={person.name}
                                  style={{
                                    width: '40px',
                                    height: '40px',
                                    objectFit: 'cover',
                                    borderRadius: '50%',
                                    border: '1px solid #475569',
                                  }}
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '50%',
                                    backgroundColor: '#334155',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1rem',
                                    fontWeight: 'bold',
                                    color: '#94a3b8',
                                    border: '1px solid #475569',
                                  }}
                                >
                                  {person.name.charAt(0).toUpperCase()}
                                </div>
                              )}

                              {/* Name and sales count */}
                              <div>
                                <div style={{ fontSize: '0.9375rem', fontWeight: '500' }}>
                                  {person.name}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                  {person.count} {person.count === 1 ? 'sale' : 'sales'} • Avg: {formatCurrency(person.total / person.count)}
                                </div>
                              </div>
                            </div>

                            {/* Total */}
                            <div
                              style={{
                                fontSize: '1.125rem',
                                fontWeight: '600',
                                color: departmentColors[dept.department] || '#94a3b8',
                              }}
                            >
                              {formatCurrency(person.total)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Home;
