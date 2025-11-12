-- Add Water Quality tracking columns to estimates table
-- These columns store calculated Water Quality amounts and metrics for each sale

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS has_water_quality BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS water_quality_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS water_quality_item_count INTEGER DEFAULT 0;

-- Create index for fast filtering by Water Quality sales
CREATE INDEX IF NOT EXISTS idx_estimates_has_water_quality
  ON estimates(has_water_quality)
  WHERE has_water_quality = TRUE;

-- Create index for querying WQ amounts
CREATE INDEX IF NOT EXISTS idx_estimates_water_quality_amount
  ON estimates(water_quality_amount)
  WHERE water_quality_amount > 0;

-- Add comments
COMMENT ON COLUMN estimates.has_water_quality IS 'TRUE if this estimate contains any Water Quality items from cross-sale group';
COMMENT ON COLUMN estimates.water_quality_amount IS 'Total dollar amount from Water Quality items in this estimate';
COMMENT ON COLUMN estimates.water_quality_item_count IS 'Number of Water Quality items included in this estimate';
