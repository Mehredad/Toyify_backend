const express = require('express');
const router = express.Router();
const { getAddressByPostcode } = require('../controllers/addressController');

router.get('/address-lookup', getAddressByPostcode);

module.exports = router;