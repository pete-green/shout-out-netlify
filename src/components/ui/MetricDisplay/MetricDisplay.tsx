import styles from './MetricDisplay.module.css';

interface MetricDisplayProps {
  label: string;
  value: string | number;
  color?: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export function MetricDisplay({
  label,
  value,
  color,
  size = 'medium',
  className = ''
}: MetricDisplayProps) {
  const sizeClass = styles[size];
  const valueStyle = color ? { color } : undefined;

  return (
    <div className={`${styles.metric} ${sizeClass} ${className}`.trim()}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value} style={valueStyle}>
        {value}
      </div>
    </div>
  );
}
