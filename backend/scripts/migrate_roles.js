const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    console.log("Starting migration...");

    // 1. Create Admins Table
    console.log("Creating admins table...");
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(15) UNIQUE,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        profile_photo VARCHAR(255),
        status ENUM('ACTIVE', 'INACTIVE', 'BLOCKED') DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // 2. Add columns to drivers table
    console.log("Adding columns to drivers table...");
    const colsToAdd = [
      "name VARCHAR(255)",
      "phone VARCHAR(15) UNIQUE",
      "email VARCHAR(255) UNIQUE",
      "password_hash VARCHAR(255)",
      "profile_photo VARCHAR(255)",
      "gender VARCHAR(20)",
      "dob DATE",
      "emergency_contact VARCHAR(15)",
      "status ENUM('ACTIVE', 'INACTIVE', 'BLOCKED') DEFAULT 'ACTIVE'"
    ];

    for (const col of colsToAdd) {
      try {
        await connection.execute(`ALTER TABLE drivers ADD COLUMN ${col}`);
      } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
          throw err;
        }
      }
    }

    // 3. Migrate Admins
    console.log("Migrating admins...");
    const [admins] = await connection.execute("SELECT * FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN')");
    for (const admin of admins) {
      // Check if exists
      const [existing] = await connection.execute("SELECT id FROM admins WHERE email = ?", [admin.email]);
      if (existing.length === 0) {
        await connection.execute(
          "INSERT INTO admins (name, phone, email, password_hash, profile_photo, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [admin.name, admin.phone, admin.email, admin.password_hash, admin.profile_photo, admin.status, admin.created_at, admin.updated_at]
        );
      }
    }

    // 4. Migrate Drivers
    console.log("Migrating drivers...");
    const [drivers] = await connection.execute("SELECT * FROM drivers");
    for (const driver of drivers) {
      if (driver.user_id) {
        // Get user info
        const [users] = await connection.execute("SELECT * FROM users WHERE id = ?", [driver.user_id]);
        if (users.length > 0) {
          const u = users[0];
          await connection.execute(
            "UPDATE drivers SET name=?, phone=?, email=?, password_hash=?, profile_photo=?, gender=?, dob=?, emergency_contact=?, status=? WHERE id=?",
            [u.name, u.phone, u.email, u.password_hash, u.profile_photo, u.gender, u.dob, u.emergency_contact, u.status, driver.id]
          );
        }
      }
    }

    // 5. Drop Foreign Key in drivers table
    console.log("Dropping foreign key user_id from drivers...");
    try {
      const [fks] = await connection.execute(`
        SELECT CONSTRAINT_NAME 
        FROM information_schema.KEY_COLUMN_USAGE 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'drivers' AND REFERENCED_TABLE_NAME = 'users'
      `, [process.env.DB_NAME]);
      
      if (fks.length > 0) {
        for (const fk of fks) {
          await connection.execute(`ALTER TABLE drivers DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
        }
      }
      
      // Also drop index if it exists
      try {
        await connection.execute("ALTER TABLE drivers DROP INDEX user_id");
      } catch (e) { /* ignore if not exists */ }

      // Drop user_id column
      try {
        await connection.execute("ALTER TABLE drivers DROP COLUMN user_id");
      } catch (e) { /* ignore if already dropped */ }
    } catch (err) {
      console.error("Error dropping foreign key:", err.message);
    }

    // 6. Delete Admins and Drivers from users table
    console.log("Cleaning up users table...");
    await connection.execute("DELETE FROM users WHERE role IN ('ADMIN', 'SUPER_ADMIN')");
    // Also delete any users who were migrated to drivers
    for (const driver of drivers) {
        if(driver.user_id) {
            await connection.execute("DELETE FROM users WHERE id = ?", [driver.user_id]);
        }
    }

    // 7. Drop role column from users table
    console.log("Dropping role column from users...");
    try {
      await connection.execute("ALTER TABLE users DROP COLUMN role");
    } catch (e) { /* ignore if already dropped */ }

    console.log("Migration complete!");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}
run();
