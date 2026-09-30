const express = require('express');
const { getRideTypes } = require('../controllers/rideTypeController');

const router = express.Router();

router.get('/', getRideTypes);

module.exports = router;
