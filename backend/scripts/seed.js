const { pool } = require('../src/config/db');

const seedData = async () => {
  try {
    console.log('Seeding Vehicle Types...');
    await pool.execute(`
      INSERT IGNORE INTO vehicle_types (id, name, capacity, base_fare, per_km_rate, per_minute_rate) VALUES 
      (1, 'Bike', 1, 20.00, 5.00, 1.00),
      (2, 'Auto', 3, 30.00, 10.00, 2.00),
      (3, 'Car', 4, 50.00, 15.00, 3.00)
    `);

    console.log('Seeding Ride Types...');
    await pool.execute(`
      INSERT IGNORE INTO ride_types (id, name, description) VALUES 
      (1, 'Short Ride', 'Within city limits'),
      (2, 'Long Ride', 'Long distance or outstation')
    `);

    // In a full implementation, pricing rules table would also be seeded here.
    // We'll keep it simple for now based on the prompt.

    console.log('Database seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

seedData();
