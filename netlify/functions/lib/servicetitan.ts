// ServiceTitan API configuration
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

const ST_CONFIG = {
  baseUrl: getRequiredEnv('ST_BASE_URL'),
  authUrl: getRequiredEnv('ST_AUTH_URL'),
  tenantId: getRequiredEnv('ST_TENANT_ID'),
  applicationKey: getRequiredEnv('ST_APP_KEY'),
  clientId: getRequiredEnv('ST_CLIENT_ID'),
  clientSecret: getRequiredEnv('ST_CLIENT_SECRET'),
};

// Token cache
let cachedToken: string | null = null;
let tokenExpiry: Date | null = null;

// Lookup caches (in-memory for single function execution)
const technicianCache = new Map<number, string>();
const customerCache = new Map<number, string>();
const MAX_CACHE_SIZE = 100;

/**
 * Get ServiceTitan OAuth token (cached for performance)
 */
export async function getServiceTitanToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && tokenExpiry && tokenExpiry > new Date()) {
    console.log('Using cached Service Titan token');
    return cachedToken;
  }

  console.log('Fetching new Service Titan token...');

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
    throw new Error(`Failed to authenticate with Service Titan: ${errorText}`);
  }

  const tokenData = await response.json();
  cachedToken = tokenData.access_token;

  if (!cachedToken) {
    throw new Error('Service Titan returned an empty access token');
  }

  const expiresIn = tokenData.expires_in || 3600;

  // Calculate expiry time (subtract 5 minutes for safety)
  tokenExpiry = new Date();
  tokenExpiry.setSeconds(tokenExpiry.getSeconds() + expiresIn - 300);

  console.log('Successfully obtained new Service Titan token');
  return cachedToken;
}

/**
 * Fetch sold estimates from ServiceTitan API
 * @param soldAfter ISO 8601 timestamp to filter estimates sold after this time
 */
export async function getSoldEstimates(soldAfter: string) {
  const bearerToken = await getServiceTitanToken();

  const url = `${ST_CONFIG.baseUrl}/sales/v2/tenant/${ST_CONFIG.tenantId}/estimates?soldAfter=${encodeURIComponent(soldAfter)}`;

  console.log('Fetching estimates from:', url);

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
    console.error('Service Titan API Error:', errorText);
    throw new Error(errorText);
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Get technician name by ID
 * @param technicianId The technician ID from soldBy field
 * @returns Technician name or fallback string
 */
export async function getTechnician(technicianId: number): Promise<string> {
  // Check cache first
  if (technicianCache.has(technicianId)) {
    return technicianCache.get(technicianId)!;
  }

  try {
    const bearerToken = await getServiceTitanToken();
    const url = `${ST_CONFIG.baseUrl}/settings/v2/tenant/${ST_CONFIG.tenantId}/technicians/${technicianId}`;

    console.log(`Fetching technician ${technicianId}...`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'ST-App-Key': ST_CONFIG.applicationKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch technician ${technicianId}: ${response.status}`);
      return `Technician #${technicianId}`;
    }

    const data = await response.json();
    const name = data.name || `Technician #${technicianId}`;

    // Add to cache (limit size)
    if (technicianCache.size >= MAX_CACHE_SIZE) {
      const firstKey = technicianCache.keys().next().value;
      if (firstKey !== undefined) {
        technicianCache.delete(firstKey);
      }
    }
    technicianCache.set(technicianId, name);

    return name;
  } catch (error: any) {
    console.error(`Error fetching technician ${technicianId}:`, error.message);
    return `Technician #${technicianId}`;
  }
}

/**
 * Get customer name by ID
 * @param customerId The customer ID from the estimate
 * @returns Customer name or fallback string
 */
export async function getCustomer(customerId: number): Promise<string> {
  // Check cache first
  if (customerCache.has(customerId)) {
    return customerCache.get(customerId)!;
  }

  try {
    const bearerToken = await getServiceTitanToken();
    const url = `${ST_CONFIG.baseUrl}/crm/v2/tenant/${ST_CONFIG.tenantId}/customers/${customerId}`;

    console.log(`Fetching customer ${customerId}...`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'ST-App-Key': ST_CONFIG.applicationKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch customer ${customerId}: ${response.status}`);
      return `Customer #${customerId}`;
    }

    const data = await response.json();
    const name = data.name || `Customer #${customerId}`;

    // Add to cache (limit size)
    if (customerCache.size >= MAX_CACHE_SIZE) {
      const firstKey = customerCache.keys().next().value;
      if (firstKey !== undefined) {
        customerCache.delete(firstKey);
      }
    }
    customerCache.set(customerId, name);

    return name;
  } catch (error: any) {
    console.error(`Error fetching customer ${customerId}:`, error.message);
    return `Customer #${customerId}`;
  }
}

/**
 * List all technicians from ServiceTitan
 * @param page Page number for pagination (default: 1)
 * @param pageSize Number of results per page (default: 100)
 * @returns Array of technician objects
 */
export async function listTechnicians(page = 1, pageSize = 100) {
  const bearerToken = await getServiceTitanToken();
  const url = `${ST_CONFIG.baseUrl}/settings/v2/tenant/${ST_CONFIG.tenantId}/technicians?page=${page}&pageSize=${pageSize}`;

  console.log(`Fetching technicians (page ${page}, pageSize ${pageSize})...`);

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
    console.error('Service Titan API Error:', errorText);
    throw new Error(`Failed to fetch technicians: ${errorText}`);
  }

  const data = await response.json();
  return data.data || [];
}
