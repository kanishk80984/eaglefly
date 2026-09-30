const express = require('express');
const router = express.Router();
const mapsController = require('../controllers/mapsController');

// All map routes should probably require authentication in a real app,
// but we'll leave them open or apply the existing protect middleware if we have one.

router.get('/autocomplete', mapsController.autocomplete);
router.get('/reverse-geocode', mapsController.reverseGeocode);
router.post('/route', mapsController.route);
router.get('/popular-locations', mapsController.getPopularLocations);

module.exports = router;