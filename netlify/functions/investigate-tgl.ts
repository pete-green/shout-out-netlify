import { Handler, HandlerResponse } from '@netlify/functions';
import { getSoldEstimates } from './lib/servicetitan';

/**
 * Investigation script to examine ServiceTitan estimate data structure
 * to find where "Option C - System Update" appears
 */

function createResponse(statusCode: number, body: any): HandlerResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body, null, 2),
  };
}

/**
 * Deep search for a string in an object
 */
function findStringInObject(obj: any, searchTerm: string, path = ''): string[] {
  const results: string[] = [];

  if (obj === null || obj === undefined) {
    return results;
  }

  // If it's a string, check if it contains the search term
  if (typeof obj === 'string') {
    if (obj.toLowerCase().includes(searchTerm.toLowerCase())) {
      results.push(`${path}: "${obj}"`);
    }
    return results;
  }

  // If it's an array, search each element
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      results.push(...findStringInObject(item, searchTerm, itemPath));
    });
    return results;
  }

  // If it's an object, search each property
  if (typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      const propertyPath = path ? `${path}.${key}` : key;
      results.push(...findStringInObject(obj[key], searchTerm, propertyPath));
    });
  }

  return results;
}

export const handler: Handler = async (event, _context) => {
  const { httpMethod } = event;

  // Handle OPTIONS request for CORS preflight
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  try {
    console.log('🔍 Starting TGL investigation...');

    // Get estimates from last 24 hours
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    const soldAfter = yesterday.toISOString();

    console.log(`📅 Fetching estimates sold after: ${soldAfter}`);

    const estimates = await getSoldEstimates(soldAfter);
    console.log(`✅ Found ${estimates.length} estimates`);

    const results = {
      totalEstimates: estimates.length,
      soldAfter,
      findings: [] as any[],
      allEstimates: estimates,
    };

    // Search for "Option C" and "System Update" in each estimate
    for (let i = 0; i < estimates.length; i++) {
      const estimate = estimates[i];
      console.log(`\n📊 Analyzing Estimate #${i + 1} (ID: ${estimate.id})`);
      console.log(`   Subtotal: $${estimate.subtotal || 0}`);

      // Search for option-related strings
      const optionCMatches = findStringInObject(estimate, 'Option C');
      const systemUpdateMatches = findStringInObject(estimate, 'System Update');

      if (optionCMatches.length > 0 || systemUpdateMatches.length > 0) {
        console.log(`   ✨ FOUND POTENTIAL TGL!`);
        console.log(`   Option C matches: ${optionCMatches.length}`);
        console.log(`   System Update matches: ${systemUpdateMatches.length}`);

        results.findings.push({
          estimateIndex: i,
          estimateId: estimate.id,
          subtotal: estimate.subtotal,
          soldOn: estimate.soldOn,
          soldBy: estimate.soldBy,
          customerId: estimate.customerId,
          optionCMatches,
          systemUpdateMatches,
          fullEstimateData: estimate,
        });

        // Log matches
        optionCMatches.forEach(match => console.log(`      - ${match}`));
        systemUpdateMatches.forEach(match => console.log(`      - ${match}`));
      } else {
        console.log(`   No TGL indicators found`);
      }
    }

    console.log(`\n📋 Investigation complete. Found ${results.findings.length} potential TGLs.`);

    return createResponse(200, results);
  } catch (error: any) {
    console.error('❌ Error in investigation:', error);
    return createResponse(500, {
      success: false,
      error: error.message || 'Investigation failed',
      stack: error.stack,
    });
  }
};
