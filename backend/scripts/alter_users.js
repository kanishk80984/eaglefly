const mysql = require('mysql2/promise');
require('dotenv').config();

const alterTable = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 3306,
    database: 'eagle_fly'
  });

  try {
    console.log('Altering users table...');
    await connection.query(`
      ALTER TABLE users 
      ADD COLUMN gender VARCHAR(20),
      ADD COLUMN dob DATE,
      ADD COLUMN emergency_contact VARCHAR(15);
    `);
    console.log('Columns added successfully!');
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('Columns already exist.');
    } else {
      console.error('Migration failed:', error);
    }
  } finally {
    await connection.end();
  }
};

alterTable();
