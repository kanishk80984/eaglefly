const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' });

const createAdmin = async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'eagle_fly',
      port: process.env.DB_PORT || 3306,
    });

    console.log('Connected to database.');

    const email = 'admin@gmail.com';
    const password = 'admin123';
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Check if admin already exists
    const [rows] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      console.log('Admin user already exists. Updating password and role...');
      await connection.execute(
        'UPDATE users SET password_hash = ?, role = "ADMIN" WHERE email = ?',
        [password_hash, email]
      );
      console.log('Admin user updated successfully.');
    } else {
      console.log('Creating new admin user...');
      // Note: phone is marked as UNIQUE NOT NULL in the schema, we must provide a dummy one
      await connection.execute(
        'INSERT INTO users (name, phone, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        ['Admin User', '0000000000', email, password_hash, 'ADMIN']
      );
      console.log('Admin user created successfully.');
    }

  } catch (error) {
    console.error('Failed to create/update admin user:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

createAdmin();
