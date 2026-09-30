const express = require('express');
const { getUserPayments } = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, getUserPayments);

module.exports = router;
