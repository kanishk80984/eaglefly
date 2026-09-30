const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHandler');

const getRideTypes = async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM ride_types');
    return successResponse(res, 200, 'Ride types retrieved', rows);
  } catch (error) {
    return errorResponse(res, 500, 'Failed to fetch ride types');
  }
};

module.exports = { getRideTypes };
