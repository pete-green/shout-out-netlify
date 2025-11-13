import { useState } from 'react';
import { Card } from '../../ui/Card';
import { Avatar } from '../../ui/Avatar';
import { DepartmentStats, DEPARTMENT_COLORS, WATER_QUALITY_COLOR, AIR_QUALITY_COLOR } from '../../../types/dashboard';
import { formatCurrency, getInitials } from '../../../utils/formatters';
import { useDeviceType } from '../../../hooks/useDeviceType';
import styles from './TopPerformers.module.css';

interface TopPerformersProps {
  departments: DepartmentStats[];
  workDays: number;
}

export function TopPerformers({ departments, workDays }: TopPerformersProps) {
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());
  const { isTouchDevice } = useDeviceType();

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

  // Filter out departments with no sales
  const departmentsWithSales = departments.filter(dept => dept.topSalesperson);

  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>Top Performers by Department</h3>
      <div className={styles.accordionList}>
        {departmentsWithSales.map(dept => {
          const hasMultipleSalespeople = dept.allSalespeople && dept.allSalespeople.length > 1;
          const isExpanded = expandedDepartments.has(dept.department);
          const borderColor = DEPARTMENT_COLORS[dept.department] || DEPARTMENT_COLORS['Other'];

          return (
            <div key={dept.department} className={styles.accordionItem}>
              {/* Header - Always visible */}
              <div
                className={`${styles.accordionHeader} ${hasMultipleSalespeople ? styles.clickable : ''} ${!isTouchDevice && hasMultipleSalespeople ? styles.hoverable : ''}`.trim()}
                onClick={() => hasMultipleSalespeople && toggleDepartment(dept.department)}
                style={{ borderLeftColor: borderColor }}
              >
                <div className={styles.headerContent}>
                  {dept.topSalesperson?.headshot_url ? (
                    <Avatar
                      src={dept.topSalesperson.headshot_url}
                      alt={dept.topSalesperson.name}
                      size="large"
                    />
                  ) : dept.topSalesperson ? (
                    <Avatar
                      initials={getInitials(dept.topSalesperson.name)}
                      size="large"
                    />
                  ) : null}

                  <div className={styles.info}>
                    <div className={styles.departmentName}>
                      {dept.department}
                      {hasMultipleSalespeople && (
                        <span className={styles.personCount}>
                          ({dept.allSalespeople.length} {dept.allSalespeople.length === 1 ? 'person' : 'people'})
                        </span>
                      )}
                    </div>

                    {dept.topSalesperson ? (
                      <>
                        <div className={styles.salespersonName}>
                          {dept.topSalesperson.name}
                        </div>
                        <div className={styles.stats}>
                          {dept.topSalesperson.count} {dept.topSalesperson.count === 1 ? 'sale' : 'sales'} •
                          Avg: {formatCurrency(dept.topSalesperson.total / dept.topSalesperson.count)}
                          {workDays > 0 && (
                            <> • Per Work Day: {formatCurrency(dept.topSalesperson.total / workDays)}</>
                          )}
                        </div>

                        {/* Water Quality */}
                        {dept.topSalesperson.waterQualityCount > 0 && (
                          <div className={styles.crossSale} style={{ color: WATER_QUALITY_COLOR }}>
                            💧 WQ: {formatCurrency(dept.topSalesperson.waterQualityTotal)} ({dept.topSalesperson.waterQualityPercentage.toFixed(1)}%) • {dept.topSalesperson.waterQualityCount} {dept.topSalesperson.waterQualityCount === 1 ? 'sale' : 'sales'}
                          </div>
                        )}

                        {/* Air Quality */}
                        {dept.topSalesperson.airQualityCount > 0 && (
                          <div className={styles.crossSale} style={{ color: AIR_QUALITY_COLOR }}>
                            🌪️  AQ: {formatCurrency(dept.topSalesperson.airQualityTotal)} ({dept.topSalesperson.airQualityPercentage.toFixed(1)}%) • {dept.topSalesperson.airQualityCount} {dept.topSalesperson.airQualityCount === 1 ? 'sale' : 'sales'}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className={styles.noSales}>No sales yet</div>
                    )}
                  </div>
                </div>

                <div className={styles.headerRight}>
                  {dept.topSalesperson && (
                    <div className={styles.totalAmount} style={{ color: borderColor }}>
                      {formatCurrency(dept.topSalesperson.total)}
                    </div>
                  )}
                  {hasMultipleSalespeople && (
                    <div className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`.trim()}>
                      ▼
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded content - All other salespeople */}
              {isExpanded && hasMultipleSalespeople && (
                <div className={styles.expandedContent}>
                  {dept.allSalespeople.slice(1).map((person) => (
                    <div
                      key={person.name}
                      className={`${styles.salespersonRow} ${!isTouchDevice ? styles.hoverable : ''}`.trim()}
                    >
                      <div className={styles.salespersonLeft}>
                        {person.headshot_url ? (
                          <Avatar
                            src={person.headshot_url}
                            alt={person.name}
                            size="medium"
                          />
                        ) : (
                          <Avatar
                            initials={getInitials(person.name)}
                            size="medium"
                          />
                        )}

                        <div className={styles.salespersonInfo}>
                          <div className={styles.salespersonName}>{person.name}</div>
                          <div className={styles.stats}>
                            {person.count} {person.count === 1 ? 'sale' : 'sales'} •
                            Avg: {formatCurrency(person.total / person.count)}
                            {workDays > 0 && (
                              <> • Per Day: {formatCurrency(person.total / workDays)}</>
                            )}
                          </div>

                          {/* Water Quality */}
                          {person.waterQualityCount > 0 && (
                            <div className={styles.crossSale} style={{ color: WATER_QUALITY_COLOR }}>
                              💧 WQ: {formatCurrency(person.waterQualityTotal)} ({person.waterQualityPercentage.toFixed(1)}%) • {person.waterQualityCount} {person.waterQualityCount === 1 ? 'sale' : 'sales'}
                            </div>
                          )}

                          {/* Air Quality */}
                          {person.airQualityCount > 0 && (
                            <div className={styles.crossSale} style={{ color: AIR_QUALITY_COLOR }}>
                              🌪️  AQ: {formatCurrency(person.airQualityTotal)} ({person.airQualityPercentage.toFixed(1)}%) • {person.airQualityCount} {person.airQualityCount === 1 ? 'sale' : 'sales'}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className={styles.salespersonTotal} style={{ color: borderColor }}>
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
    </Card>
  );
}
