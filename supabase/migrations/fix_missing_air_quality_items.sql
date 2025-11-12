/**
 * Fix Missing Air Quality Items
 *
 * Updates 31 SKU codes that should have AIR QUALITY cross_sale_group
 * but currently have NULL. These are Polarized Media Air Cleaners and UV items.
 */

UPDATE pricebook_items
SET cross_sale_group = 'AIR QUALITY'
WHERE sku_code IN (
  'g-3LP1212',
  'g-3LP1220',
  'g-3LP1224',
  'g-3LP1414',
  'g-3LP1420',
  'g-3LP1424',
  'g-3LP1425',
  'g-3LP1430',
  'g-3LP1520',
  'g-3LP161/2215/8 X',
  'g-3LP1620',
  'g-3LP1624',
  'g-3LP1625',
  'g-3LP1630',
  'g-3LP1818',
  'g-3LP1820',
  'g-3LP1824',
  'g-3LP1830',
  'g-3LP2020',
  'g-3LP20215/8 X',
  'g-3LP2022',
  'g-3LP2024',
  'g-3LP2025',
  'g-3LP2030',
  'g-3LP211/2231/4 X',
  'g-3LP2424',
  'g-3LP2430',
  'g-3LP2525',
  'RM12/5',
  'RM212/5',
  'RM216/5'
);

-- Log the update
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % items to AIR QUALITY cross_sale_group', updated_count;
END $$;
