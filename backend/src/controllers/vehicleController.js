const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHandler');

const getVehicleTypes = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM vehicle_types');
    return successResponse(res, 200, 'Vehicle types retrieved', rows);
  } catch (error) {
    return errorResponse(res, 500, 'Failed to fetch vehicle types');
  }
};

const updateVehicleTypes = async (req, res) => {
  try {
    const { vehicles } = req.body;
    for (const v of vehicles) {
      await pool.execute(
        'UPDATE vehicle_types SET base_fare = ?, per_km_rate = ? WHERE name = ?',
        [v.base_fare, v.per_km_rate, v.name]
      );
    }
    return successResponse(res, 200, 'Vehicle types updated successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to update vehicle types');
  }
};

module.exports = { getVehicleTypes, updateVehicleTypes };
