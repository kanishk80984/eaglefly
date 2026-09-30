const geoapifyProvider = require('../services/maps/geoapifyProvider');

exports.autocomplete = async (req, res) => {
  try {
    const { text, lat, lon, limit } = req.query;
    if (!text) {
      return res.status(400).json({ success: false, message: 'Text is required for autocomplete' });
    }
    
    const results = await geoapifyProvider.autocomplete(text, lat, lon, limit);
    return res.json({ success: true, results });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch autocomplete results' });
  }
};

exports.reverseGeocode = async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({ success: false, message: 'Latitude and Longitude are required' });
    }

    const location = await geoapifyProvider.reverseGeocode(lat, lon);
    return res.json({ success: true, location });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch reverse geocode' });
  }
};

exports.route = async (req, res) => {
  try {
    const { pickup, drop, mode } = req.body;
    if (!pickup || !drop) {
      return res.status(400).json({ success: false, message: 'Pickup and Drop locations are required' });
    }

    const route = await geoapifyProvider.route(pickup, drop, mode || 'motorcycle');
    return res.json({ success: true, route });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to calculate route' });
  }
};

exports.getPopularLocations = async (req, res) => {
  try {
    const { city } = req.query;
    let query = 'SELECT * FROM popular_locations WHERE is_active = TRUE';
    let params = [];
    
    if (city) {
      query += ' AND city = ?';
      params.push(city);
    }
    
    const { pool } = require('../config/db');
    const [rows] = await pool.query(query, params);
    
    return res.json({ success: true, popularLocations: rows });
  } catch (error) {
    console.error('Error fetching popular locations:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch popular locations' });
  }
};
