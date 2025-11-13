import { Card } from '../../ui/Card';
import { MetricDisplay } from '../../ui/MetricDisplay';
import { formatCurrency } from '../../../utils/formatters';
import { WATER_QUALITY_COLOR, AIR_QUALITY_COLOR } from '../../../types/dashboard';
import styles from './CompanyMetricsCard.module.css';

interface CompanyMetricsCardProps {
  title: string;
  total: number;
  workDays: number;
  avgPerWorkDay: number;
  waterQualityTotal?: number;
  waterQualityCount?: number;
  waterQualityPercentage?: number;
  waterQualityAverage?: number;
  airQualityTotal?: number;
  airQualityCount?: number;
  airQualityPercentage?: number;
  airQualityAverage?: number;
  isTGL?: boolean;
}

export function CompanyMetricsCard({
  title,
  total,
  workDays,
  avgPerWorkDay,
  waterQualityTotal,
  waterQualityCount,
  waterQualityPercentage,
  waterQualityAverage,
  airQualityTotal,
  airQualityCount,
  airQualityPercentage,
  airQualityAverage,
  isTGL = false,
}: CompanyMetricsCardProps) {
  const hasWaterQuality = waterQualityCount != null && waterQualityCount > 0 && (waterQualityTotal ?? 0) > 0;
  const hasAirQuality = airQualityCount != null && airQualityCount > 0 && (airQualityTotal ?? 0) > 0;

  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>{title}</h3>

      <div className={styles.mainMetrics}>
        <MetricDisplay
          label={isTGL ? 'Total TGLs' : 'Total Sales'}
          value={isTGL ? total : formatCurrency(total)}
          size="large"
        />
        <MetricDisplay
          label={`Per Work Day (${workDays} days)`}
          value={isTGL ? avgPerWorkDay.toFixed(1) : formatCurrency(avgPerWorkDay)}
          size="medium"
        />
      </div>

      {/* Water Quality Metrics */}
      {hasWaterQuality && (
        <div className={styles.crossSaleSection}>
          <h4 className={styles.crossSaleTitle} style={{ color: WATER_QUALITY_COLOR }}>
            Water Quality
          </h4>
          <div className={styles.crossSaleMetrics}>
            <MetricDisplay
              label="Total WQ"
              value={formatCurrency(waterQualityTotal || 0)}
              color={WATER_QUALITY_COLOR}
              size="small"
            />
            <MetricDisplay
              label="WQ %"
              value={`${waterQualityPercentage?.toFixed(1)}%`}
              color={WATER_QUALITY_COLOR}
              size="small"
            />
            <MetricDisplay
              label="Count"
              value={waterQualityCount || 0}
              color={WATER_QUALITY_COLOR}
              size="small"
            />
            <MetricDisplay
              label="Average"
              value={formatCurrency(waterQualityAverage || 0)}
              color={WATER_QUALITY_COLOR}
              size="small"
            />
          </div>
        </div>
      )}

      {/* Air Quality Metrics */}
      {hasAirQuality && (
        <div className={styles.crossSaleSection}>
          <h4 className={styles.crossSaleTitle} style={{ color: AIR_QUALITY_COLOR }}>
            Air Quality
          </h4>
          <div className={styles.crossSaleMetrics}>
            <MetricDisplay
              label="Total AQ"
              value={formatCurrency(airQualityTotal || 0)}
              color={AIR_QUALITY_COLOR}
              size="small"
            />
            <MetricDisplay
              label="AQ %"
              value={`${airQualityPercentage?.toFixed(1)}%`}
              color={AIR_QUALITY_COLOR}
              size="small"
            />
            <MetricDisplay
              label="Count"
              value={airQualityCount || 0}
              color={AIR_QUALITY_COLOR}
              size="small"
            />
            <MetricDisplay
              label="Average"
              value={formatCurrency(airQualityAverage || 0)}
              color={AIR_QUALITY_COLOR}
              size="small"
            />
          </div>
        </div>
      )}
    </Card>
  );
}
