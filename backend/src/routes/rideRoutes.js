const express = require('express');
const { estimateFare, createRide, getUserRides, getDriverRides, getCurrentRide } = require('../controllers/rideController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/estimate', protect, estimateFare);
router.post('/', protect, createRide);
router.get('/', protect, getUserRides);
router.get('/driver', protect, getDriverRides);
router.get('/current', protect, getCurrentRide);

module.exports = router;
