import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      let value = valueParts.join('=').trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key.trim()] = value;
    }
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

console.log('🔍 Looking for missed TGLs in October...\n');

const startDate = '2025-10-01';
const endDate = '2025-10-31';

// Get ALL estimates from October
const { data: allEstimates, error } = await supabase
  .from('estimates')
  .select('id, estimate_id, salesperson, sold_at, option_name, is_tgl')
  .gte('sold_at', `${startDate}T00:00:00`)
  .lte('sold_at', `${endDate}T23:59:59.999`)
  .order('sold_at', { ascending: true });

if (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

console.log(`📊 Found ${allEstimates.length} total estimates in October\n`);

// Check which ones have "Option C - System Update" in the option_name
const shouldBeTGLs = allEstimates.filter(est =>
  est.option_name && est.option_name.includes('Option C - System Update')
);

console.log(`🎯 Estimates with "Option C - System Update" in option_name: ${shouldBeTGLs.length}\n`);

const markedAsTGL = shouldBeTGLs.filter(est => est.is_tgl === true);
const notMarkedAsTGL = shouldBeTGLs.filter(est => est.is_tgl !== true);

console.log(`✅ Correctly marked as TGL: ${markedAsTGL.length}`);
markedAsTGL.forEach(est => {
  console.log(`   - ${est.estimate_id} | ${est.salesperson} | ${est.option_name}`);
});

console.log(`\n❌ NOT marked as TGL (but should be): ${notMarkedAsTGL.length}`);
notMarkedAsTGL.forEach(est => {
  console.log(`   - ${est.estimate_id} | ${est.salesperson} | is_tgl: ${est.is_tgl} | ${est.option_name}`);
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log(`\n📈 SUMMARY:`);
console.log(`   Total estimates in October: ${allEstimates.length}`);
console.log(`   Should be TGLs: ${shouldBeTGLs.length}`);
console.log(`   Currently marked as TGL: ${markedAsTGL.length}`);
console.log(`   Missing TGL flags: ${notMarkedAsTGL.length}`);
