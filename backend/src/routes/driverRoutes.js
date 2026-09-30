const express = require('express');
const { onboardDriver, getDriverStatus, getDriverStats, getDriverWallet, getDriverDetailedEarnings, requestWithdrawal, getDriverWithdrawals, saveBankAccount, getBankAccount, updateProfile, updateParcelStatus, getParcelStatus } = require('../controllers/driverController');
const { protect } = require('../middleware/authMiddleware');
const { upload } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.post(
  '/onboard',
  upload.fields([
    { name: 'licence_photo', maxCount: 1 },
    { name: 'rc_photo', maxCount: 1 },
    { name: 'photo_front', maxCount: 1 },
    { name: 'photo_back', maxCount: 1 },
    { name: 'photo_left', maxCount: 1 },
    { name: 'photo_right', maxCount: 1 }
  ]),
  onboardDriver
);

router.get('/status/:userId', getDriverStatus);
router.get('/stats', protect, getDriverStats);
router.get('/wallet', protect, getDriverWallet);
router.get('/detailed-earnings', protect, getDriverDetailedEarnings);

router.post('/withdraw', protect, requestWithdrawal);
router.get('/withdrawals', protect, getDriverWithdrawals);

router.post('/bank-account', protect, saveBankAccount);
router.get('/bank-account', protect, getBankAccount);

router.put('/profile', protect, upload.single('profile_image'), updateProfile);

router.put('/parcel-status', protect, updateParcelStatus);
router.get('/parcel-status', protect, getParcelStatus);

module.exports = router;
