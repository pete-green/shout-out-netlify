import styles from './DateRangePicker.module.css';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onRefresh?: () => void;
  lastUpdated?: Date | null;
  formatTimestamp?: (date: Date) => string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onRefresh,
  lastUpdated,
  formatTimestamp,
}: DateRangePickerProps) {
  return (
    <div className={styles.container}>
      <div className={styles.dateInputs}>
        <div className={styles.inputGroup}>
          <label htmlFor="start-date" className={styles.label}>
            Start Date
          </label>
          <input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className={styles.input}
          />
        </div>

        <div className={styles.inputGroup}>
          <label htmlFor="end-date" className={styles.label}>
            End Date
          </label>
          <input
            id="end-date"
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className={styles.input}
          />
        </div>
      </div>

      {onRefresh && (
        <div className={styles.refreshSection}>
          <button onClick={onRefresh} className={styles.refreshButton}>
            🔄 Refresh
          </button>
          {lastUpdated && formatTimestamp && (
            <div className={styles.lastUpdated}>
              Last updated: {formatTimestamp(lastUpdated)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
