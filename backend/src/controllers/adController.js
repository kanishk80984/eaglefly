const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const path = require('path');
const fs = require('fs');

const getActiveAds = async (req, res) => {
  try {
    const [ads] = await pool.execute(
      'SELECT id, title, image_url, duration_seconds, display_order FROM advertisements WHERE is_active = 1 ORDER BY display_order ASC, created_at DESC'
    );
    return successResponse(res, 200, 'Active ads fetched successfully', ads);
  } catch (error) {
    console.error('Error fetching active ads:', error);
    return errorResponse(res, 500, 'Failed to fetch ads');
  }
};

const createAd = async (req, res) => {
  try {
    const { title, duration_seconds, display_order, is_active } = req.body;
    let image_url = '';
    
    if (req.file) {
      const host = `${req.protocol}://${req.get('host')}`;
      image_url = `${host}/uploads/${req.file.filename}`;
    } else {
      return errorResponse(res, 400, 'Image is required');
    }

    const [result] = await pool.execute(
      'INSERT INTO advertisements (title, image_url, duration_seconds, display_order, is_active) VALUES (?, ?, ?, ?, ?)',
      [title, image_url, duration_seconds || 5, display_order || 0, is_active === 'false' ? 0 : 1]
    );

    return successResponse(res, 201, 'Ad created successfully', { id: result.insertId });
  } catch (error) {
    console.error('Error creating ad:', error);
    return errorResponse(res, 500, 'Failed to create ad');
  }
};

const updateAd = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, duration_seconds, display_order, is_active } = req.body;
    
    // Check if ad exists
    const [existing] = await pool.execute('SELECT * FROM advertisements WHERE id = ?', [id]);
    if (existing.length === 0) {
      return errorResponse(res, 404, 'Ad not found');
    }

    let image_url = existing[0].image_url;
    
    if (req.file) {
      // Delete old image if it's local
      if (image_url.includes('/uploads/')) {
        const oldFilename = image_url.split('/').pop();
        const oldFilePath = path.join(__dirname, '../../../uploads', oldFilename);
        if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
      }
      const host = `${req.protocol}://${req.get('host')}`;
      image_url = `${host}/uploads/${req.file.filename}`;
    }

    await pool.execute(
      'UPDATE advertisements SET title = ?, image_url = ?, duration_seconds = ?, display_order = ?, is_active = ? WHERE id = ?',
      [title, image_url, duration_seconds, display_order, is_active === 'false' || is_active === false ? 0 : 1, id]
    );

    return successResponse(res, 200, 'Ad updated successfully');
  } catch (error) {
    console.error('Error updating ad:', error);
    return errorResponse(res, 500, 'Failed to update ad');
  }
};

const deleteAd = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [existing] = await pool.execute('SELECT * FROM advertisements WHERE id = ?', [id]);
    if (existing.length === 0) {
      return errorResponse(res, 404, 'Ad not found');
    }
    
    const image_url = existing[0].image_url;
    if (image_url && image_url.includes('/uploads/')) {
      const oldFilename = image_url.split('/').pop();
      const oldFilePath = path.join(__dirname, '../../../uploads', oldFilename);
      if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
    }

    await pool.execute('DELETE FROM advertisements WHERE id = ?', [id]);
    return successResponse(res, 200, 'Ad deleted successfully');
  } catch (error) {
    console.error('Error deleting ad:', error);
    return errorResponse(res, 500, 'Failed to delete ad');
  }
};

const getAdminAds = async (req, res) => {
  try {
    const [ads] = await pool.execute('SELECT * FROM advertisements ORDER BY display_order ASC, created_at DESC');
    return successResponse(res, 200, 'Admin ads fetched successfully', ads);
  } catch (error) {
    console.error('Error fetching admin ads:', error);
    return errorResponse(res, 500, 'Failed to fetch admin ads');
  }
};

module.exports = { getActiveAds, createAd, updateAd, deleteAd, getAdminAds };
