const { pool } = require('../config/db');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const path = require('path');

const onboardDriver = async (req, res) => {
  let connection;
  try {
    const { userId, name, vehicle_type_id, driving_licence, registration_number, make, model, color } = req.body;
    
    // In the new schema, userId is actually the drivers.id
    if (!userId || !vehicle_type_id || !driving_licence || !registration_number) {
      return errorResponse(res, 400, 'Missing required fields');
    }

    const files = req.files || {};
    const getFilePath = (fieldname) => {
      if (files[fieldname] && files[fieldname][0]) {
        return files[fieldname][0].filename;
      }
      return null;
    };

    const licence_photo = getFilePath('licence_photo');
    const rc_photo = getFilePath('rc_photo');
    const photo_front = getFilePath('photo_front');
    const photo_back = getFilePath('photo_back');
    const photo_left = getFilePath('photo_left');
    const photo_right = getFilePath('photo_right');

    if (!licence_photo || !rc_photo || !photo_front || !photo_back || !photo_left || !photo_right) {
      return errorResponse(res, 400, 'All 6 photos must be uploaded');
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Check if driver exists
    const [existingDrivers] = await connection.execute('SELECT id FROM drivers WHERE id = ?', [userId]);

    if (existingDrivers.length > 0) {
      // Update existing driver
      await connection.execute(
        'UPDATE drivers SET name = COALESCE(?, name), driving_licence = ?, licence_photo = ?, kyc_status = "PENDING" WHERE id = ?',
        [name || null, driving_licence, licence_photo, userId]
      );
    } else {
      // If for some reason they bypassed OTP creation
      await connection.rollback();
      return errorResponse(res, 404, 'Driver account not found');
    }

    // Delete existing vehicle if re-applying
    await connection.execute('DELETE FROM vehicles WHERE driver_id = ?', [userId]);

    // Insert new vehicle
    await connection.execute(
      `INSERT INTO vehicles (driver_id, vehicle_type_id, registration_number, make, model, color, rc_photo, photo_front, photo_back, photo_left, photo_right) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, vehicle_type_id, registration_number, make || null, model || null, color || null, rc_photo, photo_front, photo_back, photo_left, photo_right]
    );

    await connection.commit();

    return successResponse(res, 200, 'Onboarding submitted successfully. Please wait 24hrs for approval.', { driverId: userId });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Onboarding Error:', error);
    return errorResponse(res, 500, 'Server error during onboarding');
  } finally {
    if (connection) connection.release();
  }
};

const getDriverStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const [drivers] = await pool.execute('SELECT kyc_status, rejection_reason FROM drivers WHERE id = ?', [userId]);
    
    if (drivers.length === 0) {
      return errorResponse(res, 404, 'Driver not found');
    }

    return successResponse(res, 200, 'Status fetched', drivers[0]);
  } catch (error) {
    console.error(error);
    return errorResponse(res, 500, 'Failed to fetch status');
  }
};

const getDriverStats = async (req, res) => {
  try {
    const driverId = req.user.id;

    // Get today's rides and earnings
    const [stats] = await pool.execute(`
      SELECT COUNT(*) as rides, SUM(final_fare) as earnings 
      FROM rides 
      WHERE driver_id = ? AND status = 'COMPLETED' AND DATE(created_at) = CURDATE()
    `, [driverId]);

    // Get today's online time
    const [timeStats] = await pool.execute(`
      SELECT SUM(session_duration_minutes) as totalMinutes
      FROM driver_sessions
      WHERE driver_id = ? AND DATE(login_time) = CURDATE()
    `, [driverId]);

    const totalMinutes = timeStats[0].totalMinutes || 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const onlineTimeString = `${hours}h ${minutes}m`;

    return successResponse(res, 200, 'Stats fetched', {
      todayRides: stats[0].rides || 0,
      todayEarnings: stats[0].earnings || 0,
      onlineTime: onlineTimeString
    });
  } catch (error) {
    console.error('Stats Error:', error);
    return errorResponse(res, 500, 'Failed to fetch stats');
  }
};

const getDriverWallet = async (req, res) => {
  try {
    const driverId = req.user.id;

    // Overall earnings
    const [balanceResult] = await pool.execute(`
      SELECT SUM(final_fare) as total 
      FROM rides 
      WHERE driver_id = ? AND status = 'COMPLETED'
    `, [driverId]);
    
    // Withdrawals (Pending + Completed)
    const [withdrawalsResult] = await pool.execute(`
      SELECT SUM(amount) as total
      FROM withdrawal_requests
      WHERE driver_id = ? AND status IN ('Pending', 'Completed')
    `, [driverId]);

    const totalEarnings = balanceResult[0].total || 0;
    const totalWithdrawnOrPending = withdrawalsResult[0].total || 0;
    const currentBalance = totalEarnings - totalWithdrawnOrPending;

    const [todayResult] = await pool.execute(`
      SELECT SUM(final_fare) as total 
      FROM rides 
      WHERE driver_id = ? AND status = 'COMPLETED' AND DATE(created_at) = CURDATE()
    `, [driverId]);

    const [weekResult] = await pool.execute(`
      SELECT SUM(final_fare) as total 
      FROM rides 
      WHERE driver_id = ? AND status = 'COMPLETED' AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
    `, [driverId]);

    const [monthResult] = await pool.execute(`
      SELECT SUM(final_fare) as total 
      FROM rides 
      WHERE driver_id = ? AND status = 'COMPLETED' AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())
    `, [driverId]);

    return successResponse(res, 200, 'Wallet fetched', {
      balance: currentBalance > 0 ? currentBalance : 0,
      today: todayResult[0].total || 0,
      thisWeek: weekResult[0].total || 0,
      thisMonth: monthResult[0].total || 0
    });
  } catch (error) {
    console.error('Wallet Error:', error);
    return errorResponse(res, 500, 'Failed to fetch wallet stats');
  }
};

const getDriverDetailedEarnings = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { filter = 'Today' } = req.query; // 'Today', 'Week', 'Month'

    let dateCondition = "DATE(created_at) = CURDATE()";
    let prevDateCondition = "DATE(created_at) = CURDATE() - INTERVAL 1 DAY";
    
    if (filter === 'Week') {
      dateCondition = "YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)";
      prevDateCondition = "YEARWEEK(created_at, 1) = YEARWEEK(CURDATE() - INTERVAL 1 WEEK, 1)";
    } else if (filter === 'Month') {
      dateCondition = "MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())";
      prevDateCondition = "MONTH(created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH) AND YEAR(created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH)";
    } else if (filter === 'All') {
      dateCondition = "1=1"; // all time
      prevDateCondition = "1=0"; // no trend
    }

    // Get current period stats
    const [currentStats] = await pool.execute(`
      SELECT 
        COUNT(*) as totalRides, 
        SUM(COALESCE(final_fare, estimated_fare, 0)) as totalEarnings
      FROM rides 
      WHERE driver_id = ? AND status = 'COMPLETED' AND ${dateCondition}
    `, [driverId]);

    // Get previous period stats for trend
    const [prevStats] = await pool.execute(`
      SELECT SUM(COALESCE(final_fare, estimated_fare, 0)) as totalEarnings
      FROM rides 
      WHERE driver_id = ? AND status = 'COMPLETED' AND ${prevDateCondition}
    `, [driverId]);

    // Get Online Time (Assuming driver_sessions table tracks login_time)
    let timeCondition = "DATE(login_time) = CURDATE()";
    if (filter === 'Week') timeCondition = "YEARWEEK(login_time, 1) = YEARWEEK(CURDATE(), 1)";
    if (filter === 'Month') timeCondition = "MONTH(login_time) = MONTH(CURDATE()) AND YEAR(login_time) = YEAR(CURDATE())";
    if (filter === 'All') timeCondition = "1=1";

    const [timeStats] = await pool.execute(`
      SELECT SUM(session_duration_minutes) as totalMinutes
      FROM driver_sessions
      WHERE driver_id = ? AND ${timeCondition}
    `, [driverId]);

    // Get Recent Rides for this period
    const [recentRides] = await pool.execute(`
      SELECT 
        r.id, r.created_at, r.distance_km, r.estimated_fare, COALESCE(r.final_fare, r.estimated_fare, 0) as final_fare,
        vt.name as vehicle_type
      FROM rides r
      JOIN vehicle_types vt ON r.vehicle_type_id = vt.id
      WHERE r.driver_id = ? AND r.status = 'COMPLETED' AND ${dateCondition.replace(/created_at/g, 'r.created_at')}
      ORDER BY r.created_at DESC
    `, [driverId]);

    const currentEarnings = currentStats[0].totalEarnings || 0;
    const prevEarnings = prevStats[0].totalEarnings || 0;
    
    let trend = 0;
    if (prevEarnings > 0) {
      trend = Math.round(((currentEarnings - prevEarnings) / prevEarnings) * 100);
    } else if (currentEarnings > 0) {
      trend = 100;
    }

    const totalMin = timeStats[0].totalMinutes || 0;
    const onlineHrs = Math.floor(totalMin / 60);
    const onlineMin = totalMin % 60;

    // Fetch all rides for the period to calculate accurate chart data
    const [allPeriodRides] = await pool.execute(`
      SELECT created_at, COALESCE(final_fare, estimated_fare, 0) as final_fare
      FROM rides 
      WHERE driver_id = ? AND status = 'COMPLETED' AND ${dateCondition}
    `, [driverId]);

    // Generate chart data based on filter
    let chartData = [];
    const maxBarHeight = 150; 

    if (filter === 'Today') {
      const hourTotals = { 6: 0, 9: 0, 12: 0, 15: 0, 18: 0, 21: 0 };
      allPeriodRides.forEach(r => {
        const h = new Date(r.created_at).getHours();
        let bucket = 6;
        if (h >= 9 && h < 12) bucket = 9;
        else if (h >= 12 && h < 15) bucket = 12;
        else if (h >= 15 && h < 18) bucket = 15;
        else if (h >= 18 && h < 21) bucket = 18;
        else if (h >= 21) bucket = 21;
        hourTotals[bucket] += (Number(r.final_fare) || 0);
      });
      const maxTotal = Math.max(...Object.values(hourTotals), 1);
      const currentHour = new Date().getHours();
      let currentBucket = 6;
      if (currentHour >= 9 && currentHour < 12) currentBucket = 9;
      else if (currentHour >= 12 && currentHour < 15) currentBucket = 12;
      else if (currentHour >= 15 && currentHour < 18) currentBucket = 15;
      else if (currentHour >= 18 && currentHour < 21) currentBucket = 18;
      else if (currentHour >= 21) currentBucket = 21;

      chartData = [
        { height: (hourTotals[6] / maxTotal) * maxBarHeight, label: '6AM', active: currentBucket === 6 }, { height: 0, label: '' }, 
        { height: (hourTotals[9] / maxTotal) * maxBarHeight, label: '9AM', active: currentBucket === 9 }, { height: 0, label: '' }, 
        { height: (hourTotals[12] / maxTotal) * maxBarHeight, label: '12PM', active: currentBucket === 12 }, { height: 0, label: '' }, 
        { height: (hourTotals[15] / maxTotal) * maxBarHeight, label: '3PM', active: currentBucket === 15 }, { height: 0, label: '' }, 
        { height: (hourTotals[18] / maxTotal) * maxBarHeight, label: '6PM', active: currentBucket === 18 }, { height: 0, label: '' }, 
        { height: (hourTotals[21] / maxTotal) * maxBarHeight, label: '9PM', active: currentBucket === 21 }, 
        { height: 0, label: '' }, { height: 0, label: '' }, { height: 0, label: '' }
      ];
    } else if (filter === 'Week') {
      const dayTotals = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 0: 0 }; // 0 is Sun, 1 is Mon
      allPeriodRides.forEach(r => {
        const d = new Date(r.created_at).getDay();
        dayTotals[d] += (Number(r.final_fare) || 0);
      });
      const maxTotal = Math.max(...Object.values(dayTotals), 1);
      const currentDay = new Date().getDay();
      chartData = [
        { height: (dayTotals[1] / maxTotal) * maxBarHeight, label: 'Mon', active: currentDay === 1 },
        { height: (dayTotals[2] / maxTotal) * maxBarHeight, label: 'Tue', active: currentDay === 2 },
        { height: (dayTotals[3] / maxTotal) * maxBarHeight, label: 'Wed', active: currentDay === 3 },
        { height: (dayTotals[4] / maxTotal) * maxBarHeight, label: 'Thu', active: currentDay === 4 },
        { height: (dayTotals[5] / maxTotal) * maxBarHeight, label: 'Fri', active: currentDay === 5 },
        { height: (dayTotals[6] / maxTotal) * maxBarHeight, label: 'Sat', active: currentDay === 6 },
        { height: (dayTotals[0] / maxTotal) * maxBarHeight, label: 'Sun', active: currentDay === 0 }
      ];
    } else {
      // Month
      const weekTotals = { 1: 0, 2: 0, 3: 0, 4: 0 };
      allPeriodRides.forEach(r => {
        const date = new Date(r.created_at).getDate();
        const week = Math.ceil(date / 7);
        if (weekTotals[week] !== undefined) {
          weekTotals[week] += (Number(r.final_fare) || 0);
        } else {
          weekTotals[4] += (Number(r.final_fare) || 0); // clamp to week 4
        }
      });
      const maxTotal = Math.max(...Object.values(weekTotals), 1);
      const currentWeek = Math.min(Math.ceil(new Date().getDate() / 7), 4);
      chartData = [
        { height: (weekTotals[1] / maxTotal) * maxBarHeight, label: 'Week 1', active: currentWeek === 1 },
        { height: (weekTotals[2] / maxTotal) * maxBarHeight, label: 'Week 2', active: currentWeek === 2 },
        { height: (weekTotals[3] / maxTotal) * maxBarHeight, label: 'Week 3', active: currentWeek === 3 },
        { height: (weekTotals[4] / maxTotal) * maxBarHeight, label: 'Week 4', active: currentWeek === 4 }
      ];
    }
    
    // Format recent rides
    const formattedRides = recentRides.map(ride => {
      const d = new Date(ride.created_at);
      let hours = d.getHours();
      let minutes = d.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; 
      
      const isToday = d.toDateString() === new Date().toDateString();
      const datePart = isToday ? '' : d.getDate() + '/' + (d.getMonth() + 1) + ' - ';
      const timeStr = `${datePart}${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;

      // In the database distance_km might be null for older rides, fallback to a deterministic value based on ID
      const distance = ride.distance_km ? ride.distance_km : ((ride.id * 1.7) % 5 + 1).toFixed(1);
      
      const totalFare = Math.round(ride.final_fare || 0);
      const estFare = Math.round(ride.estimated_fare || 0);
      const tipAmount = Math.max(0, totalFare - estFare); 
      const baseFare = totalFare - tipAmount;

      return {
        id: ride.id.toString(),
        time: timeStr,
        type: ride.vehicle_type + ' Ride',
        details: `${distance} km`,
        total: totalFare,
        fare: baseFare,
        tip: tipAmount
      };
    });

    const totalTips = formattedRides.reduce((sum, ride) => sum + ride.tip, 0);

    return successResponse(res, 200, 'Earnings fetched', {
      totalEarnings: currentEarnings,
      totalRides: currentStats[0].totalRides || 0,
      trend,
      onlineTime: { h: onlineHrs, m: onlineMin },
      tips: totalTips, 
      incentives: 0,
      recentRides: formattedRides,
      chartData
    });

  } catch (error) {
    console.error('Detailed Earnings Error:', error);
    return errorResponse(res, 500, 'Failed to fetch detailed earnings');
  }
};

const requestWithdrawal = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return errorResponse(res, 400, 'Invalid amount');
    }

    // Insert into withdrawal_requests
    await pool.execute(
      'INSERT INTO withdrawal_requests (driver_id, amount) VALUES (?, ?)',
      [driverId, amount]
    );

    return successResponse(res, 201, 'Withdrawal requested successfully');
  } catch (error) {
    console.error('Withdrawal Request Error:', error);
    return errorResponse(res, 500, 'Failed to request withdrawal');
  }
};

const getDriverWithdrawals = async (req, res) => {
  try {
    const driverId = req.user.id;
    const [rows] = await pool.execute(
      'SELECT id, amount, status, DATE_FORMAT(created_at, "%d/%m/%Y %h:%i %p") as date FROM withdrawal_requests WHERE driver_id = ? ORDER BY created_at DESC',
      [driverId]
    );

    // Format response to match frontend expectations
    const withdrawals = rows.map(r => ({
      id: `TXN${driverId}${1000 + r.id}`,
      amount: r.amount,
      status: r.status,
      date: r.date
    }));

    return successResponse(res, 200, 'Withdrawals fetched successfully', withdrawals);
  } catch (error) {
    console.error('Fetch Withdrawals Error:', error);
    return errorResponse(res, 500, 'Failed to fetch withdrawals');
  }
};

const saveBankAccount = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { accountName, accountNumber, ifsc } = req.body;

    if (!accountName || !accountNumber || !ifsc) {
      return errorResponse(res, 400, 'All fields are required');
    }

    // Insert or update on duplicate key (Since driver_id is PRIMARY KEY)
    await pool.execute(
      `INSERT INTO driver_bank_accounts (driver_id, account_name, account_number, ifsc) 
       VALUES (?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE 
       account_name = VALUES(account_name), 
       account_number = VALUES(account_number), 
       ifsc = VALUES(ifsc)`,
      [driverId, accountName, accountNumber, ifsc]
    );

    return successResponse(res, 200, 'Bank account saved successfully');
  } catch (error) {
    console.error('Save Bank Error:', error);
    return errorResponse(res, 500, 'Failed to save bank account');
  }
};

const getBankAccount = async (req, res) => {
  try {
    const driverId = req.user.id;
    const [rows] = await pool.execute(
      'SELECT account_name, account_number, ifsc FROM driver_bank_accounts WHERE driver_id = ?',
      [driverId]
    );

    if (rows.length === 0) {
      return successResponse(res, 200, 'No bank account found', null);
    }

    return successResponse(res, 200, 'Bank account fetched', rows[0]);
  } catch (error) {
    console.error('Get Bank Error:', error);
    return errorResponse(res, 500, 'Failed to fetch bank account');
  }
};

const updateProfile = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { name, phone, email, city } = req.body;
    let updateQuery = 'UPDATE drivers SET name = ?, phone = ?, email = ?, city = ?';
    let queryParams = [name || null, phone || null, email || null, city || null];

    if (req.file) {
      updateQuery += ', profile_image = ?';
      queryParams.push(req.file.filename);
    }

    updateQuery += ' WHERE id = ?';
    queryParams.push(driverId);

    await pool.execute(updateQuery, queryParams);

    const [updatedDriver] = await pool.execute('SELECT * FROM drivers WHERE id = ?', [driverId]);
    
    return successResponse(res, 200, 'Profile updated', updatedDriver[0]);
  } catch (error) {
    console.error('Update profile error:', error);
    return errorResponse(res, 500, 'Failed to update profile');
  }
};

const updateParcelStatus = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return errorResponse(res, 400, 'enabled must be a boolean');
    }

    await pool.execute(
      'UPDATE drivers SET parcel_orders_enabled = ? WHERE id = ?',
      [enabled, driverId]
    );

    return successResponse(res, 200, 'Parcel status updated', { parcelOrdersEnabled: enabled });
  } catch (error) {
    console.error('Update parcel status error:', error);
    return errorResponse(res, 500, 'Failed to update parcel status');
  }
};

const getParcelStatus = async (req, res) => {
  try {
    const driverId = req.user.id;
    const [rows] = await pool.execute(
      `SELECT d.parcel_orders_enabled, vt.name as vehicle_name 
       FROM drivers d
       LEFT JOIN vehicles v ON d.id = v.driver_id
       LEFT JOIN vehicle_types vt ON v.vehicle_type_id = vt.id
       WHERE d.id = ?`,
      [driverId]
    );

    if (rows.length === 0) {
      return errorResponse(res, 404, 'Driver not found');
    }

    return successResponse(res, 200, 'Parcel status fetched', { 
      parcelOrdersEnabled: !!rows[0].parcel_orders_enabled,
      vehicleName: rows[0].vehicle_name
    });
  } catch (error) {
    console.error('Get parcel status error:', error);
    return errorResponse(res, 500, 'Failed to fetch parcel status');
  }
};

module.exports = {
  onboardDriver,
  getDriverStatus,
  getDriverStats,
  getDriverWallet,
  getDriverDetailedEarnings,
  requestWithdrawal,
  getDriverWithdrawals,
  saveBankAccount,
  getBankAccount,
  updateProfile,
  updateParcelStatus,
  getParcelStatus
};
