const { lookupPostcode } = require('../services/addressService');

function normalizePostcode(postcode) {
  return String(postcode || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function isValidUKPostcode(postcode) {
  const cleaned = normalizePostcode(postcode);
  return /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(cleaned);
}

async function getAddressByPostcode(req, res) {
  try {
    const postcode = String(req.query.postcode || '').trim();

    if (!postcode) {
      return res.status(400).json({
        success: false,
        message: 'Postcode is required',
      });
    }

    if (!isValidUKPostcode(postcode)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid UK postcode',
      });
    }

    const result = await lookupPostcode(postcode);

    return res.status(200).json({
      success: true,
      postcode: result.postcode,
      address: result.address,
      manualEntryRequired: true,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Address lookup failed',
      manualEntryRequired: true,
    });
  }
}

module.exports = {
  getAddressByPostcode,
};