const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const migrate = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    port: process.env.DB_PORT || 3306,
    multipleStatements: true,
  });

  try {
    const schemaPath = path.join(__dirname, '../migrations/schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('Running database migrations...');
    await connection.query(sql);
    console.log('Migrations executed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await connection.end();
  }
};

migrate();
