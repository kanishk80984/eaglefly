const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' });

const migrate = async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'eagle_fly',
      port: process.env.DB_PORT || 3306,
    });

    console.log('Connected to database. Running KYC migrations...');

    // 1. Add columns to drivers table
    try {
      await connection.execute(`ALTER TABLE drivers ADD COLUMN licence_photo VARCHAR(255)`);
      console.log('Added licence_photo to drivers');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log('licence_photo already exists');
      else throw e;
    }

    try {
      await connection.execute(`ALTER TABLE drivers ADD COLUMN rejection_reason TEXT`);
      console.log('Added rejection_reason to drivers');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log('rejection_reason already exists');
      else throw e;
    }

    // 2. Add columns to vehicles table
    try {
      await connection.execute(`ALTER TABLE vehicles ADD COLUMN rc_photo VARCHAR(255)`);
      console.log('Added rc_photo to vehicles');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log('rc_photo already exists');
      else throw e;
    }

    const views = ['photo_front', 'photo_back', 'photo_left', 'photo_right'];
    for (const view of views) {
      try {
        await connection.execute(`ALTER TABLE vehicles ADD COLUMN ${view} VARCHAR(255)`);
        console.log(`Added ${view} to vehicles`);
      } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') console.log(`${view} already exists`);
        else throw e;
      }
    }

    console.log('KYC Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

migrate();
