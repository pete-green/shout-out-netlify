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

const ST_CONFIG = {
  baseUrl: env.ST_BASE_URL,
  authUrl: env.ST_AUTH_URL,
  tenantId: env.ST_TENANT_ID,
  applicationKey: env.ST_APP_KEY,
  clientId: env.ST_CLIENT_ID,
  clientSecret: env.ST_CLIENT_SECRET,
};

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function getServiceTitanToken() {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: ST_CONFIG.clientId,
    client_secret: ST_CONFIG.clientSecret,
  });

  const response = await fetch(ST_CONFIG.authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const tokenData = await response.json();
  return tokenData.access_token;
}

async function getEstimate(estimateId, token) {
  const url = `${ST_CONFIG.baseUrl}/sales/v2/tenant/${ST_CONFIG.tenantId}/estimates/${estimateId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'ST-App-Key': ST_CONFIG.applicationKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch estimate ${estimateId}: ${response.status}`);
  }

  return await response.json();
}

async function fixTodayTGLs() {
  console.log('🔧 Fixing today\'s TGL records...\n');

  const token = await getServiceTitanToken();
  console.log('✅ Got ServiceTitan token\n');

  const TGL_OPTION_NAME = 'Option C - System Update';
  const estimateIds = ['174959440', '174963831'];

  for (const id of estimateIds) {
    console.log(`Processing estimate ${id}...`);

    // Fetch from ServiceTitan
    const estimate = await getEstimate(id, token);
    const estimateName = estimate.name || '';
    const isTGL = estimateName.includes(TGL_OPTION_NAME);

    console.log(`  Name from ServiceTitan: "${estimateName}"`);
    console.log(`  Is TGL: ${isTGL}`);

    // Update database
    const { error } = await supabase
      .from('estimates')
      .update({
        option_name: estimateName,
        is_tgl: isTGL,
      })
      .eq('estimate_id', id);

    if (error) {
      console.log(`  ❌ Error updating: ${error.message}`);
    } else {
      console.log(`  ✅ Updated successfully`);
    }
    console.log('');
  }

  console.log('✅ Done! Now checking results...\n');

  // Verify the updates
  const { data: tgls } = await supabase
    .from('estimates')
    .select('estimate_id, salesperson, amount, option_name, is_tgl')
    .in('estimate_id', estimateIds);

  console.log('Updated records:');
  tgls.forEach(tgl => {
    console.log(`  ${tgl.estimate_id}: ${tgl.salesperson} - $${tgl.amount} - "${tgl.option_name}" - TGL: ${tgl.is_tgl}`);
  });
}

fixTodayTGLs().catch(console.error);
