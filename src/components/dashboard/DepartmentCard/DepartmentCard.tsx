import { Card } from '../../ui/Card';
import { MetricDisplay } from '../../ui/MetricDisplay';
import { formatCurrency } from '../../../utils/formatters';
import { DEPARTMENT_COLORS, WATER_QUALITY_COLOR, AIR_QUALITY_COLOR } from '../../../types/dashboard';
import { useDeviceType } from '../../../hooks/useDeviceType';
import styles from './DepartmentCard.module.css';

interface DepartmentCardProps {
  department: string;
  total: number;
  count: number;
  workDays: number;
  waterQualityTotal?: number;
  waterQualityCount?: number;
  waterQualityAverage?: number;
  airQualityTotal?: number;
  airQualityCount?: number;
  airQualityAverage?: number;
}

export function DepartmentCard({
  department,
  total,
  count,
  workDays,
  waterQualityTotal,
  waterQualityCount,
  waterQualityAverage,
  airQualityTotal,
  airQualityCount,
  airQualityAverage,
}: DepartmentCardProps) {
  const { isTouchDevice } = useDeviceType();
  const avgPerWorkDay = workDays > 0 ? total / workDays : 0;
  const borderColor = DEPARTMENT_COLORS[department] || DEPARTMENT_COLORS['Other'];
  const hasWaterQuality = waterQualityCount != null && waterQualityCount > 0 && (waterQualityTotal ?? 0) > 0;
  const hasAirQuality = airQualityCount != null && airQualityCount > 0 && (airQualityTotal ?? 0) > 0;

  return (
    <Card
      borderColor={borderColor}
      hoverable={!isTouchDevice}
      className={styles.card}
    >
      <h3 className={styles.title} style={{ color: borderColor }}>
        {department}
      </h3>

      <div className={styles.mainMetrics}>
        <MetricDisplay
          label="Total Sales"
          value={formatCurrency(total)}
          size="large"
        />
        <div className={styles.secondaryMetrics}>
          <MetricDisplay
            label="# of Sales"
            value={count}
            size="small"
          />
          <MetricDisplay
            label={`Per Work Day (${workDays})`}
            value={formatCurrency(avgPerWorkDay)}
            size="small"
          />
        </div>
      </div>

      {/* Water Quality */}
      {hasWaterQuality && (
        <div className={styles.crossSaleSection}>
          <h4 className={styles.crossSaleTitle} style={{ color: WATER_QUALITY_COLOR }}>
            Water Quality
          </h4>
          <div className={styles.crossSaleMetrics}>
            <MetricDisplay
              label="Total"
              value={formatCurrency(waterQualityTotal || 0)}
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

      {/* Air Quality */}
      {hasAirQuality && (
        <div className={styles.crossSaleSection}>
          <h4 className={styles.crossSaleTitle} style={{ color: AIR_QUALITY_COLOR }}>
            Air Quality
          </h4>
          <div className={styles.crossSaleMetrics}>
            <MetricDisplay
              label="Total"
              value={formatCurrency(airQualityTotal || 0)}
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
