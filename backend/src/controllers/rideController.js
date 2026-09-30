const { pool } = require('../config/db');
const { getFareEstimate } = require('../models/pricingModel');
const { calculateDistance, calculateETA } = require('../services/mapService');
const { successResponse, errorResponse } = require('../utils/responseHandler');

const estimateFare = async (req, res) => {
  try {
    const { pickup_latitude, pickup_longitude, drop_latitude, drop_longitude, vehicle_type_id, ride_type_id } = req.body;
    
    if (!pickup_latitude || !drop_latitude || !vehicle_type_id) {
      return errorResponse(res, 400, 'Missing required fields for estimation');
    }

    const distance = await calculateDistance(pickup_latitude, pickup_longitude, drop_latitude, drop_longitude);
    const duration = await calculateETA(distance);
    
    const estimatedFare = await getFareEstimate(vehicle_type_id, distance, duration);
    
    return successResponse(res, 200, 'Fare estimated successfully', {
      distance: distance.toFixed(2),
      duration: duration.toFixed(0),
      estimatedFare
    });
  } catch (error) {
    console.error(error);
    return errorResponse(res, 500, 'Estimation failed');
  }
};

const createRide = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      pickup_latitude, pickup_longitude, pickup_address, 
      drop_latitude, drop_longitude, drop_address, 
      vehicle_type_id, ride_type_id, 
      distance, estimated_distance, estimated_duration, estimated_fare 
    } = req.body;

    const distanceKm = distance || estimated_distance || 0;

    const is_parcel = req.body.is_parcel === true;
    const recipient_name = req.body.recipient_name || null;
    const recipient_phone = req.body.recipient_phone || null;
    const parcel_description = req.body.parcel_description || null;

    const [result] = await pool.execute(
      `INSERT INTO rides 
      (user_id, vehicle_type_id, ride_type_id, pickup_lat, pickup_lng, pickup_address, drop_lat, drop_lng, drop_address, distance_km, estimated_fare, status, is_parcel, recipient_name, recipient_phone, parcel_description) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SEARCHING_DRIVER', ?, ?, ?, ?)`,
      [userId, vehicle_type_id, ride_type_id, pickup_latitude, pickup_longitude, pickup_address, drop_latitude, drop_longitude, drop_address, distanceKm, estimated_fare, is_parcel, recipient_name, recipient_phone, parcel_description]
    );

    const newRideId = result.insertId;

    return successResponse(res, 201, 'Ride created successfully', {
      rideId: newRideId,
      status: 'SEARCHING_DRIVER'
    });
  } catch (error) {
    console.error(error);
    return errorResponse(res, 500, 'Failed to create ride');
  }
};

const getUserRides = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rides] = await pool.execute(
      `SELECT r.*, v.name as vehicle_name 
       FROM rides r
       LEFT JOIN vehicle_types v ON r.vehicle_type_id = v.id
       WHERE r.user_id = ? 
       ORDER BY r.created_at DESC`,
      [userId]
    );

    return successResponse(res, 200, 'Rides fetched successfully', rides);
  } catch (error) {
    console.error(error);
    return errorResponse(res, 500, 'Failed to fetch rides');
  }
};
const getDriverRides = async (req, res) => {
  try {
    const userId = req.user.id; // Driver ID comes from protect middleware
    
    // Fetch actual driver ID
    const [driverRows] = await pool.execute('SELECT id FROM drivers WHERE id = ?', [userId]);
    if (driverRows.length === 0) {
      return successResponse(res, 200, 'No rides found', []);
    }
    const driverId = driverRows[0].id;

    const [rides] = await pool.execute(
      `SELECT r.*, v.name as vehicle_name 
       FROM rides r
       LEFT JOIN vehicle_types v ON r.vehicle_type_id = v.id
       WHERE r.driver_id = ? 
       ORDER BY r.created_at DESC`,
      [driverId]
    );

    return successResponse(res, 200, 'Driver rides fetched successfully', rides);
  } catch (error) {
    console.error(error);
    return errorResponse(res, 500, 'Failed to fetch driver rides');
  }
};

const { getActiveRideForDriver, getActiveRideForUser } = require('../sockets/socketManager');

const getCurrentRide = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    
    if (role === 'DRIVER') {
      const activeRide = getActiveRideForDriver(userId);
      if (activeRide) {
        return successResponse(res, 200, 'Active ride retrieved', { activeRide });
      }
    } else {
      const userActiveRide = getActiveRideForUser(userId);
      if (userActiveRide) {
        return successResponse(res, 200, 'Active ride retrieved', { activeRide: userActiveRide });
      }
    }
    
    return successResponse(res, 200, 'No active ride', { activeRide: null });
  } catch (error) {
    console.error(error);
    return errorResponse(res, 500, 'Failed to fetch current active ride');
  }
};

module.exports = { estimateFare, createRide, getUserRides, getDriverRides, getCurrentRide };
