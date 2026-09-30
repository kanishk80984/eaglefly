const { pool } = require('../config/db');

const createUser = async (userData) => {
  const { name, phone, email, password_hash, role } = userData;
  const [result] = await pool.execute(
    'INSERT INTO users (name, phone, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [name, phone, email, password_hash, role || 'USER']
  );
  return result.insertId;
};

const findUserByPhone = async (phone) => {
  const [rows] = await pool.execute('SELECT * FROM users WHERE phone = ?', [phone]);
  return rows[0];
};

const findUserById = async (id) => {
  const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0];
};

const findUserByEmail = async (email) => {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0];
};

module.exports = {
  createUser,
  findUserByPhone,
  findUserById,
  findUserByEmail
};
