const { pool } = require('../src/config/db');

const migrate = async () => {
  try {
    console.log('Starting Parcel Migration...');
    
    // Drivers Table
    try {
      await pool.query('ALTER TABLE drivers ADD COLUMN parcel_orders_enabled BOOLEAN DEFAULT FALSE;');
      console.log('Added parcel_orders_enabled to drivers');
    } catch(e) { console.log('Column parcel_orders_enabled might exist:', e.message); }

    // Rides Table
    try {
      await pool.query('ALTER TABLE rides ADD COLUMN is_parcel BOOLEAN DEFAULT FALSE;');
      console.log('Added is_parcel to rides');
    } catch(e) { console.log('Column is_parcel might exist:', e.message); }
    
    try {
      await pool.query('ALTER TABLE rides ADD COLUMN recipient_name VARCHAR(255);');
      console.log('Added recipient_name to rides');
    } catch(e) { console.log('Column recipient_name might exist:', e.message); }
    
    try {
      await pool.query('ALTER TABLE rides ADD COLUMN recipient_phone VARCHAR(20);');
      console.log('Added recipient_phone to rides');
    } catch(e) { console.log('Column recipient_phone might exist:', e.message); }
    
    try {
      await pool.query('ALTER TABLE rides ADD COLUMN parcel_description TEXT;');
      console.log('Added parcel_description to rides');
    } catch(e) { console.log('Column parcel_description might exist:', e.message); }

    // Vehicle Types
    try {
      await pool.query("INSERT IGNORE INTO vehicle_types (name, capacity, base_fare, per_km_rate, per_minute_rate) VALUES ('PARCEL', 0, 30.00, 10.00, 1.00);");
      console.log('Inserted PARCEL into vehicle_types');
    } catch(e) { console.log('Error inserting PARCEL:', e.message); }

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrate();
