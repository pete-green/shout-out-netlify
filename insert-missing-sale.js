// Script to manually insert the missing Chris McCue sale
// Run with: node insert-missing-sale.js

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env file
const envFile = readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      let value = valueParts.join('=').trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      env[key.trim()] = value;
    }
  }
});

// ServiceTitan API configuration
const ST_CONFIG = {
  baseUrl: env.ST_BASE_URL,
  authUrl: env.ST_AUTH_URL,
  tenantId: env.ST_TENANT_ID,
  applicationKey: env.ST_APP_KEY,
  clientId: env.ST_CLIENT_ID,
  clientSecret: env.ST_CLIENT_SECRET,
};

// Supabase configuration
const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Get ServiceTitan OAuth token
async function getServiceTitanToken() {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: ST_CONFIG.clientId,
    client_secret: ST_CONFIG.clientSecret,
  });

  const response = await fetch(ST_CONFIG.authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to authenticate: ${errorText}`);
  }

  const tokenData = await response.json();
  return tokenData.access_token;
}

// Fetch estimate from ServiceTitan
async function getEstimate(estimateId, bearerToken) {
  const url = `${ST_CONFIG.baseUrl}/sales/v2/tenant/${ST_CONFIG.tenantId}/estimates/${estimateId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'ST-App-Key': ST_CONFIG.applicationKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch estimate: ${errorText}`);
  }

  return await response.json();
}

// Get technician name
async function getTechnician(technicianId, bearerToken) {
  const url = `${ST_CONFIG.baseUrl}/settings/v2/tenant/${ST_CONFIG.tenantId}/technicians/${technicianId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'ST-App-Key': ST_CONFIG.applicationKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return `Technician #${technicianId}`;
  }

  const data = await response.json();
  return data.name || `Technician #${technicianId}`;
}

// Get customer name
async function getCustomer(customerId, bearerToken) {
  const url = `${ST_CONFIG.baseUrl}/crm/v2/tenant/${ST_CONFIG.tenantId}/customers/${customerId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'ST-App-Key': ST_CONFIG.applicationKey,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return `Customer #${customerId}`;
  }

  const data = await response.json();
  return data.name || `Customer #${customerId}`;
}

// Format customer name
function formatCustomerName(rawName) {
  if (rawName.indexOf(',') !== -1) {
    const parts = rawName.split(',');
    if (parts.length === 2) {
      const last = parts[0].trim();
      const first = parts[1].trim();
      return `${first} ${last}`;
    }
  }
  return rawName;
}

async function insertMissingSale() {
  try {
    console.log('🔍 Fetching missing Chris McCue sale from ServiceTitan...\n');

    const estimateId = '175678075';
    const token = await getServiceTitanToken();

    // Fetch the estimate
    const estimate = await getEstimate(estimateId, token);

    console.log('✅ Found estimate:', estimate.id);
    console.log(`   Sold On: ${estimate.soldOn}`);
    console.log(`   Amount: $${estimate.subtotal}`);
    console.log(`   Name: ${estimate.name}\n`);

    // Fetch names
    const salesperson = await getTechnician(estimate.soldBy, token);
    const rawCustomerName = await getCustomer(estimate.customerId, token);
    const customerName = formatCustomerName(rawCustomerName);

    console.log(`   Salesperson: ${salesperson}`);
    console.log(`   Customer: ${customerName}\n`);

    // Get settings
    const { data: settings } = await supabase
      .from('app_state')
      .select('key, value')
      .in('key', ['big_sale_threshold', 'tgl_option_name']);

    const settingsMap = {};
    (settings || []).forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    const BIG_SALE_THRESHOLD = parseInt(settingsMap.big_sale_threshold || '700', 10);
    const TGL_OPTION_NAME = settingsMap.tgl_option_name
      ? JSON.parse(settingsMap.tgl_option_name)
      : 'Option C - System Update';

    const amount = estimate.subtotal || 0;
    const soldAt = estimate.soldOn;
    const estimateName = estimate.name || '';

    const isTGL = estimateName.includes(TGL_OPTION_NAME);
    const isBigSale = amount > BIG_SALE_THRESHOLD;

    console.log(`   Is TGL: ${isTGL}`);
    console.log(`   Is Big Sale: ${isBigSale} (threshold: $${BIG_SALE_THRESHOLD})\n`);

    // Check if already exists
    const { data: existing } = await supabase
      .from('estimates')
      .select('estimate_id')
      .eq('estimate_id', estimateId)
      .single();

    if (existing) {
      console.log('⚠️  Estimate already exists in database. Skipping insert.\n');
      return;
    }

    console.log('💾 Inserting estimate into database...\n');

    // Insert estimate
    const { data: insertedEstimate, error: estimateError } = await supabase
      .from('estimates')
      .insert({
        estimate_id: estimateId,
        salesperson,
        customer_name: customerName,
        amount,
        sold_at: soldAt,
        option_name: estimateName,
        is_tgl: isTGL,
        is_big_sale: isBigSale,
        raw_data: estimate,
        poll_log_id: null, // Manual insert, no poll log
        processed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (estimateError) {
      console.error('❌ Error inserting estimate:', estimateError);
      process.exit(1);
    }

    console.log('✅ Estimate inserted successfully!\n');

    if (isBigSale) {
      console.log('🎉 This is a BIG SALE! The system should send a celebration automatically.\n');
    }

    console.log('✅ DONE - Missing sale has been captured in the database.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

insertMissingSale();
