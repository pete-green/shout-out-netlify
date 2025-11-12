-- Create pricebook_items table to store ServiceTitan pricebook data
-- This allows us to quickly lookup cross-sale group information without repeated API calls

CREATE TABLE IF NOT EXISTS pricebook_items (
  id BIGSERIAL PRIMARY KEY,
  sku_id BIGINT UNIQUE NOT NULL,
  sku_code TEXT,
  sku_type TEXT NOT NULL CHECK (sku_type IN ('Service', 'Material', 'Equipment')),
  display_name TEXT,
  description TEXT,
  cross_sale_group TEXT,
  price NUMERIC,
  cost NUMERIC,
  active BOOLEAN DEFAULT true,
  categories JSONB DEFAULT '[]'::jsonb,
  raw_data JSONB,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_pricebook_items_sku_id ON pricebook_items(sku_id);
CREATE INDEX IF NOT EXISTS idx_pricebook_items_cross_sale_group ON pricebook_items(cross_sale_group) WHERE cross_sale_group IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pricebook_items_sku_type ON pricebook_items(sku_type);
CREATE INDEX IF NOT EXISTS idx_pricebook_items_water_quality ON pricebook_items(cross_sale_group) WHERE cross_sale_group = 'WATER QUALITY';

-- Add comment to table
COMMENT ON TABLE pricebook_items IS 'Cached ServiceTitan pricebook items with cross-sale group information for Water Quality tracking';
COMMENT ON COLUMN pricebook_items.sku_id IS 'ServiceTitan SKU ID (unique identifier from pricebook API)';
COMMENT ON COLUMN pricebook_items.cross_sale_group IS 'Cross-sale group name from ServiceTitan (e.g., ''WATER QUALITY'')';
COMMENT ON COLUMN pricebook_items.last_synced_at IS 'Last time this item was synced from ServiceTitan API';
