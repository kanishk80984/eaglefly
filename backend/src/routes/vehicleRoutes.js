const express = require('express');
const { getVehicleTypes, updateVehicleTypes } = require('../controllers/vehicleController');

const router = express.Router();

router.get('/', getVehicleTypes);
router.put('/', updateVehicleTypes);

module.exports = router;
