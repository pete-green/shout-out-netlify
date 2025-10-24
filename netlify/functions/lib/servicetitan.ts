// ServiceTitan API configuration
const ST_CONFIG = {
  baseUrl: process.env.ST_BASE_URL!,
  authUrl: process.env.ST_AUTH_URL!,
  tenantId: process.env.ST_TENANT_ID!,
  applicationKey: process.env.ST_APP_KEY!,
  clientId: process.env.ST_CLIENT_ID!,
  clientSecret: process.env.ST_CLIENT_SECRET!,
};

// Token cache
let cachedToken: string | null = null;
let tokenExpiry: Date | null = null;

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
