const { pool } = require('../config/db');

const getFareEstimate = async (vehicleTypeId, distanceKm, timeMinutes) => {
  const [rows] = await pool.execute('SELECT * FROM vehicle_types WHERE id = ?', [vehicleTypeId]);
  
  if (rows.length === 0) {
    throw new Error('Vehicle type not found');
  }
  
  const vehicle = rows[0];
  
  const baseFare = parseFloat(vehicle.base_fare);
  const billableDistance = Math.max(0, distanceKm - 1);
  const distanceFare = parseFloat(vehicle.per_km_rate) * billableDistance;
  
  const totalFare = baseFare + distanceFare;
  
  return parseFloat(totalFare.toFixed(2));
};

const getVehicleTypes = async () => {
  const [rows] = await pool.execute('SELECT * FROM vehicle_types');
  return rows;
};

module.exports = {
  getFareEstimate,
  getVehicleTypes
};
