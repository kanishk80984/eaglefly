const express = require('express');
const { getActiveAds } = require('../controllers/adController');
const router = express.Router();

// Public route for user app to get active ads
router.get('/active', getActiveAds);

module.exports = router;
