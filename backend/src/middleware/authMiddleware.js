const jwt = require('jsonwebtoken');
const { errorResponse } = require('../utils/responseHandler');
const { pool } = require('../config/db');

const protect = async (req, res, next) => {
  let token;
  
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      if (token.startsWith('"') && token.endsWith('"')) {
        token = token.slice(1, -1);
      }
      if (token === 'null' || token === 'undefined' || !token) {
        return errorResponse(res, 401, 'Not authorized, token invalid or missing');
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const role = decoded.role || 'USER';
      
      let table = 'users';
      if (role === 'DRIVER') table = 'drivers';
      if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
        table = 'admins';
        // Special case for hardcoded admin token (ID 9999)
        if (decoded.id === 9999) {
          req.user = { id: 9999, role, status: 'ACTIVE', name: 'Admin' };
          return next();
        }
      }
      
      const [rows] = await pool.execute(`SELECT id, status FROM ${table} WHERE id = ?`, [decoded.id]);
      
      if (rows.length === 0) {
        return errorResponse(res, 401, 'Not authorized, user not found');
      }
      
      req.user = rows[0];
      req.user.role = role;
      
      if (req.user.status !== 'ACTIVE') {
        return errorResponse(res, 403, 'User account is not active');
      }
      
      next();
    } catch (error) {
      console.error(error);
      return errorResponse(res, 401, 'Not authorized, token failed');
    }
  }

  if (!token) {
    return errorResponse(res, 401, 'Not authorized, no token');
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return errorResponse(res, 403, `User role ${req.user ? req.user.role : 'unknown'} is not authorized to access this route`);
    }
    next();
  };
};

module.exports = { protect, authorize };
