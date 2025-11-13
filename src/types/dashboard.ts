export interface TopSalesperson {
  name: string;
  total: number;
  count: number;
  headshot_url: string | null;
  waterQualityTotal: number;
  waterQualityCount: number;
  waterQualityPercentage: number;
  airQualityTotal: number;
  airQualityCount: number;
  airQualityPercentage: number;
}

export interface DepartmentStats {
  department: string;
  total: number;
  count: number;
  topSalesperson: TopSalesperson | null;
  allSalespeople: TopSalesperson[];
  waterQualityTotal: number;
  waterQualityCount: number;
  waterQualityPercentage: number;
  waterQualityAverage: number;
  airQualityTotal: number;
  airQualityCount: number;
  airQualityPercentage: number;
  airQualityAverage: number;
}

export interface TGLLeader {
  name: string;
  tglCount: number;
  department: string;
  headshot_url: string | null;
}

export interface DashboardData {
  dateRange: {
    start: string;
    end: string;
  };
  companyTotal: number;
  companyWorkDays: number;
  companyAvgPerWorkDay: number;
  companyWaterQualityTotal: number;
  companyWaterQualityCount: number;
  companyWaterQualityPercentage: number;
  companyWaterQualityAverage: number;
  companyAirQualityTotal: number;
  companyAirQualityCount: number;
  companyAirQualityPercentage: number;
  companyAirQualityAverage: number;
  departments: DepartmentStats[];
  tglTotal: number;
  tglWorkDays: number;
  tglAvgPerWorkDay: number;
  tglLeaders: TGLLeader[];
  timestamp: string;
}

// Department color mapping
export const DEPARTMENT_COLORS: { [key: string]: string } = {
  'Plumbing Service': '#3b82f6', // Blue
  'Plumbing Install': '#0ea5e9', // Cyan
  'HVAC Service': '#f59e0b', // Amber
  'HVAC Install': '#f97316', // Orange
  'Electrical Service': '#8b5cf6', // Purple
  'Electrical Install': '#a855f7', // Violet
  'Inside Sales': '#10b981', // Green
  'Other': '#64748b', // Slate gray
};

// Color constants for Water Quality and Air Quality
export const WATER_QUALITY_COLOR = '#06b6d4'; // Cyan
export const AIR_QUALITY_COLOR = '#a78bfa'; // Purple
