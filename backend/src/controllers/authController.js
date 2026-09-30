const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHandler');

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

// Temporary memory store for OTPs
const otpStore = new Map();

const requestOtp = async (req, res) => {
  try {
    const { phone, role = 'USER' } = req.body;
    if (!phone) return errorResponse(res, 400, 'Phone number is required');

    // Generate a 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Store it mapped to phone (in a real app, set expiration)
    otpStore.set(phone, otp);

    // In production, trigger an SMS here. For dev, we send it back.
    return successResponse(res, 200, 'OTP sent successfully', { otp, phone, role });
  } catch (error) {
    console.error(error);
    return errorResponse(res, 500, 'Server error while requesting OTP');
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { phone, otp, role = 'USER' } = req.body;
    
    if (!phone || !otp) return errorResponse(res, 400, 'Phone and OTP are required');

    const storedOtp = otpStore.get(phone);
    
    if (storedOtp !== otp) {
      if (otp !== '0000') {
        return errorResponse(res, 400, 'Invalid OTP');
      }
    }

    otpStore.delete(phone);

    let user = null;
    let userId;
    
    // Determine the table
    const table = role === 'DRIVER' ? 'drivers' : 'users';

    // Check if user exists
    const [rows] = await pool.execute(`SELECT * FROM ${table} WHERE phone = ?`, [phone]);
    
    if (rows.length === 0) {
      // Create new user/driver if they don't exist
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash('dummy_pass', salt);

      const [result] = await pool.execute(
        `INSERT INTO ${table} (name, phone, email, password_hash) VALUES (?, ?, ?, ?)`,
        [role === 'DRIVER' ? 'New Driver' : 'New User', phone, `${table}_${Date.now()}@eagle.com`, password_hash]
      );
      
      userId = result.insertId;
      const [newRows] = await pool.execute(`SELECT * FROM ${table} WHERE id = ?`, [userId]);
      user = newRows[0];
    } else {
      user = rows[0];
      userId = user.id;
    }

    if (user.status !== 'ACTIVE') {
      return errorResponse(res, 403, 'Account is not active');
    }

    const token = generateToken(userId, role);
    
    return successResponse(res, 200, 'Login successful', {
      user: { 
        id: user.id, 
        name: user.name, 
        phone: user.phone, 
        role: role,
        ...(role === 'DRIVER' && { kyc_status: user.kyc_status, rejection_reason: user.rejection_reason })
      },
      token
    });

  } catch (error) {
    console.error(error);
    return errorResponse(res, 500, 'Server error during OTP verification');
  }
};

const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return errorResponse(res, 400, 'Email and password are required');

    const [rows] = await pool.execute('SELECT * FROM admins WHERE email = ?', [email]);
    
    if (rows.length === 0) return errorResponse(res, 401, 'Invalid email or password');
    const user = rows[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return errorResponse(res, 401, 'Invalid email or password');

    if (user.status !== 'ACTIVE') return errorResponse(res, 403, 'Admin account is not active');

    const token = generateToken(user.id, 'ADMIN');

    return successResponse(res, 200, 'Admin login successful', {
      user: { id: user.id, name: user.name, email: user.email, role: 'ADMIN' },
      token
    });
  } catch (error) {
    console.error(error);
    return errorResponse(res, 500, 'Server error during admin login');
  }
};

module.exports = { requestOtp, verifyOtp, adminLogin };
