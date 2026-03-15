const axios = require('axios');

function normalizePostcode(postcode) {
  return String(postcode || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function formatPostcode(postcode) {
  const cleaned = normalizePostcode(postcode);

  if (cleaned.length <= 3) return cleaned;

  return `${cleaned.slice(0, cleaned.length - 3)} ${cleaned.slice(-3)}`;
}

async function lookupPostcode(postcode) {
  const cleaned = normalizePostcode(postcode);

  try {
    const response = await axios.get(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(cleaned)}`,
      { timeout: 10000 }
    );

    const result = response.data?.result;

    if (!result) {
      const err = new Error('Postcode not found');
      err.statusCode = 404;
      throw err;
    }

    return {
      postcode: result.postcode || formatPostcode(cleaned),
      address: {
        postcode: result.postcode || formatPostcode(cleaned),
        townCity: result.admin_district || result.parish || '',
        county: result.admin_county || '',
        country: result.country || '',
        region: result.region || '',
      },
    };
  } catch (error) {
    if (error.response?.status === 404) {
      const err = new Error('Postcode not found');
      err.statusCode = 404;
      throw err;
    }

    const err = new Error('Failed to validate postcode');
    err.statusCode = error.response?.status || 500;
    throw err;
  }
}

module.exports = {
  lookupPostcode,
};