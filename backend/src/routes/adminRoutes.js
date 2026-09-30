const express = require('express');
const router = express.Router();
const { upload } = require('../middleware/uploadMiddleware');
const { 
  adminLogin, getDashboardStats, getAllUsers, getAllDrivers, 
  getDriverDetails, approveDriver, rejectDriver, createDriverByAdmin,
  getPopularLocationsAdmin, addPopularLocation, deletePopularLocation,
  updatePopularLocation, getCities, getAllWithdrawals, updateWithdrawalStatus
} = require('../controllers/adminController');
const { getAdminAds, createAd, updateAd, deleteAd } = require('../controllers/adController');

router.post('/login', adminLogin);
router.get('/stats', getDashboardStats);
router.get('/users', getAllUsers);
router.get('/drivers', getAllDrivers);
router.get('/driver/:id', getDriverDetails);
router.post('/driver/:id/approve', approveDriver);
router.post('/driver/:id/reject', rejectDriver);

router.post(
  '/driver/create',
  upload.fields([
    { name: 'licence_photo', maxCount: 1 },
    { name: 'rc_photo', maxCount: 1 },
    { name: 'photo_front', maxCount: 1 },
    { name: 'photo_back', maxCount: 1 },
    { name: 'photo_left', maxCount: 1 },
    { name: 'photo_right', maxCount: 1 }
  ]),
  createDriverByAdmin
);

router.get('/popular-locations', getPopularLocationsAdmin);
router.post('/popular-locations', upload.single('image'), addPopularLocation);
router.put('/popular-locations/:id', upload.single('image'), updatePopularLocation);
router.delete('/popular-locations/:id', deletePopularLocation);
router.get('/cities', getCities);

router.get('/withdrawals', getAllWithdrawals);
router.put('/withdrawals/:id', updateWithdrawalStatus);

router.get('/ads', getAdminAds);
router.post('/ads', upload.single('image'), createAd);
router.put('/ads/:id', upload.single('image'), updateAd);
router.delete('/ads/:id', deleteAd);

module.exports = router;
