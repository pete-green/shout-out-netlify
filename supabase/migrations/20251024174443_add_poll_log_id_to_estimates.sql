-- Add poll_log_id column to link estimates to specific poll runs
ALTER TABLE estimates
  ADD COLUMN poll_log_id UUID NULL REFERENCES poll_logs(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX idx_estimates_poll_log_id ON estimates(poll_log_id);

-- Add comment
COMMENT ON COLUMN estimates.poll_log_id IS 'Links estimate to the specific poll run that discovered it. Used for poll details and debugging.';
