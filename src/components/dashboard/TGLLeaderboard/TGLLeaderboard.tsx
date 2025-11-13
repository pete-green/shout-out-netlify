import { Card } from '../../ui/Card';
import { Avatar } from '../../ui/Avatar';
import { TGLLeader } from '../../../types/dashboard';
import { getInitials } from '../../../utils/formatters';
import { useDeviceType } from '../../../hooks/useDeviceType';
import styles from './TGLLeaderboard.module.css';

interface TGLLeaderboardProps {
  leaders: TGLLeader[];
  workDays: number;
}

export function TGLLeaderboard({ leaders, workDays }: TGLLeaderboardProps) {
  const { isTouchDevice } = useDeviceType();

  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>TGL Leaderboard</h3>
      <div className={styles.leadersList}>
        {leaders.map((leader, index) => {
          const tglsPerWorkDay = workDays > 0 ? leader.tglCount / workDays : 0;
          const isFirstPlace = index === 0;

          return (
            <div
              key={`${leader.name}-${index}`}
              className={`${styles.leaderRow} ${isFirstPlace ? styles.firstPlace : ''} ${!isTouchDevice ? styles.hoverable : ''}`.trim()}
            >
              <div className={styles.rank}>
                {isFirstPlace ? '🏆' : `#${index + 1}`}
              </div>

              <Avatar
                src={leader.headshot_url || undefined}
                alt={leader.name}
                initials={getInitials(leader.name)}
                size="medium"
              />

              <div className={styles.leaderInfo}>
                <div className={styles.leaderName}>{leader.name}</div>
                <div className={styles.department}>{leader.department}</div>
              </div>

              <div className={styles.stats}>
                <div className={styles.tglCount}>{leader.tglCount} TGLs</div>
                <div className={styles.tglPerDay}>{tglsPerWorkDay.toFixed(1)}/day</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
