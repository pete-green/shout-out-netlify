import { DepartmentStats } from '../../../types/dashboard';
import { DepartmentCard } from '../DepartmentCard';
import styles from './DepartmentGrid.module.css';

interface DepartmentGridProps {
  departments: DepartmentStats[];
  workDays: number;
}

export function DepartmentGrid({ departments, workDays }: DepartmentGridProps) {
  return (
    <div className={styles.grid}>
      {departments.map((dept) => (
        <DepartmentCard
          key={dept.department}
          department={dept.department}
          total={dept.total}
          count={dept.count}
          workDays={workDays}
          waterQualityTotal={dept.waterQualityTotal}
          waterQualityCount={dept.waterQualityCount}
          waterQualityAverage={dept.waterQualityAverage}
          airQualityTotal={dept.airQualityTotal}
          airQualityCount={dept.airQualityCount}
          airQualityAverage={dept.airQualityAverage}
        />
      ))}
    </div>
  );
}
