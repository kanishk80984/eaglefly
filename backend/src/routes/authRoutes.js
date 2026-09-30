const express = require('express');
const { requestOtp, verifyOtp, adminLogin } = require('../controllers/authController');

const router = express.Router();

router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.post('/admin-login', adminLogin);

module.exports = router;
