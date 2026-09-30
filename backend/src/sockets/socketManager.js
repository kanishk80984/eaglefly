const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

let io;

// In-memory registries
const activeDrivers = new Map(); // driverId -> { socketId, latitude, longitude, isAvailable }
const pendingRides = new Map(); // rideId -> { userId, status, timeout }

// Utility to calculate distance (Haversine formula in km)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const initSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.use((socket, next) => {
    if (socket.handshake.query && socket.handshake.query.token){
      jwt.verify(socket.handshake.query.token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Authentication error'));
        socket.decoded = decoded; // Contains id and possibly role
        next();
      });
    }
    else {
      next(new Error('Authentication error'));
    }
  }).on('connection', (socket) => {
    const userId = socket.decoded.id;
    const userRole = socket.decoded.role || 'USER';
    console.log(`User connected: ${userId} (${userRole})`);
    
    socket.join(`user_${userId}`);

    // Track Driver Sessions
    let sessionId = null;

    if (userRole === 'DRIVER') {
      pool.execute('INSERT INTO driver_sessions (driver_id) VALUES (?)', [userId]).then(([result]) => {
        sessionId = result.insertId;
        console.log(`Started session ${sessionId} for driver ${userId}`);
      }).catch(err => console.error('Error starting driver session:', err));

      pool.execute('SELECT d.parcel_orders_enabled, v.vehicle_type_id FROM drivers d LEFT JOIN vehicles v ON d.id = v.driver_id WHERE d.id = ? LIMIT 1', [userId])
        .then(([rows]) => {
          if (rows.length > 0) {
            socket.driverMeta = {
              parcel_orders_enabled: !!rows[0].parcel_orders_enabled,
              vehicle_type_id: rows[0].vehicle_type_id
            };
          }
        }).catch(err => console.error('Error fetching driver meta:', err));
    }

    // Automatically re-join active ride rooms on reconnect
    for (const [rideId, rideState] of pendingRides.entries()) {
      if (userRole === 'USER' && rideState.userId === userId) {
        socket.join(rideId);
        console.log(`User ${userId} automatically rejoined room ${rideId}`);
      } else if (userRole === 'DRIVER' && rideState.driverId === userId) {
        socket.join(rideId);
        console.log(`Driver ${userId} automatically rejoined room ${rideId}`);
      }
    }

    // --- DRIVER LOCATION TRACKING ---
    socket.on('driver:location', (data) => {
      // Validate GPS data
      if (
        typeof data.latitude !== 'number' || typeof data.longitude !== 'number' ||
        data.latitude < -90 || data.latitude > 90 ||
        data.longitude < -180 || data.longitude > 180
      ) {
        console.warn(`Invalid location data from driver ${userId}`);
        return;
      }

      // Verify if driver is currently assigned to an active ride
      let assignedRideId = null;
      for (const [rideId, rideState] of pendingRides.entries()) {
        if (rideState.driverId === userId && (rideState.status === 'ACCEPTED' || rideState.status === 'STARTED')) {
          assignedRideId = rideId;
          break;
        }
      }

      // Save/update driver location in memory
      activeDrivers.set(userId, {
        socketId: socket.id,
        latitude: data.latitude,
        longitude: data.longitude,
        heading: data.heading || 0,
        speed: data.speed || 0,
        rideId: assignedRideId,
        timestamp: Date.now(),
        isAvailable: assignedRideId === null,
        parcel_orders_enabled: socket.driverMeta ? socket.driverMeta.parcel_orders_enabled : false,
        vehicle_type_id: socket.driverMeta ? socket.driverMeta.vehicle_type_id : null
      });
      
      if (assignedRideId) {
        // Securely emit ONLY to the correct ride room
        io.to(assignedRideId).emit('driver:location_update', { 
          driverId: userId, 
          latitude: data.latitude,
          longitude: data.longitude,
          heading: data.heading || 0,
          speed: data.speed || 0,
          timestamp: Date.now()
        });
      }
    });
    
    // --- USER REQUESTS A RIDE ---
    socket.on('ride:request', (data) => {
      console.log('Ride requested by user:', userId, data);
      
      const rideId = `ride_${Date.now()}_${userId}`;
      const { pickup, drop, vehicle_type_id, estimated_fare } = data;
      
      // Customer securely joins the specific ride room
      socket.join(rideId);
      console.log(`User ${userId} joined room ${rideId}`);

      const isParcel = Boolean(data.isParcel);

      pendingRides.set(rideId, { 
        userId, 
        status: 'SEARCHING', 
        pickup, 
        drop, 
        vehicle_type_id, 
        estimated_fare, 
        isParcel,
        recipient_name: data.recipient_name || null,
        recipient_phone: data.recipient_phone || null,
        parcel_description: data.parcel_description || null,
        ...data 
      });

      // Helper to find drivers in a specific distance ring
      const findDriversInRange = (minKm, maxKm) => {
        const matchingDrivers = [];
        for (const [dId, driverObj] of activeDrivers.entries()) {
          if (!driverObj.isAvailable) continue;
          
          if (isParcel) {
            if (!driverObj.parcel_orders_enabled) {
              console.log(`Driver ${dId} rejected for parcel order (parcel_orders_enabled = false)`);
              continue;
            }
          } else {
            if (driverObj.vehicle_type_id != vehicle_type_id) {
              continue;
            }
          }

          const dist = calculateDistance(pickup.latitude, pickup.longitude, driverObj.latitude, driverObj.longitude);
          if (dist >= minKm && dist <= maxKm) {
            matchingDrivers.push({ id: dId, socketId: driverObj.socketId, distance: dist });
          }
        }
        return matchingDrivers;
      };

      // Phase 1: 0 - 2 km
      let drivers = findDriversInRange(0, 2);
      console.log(`Phase 1: Found ${drivers.length} drivers within 2km.`);
      
      if (drivers.length > 0) {
        drivers.forEach(d => {
          const payload = { rideId, isParcel, pickup, drop, estimated_fare };
          if (isParcel) {
            payload.parcel_description = data.parcel_description;
            payload.recipient_name = data.recipient_name;
            // Deliberately NOT sending recipient_phone at this stage for security
          }
          io.to(d.socketId).emit('ride:new_request', payload);
        });
      }
      
      // Wait 15s to see if anyone accepts
      setTimeout(() => {
        const rideState = pendingRides.get(rideId);
        if (rideState && rideState.status === 'SEARCHING') {
          // No one accepted in Phase 1. Expand to 2 - 4 km
          console.log(`Phase 1 Timeout. Expanding search to 2 - 4 km for ride ${rideId}`);
          
          let expandedDrivers = findDriversInRange(2, 4);
          console.log(`Phase 2: Found ${expandedDrivers.length} drivers between 2km and 4km.`);
          
          if (expandedDrivers.length > 0) {
             expandedDrivers.forEach(d => {
                const payload = { rideId, isParcel, pickup, drop, estimated_fare };
                if (isParcel) {
                  payload.parcel_description = data.parcel_description;
                  payload.recipient_name = data.recipient_name;
                }
                io.to(d.socketId).emit('ride:new_request', payload);
             });
          }

          // Wait another 15s for Phase 2
          setTimeout(() => {
            const finalRideState = pendingRides.get(rideId);
            if (finalRideState && finalRideState.status === 'SEARCHING') {
              // Complete failure. No one accepted.
              console.log(`Ride ${rideId} failed. No drivers accepted or available.`);
              io.to(`user_${userId}`).emit('ride:failed', { message: 'Riders not accepted or drivers not available' });
              pendingRides.delete(rideId);
            }
          }, 15000);
        }
      }, 15000);
    });

    // --- DRIVER ACCEPTS A RIDE ---
    socket.on('ride:accept', async (data) => {
      const { rideId } = data;
      const rideState = pendingRides.get(rideId);
      
      if (rideState && rideState.status === 'SEARCHING') {
        // Generate a 4-digit OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        
        // Driver won the ride!
        rideState.status = 'ACCEPTED';
        rideState.driverId = userId;
        rideState.otp = otp;
        
        // Driver securely joins the specific ride room
        socket.join(rideId);
        console.log(`Driver ${userId} joined room ${rideId} and accepted ride ${rideId} with OTP ${otp}`);
        
        // Fetch driver details
        const [driverRows] = await pool.query('SELECT name, phone, profile_photo FROM drivers WHERE id = ?', [userId]);
        const [vehicleRows] = await pool.query('SELECT v.registration_number, v.make, v.model, v.color, vt.name as category FROM vehicles v JOIN vehicle_types vt ON v.vehicle_type_id = vt.id WHERE v.driver_id = ?', [userId]);
        
        const driverData = {
          name: driverRows[0]?.name || 'Driver Assigned',
          phone: driverRows[0]?.phone || '',
          photo: driverRows[0]?.profile_photo || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
          vehicleName: vehicleRows[0]?.category || 'Vehicle',
          registrationNumber: vehicleRows[0]?.registration_number || '',
          make: vehicleRows[0]?.make || '',
          model: vehicleRows[0]?.model || '',
          color: vehicleRows[0]?.color || ''
        };
        
        rideState.driver = driverData;

        // Notify the User that a driver accepted and send the OTP
        io.to(`user_${rideState.userId}`).emit('ride:accepted', { 
          rideId, 
          driverId: userId,
          otp,
          message: 'Your driver is on the way!',
          driver: driverData
        });
        
        // Confirm to the winning Driver
        socket.emit('ride:confirmed', { rideId, success: true });
        
        // Mark driver as busy
        const driverObj = activeDrivers.get(userId);
        if (driverObj) driverObj.isAvailable = false;
        
      } else {
        // Ride already taken or cancelled
        socket.emit('ride:cancelled', { rideId, message: 'Ride no longer available.' });
      }
    });

    // --- DRIVER VERIFIES OTP TO START RIDE ---
    socket.on('ride:verify_otp', (data) => {
      const { rideId, otp } = data;
      const rideState = pendingRides.get(rideId);
      
      if (rideState && rideState.status === 'ACCEPTED' && rideState.driverId === userId) {
        if (rideState.otp === otp) {
          // OTP matched!
          rideState.status = 'STARTED';
          console.log(`Ride ${rideId} STARTED by driver ${userId}`);
          
          // Notify both Driver and User
          const payloadDriver = { rideId, success: true };
          if (rideState.isParcel) {
            payloadDriver.recipient_phone = rideState.recipient_phone;
          }
          
          socket.emit('ride:started', payloadDriver);
          io.to(`user_${rideState.userId}`).emit('ride:started', { rideId, message: 'Your ride has started!' });
        } else {
          // Invalid OTP
          socket.emit('ride:otp_failed', { rideId, message: 'Invalid OTP. Please check with the user.' });
        }
      } else {
        socket.emit('ride:otp_failed', { rideId, message: 'Ride not found or invalid state.' });
      }
    });

    // --- DRIVER ENDS THE RIDE ---
    socket.on('ride:complete', async (data) => {
      const { rideId, finalFare, paymentMethod } = data;
      const rideState = pendingRides.get(rideId);
      
      if (rideState && rideState.status === 'STARTED' && rideState.driverId === userId) {
        rideState.status = 'COMPLETED';
        console.log(`Ride ${rideId} COMPLETED by driver ${userId}`);
        
        try {
          let actualDriverId = rideState.driverId;

          // Save the ride to the database
          const rideTypeId = 1; // Default to standard ride type
          await pool.query('SET FOREIGN_KEY_CHECKS = 0');
          await pool.execute(
            `INSERT INTO rides 
            (user_id, driver_id, vehicle_type_id, ride_type_id, pickup_lat, pickup_lng, pickup_address, drop_lat, drop_lng, drop_address, distance_km, estimated_fare, final_fare, status, is_parcel, recipient_name, recipient_phone, parcel_description) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?)`,
            [
              rideState.userId, 
              actualDriverId, 
              rideState.vehicle_type_id || 1, 
              rideTypeId,
              rideState.pickup?.latitude || 0, 
              rideState.pickup?.longitude || 0, 
              rideState.pickup?.address || 'Unknown Pickup',
              rideState.drop?.latitude || 0, 
              rideState.drop?.longitude || 0, 
              rideState.drop?.address || 'Unknown Drop',
              rideState.distance || 0,
              rideState.estimated_fare || 50,
              finalFare || rideState.estimated_fare || 50,
              rideState.isParcel || false,
              rideState.recipient_name || null,
              rideState.recipient_phone || null,
              rideState.parcel_description || null
            ]
          );
          await pool.query('SET FOREIGN_KEY_CHECKS = 1');
        } catch (err) {
          console.error('Failed to save completed ride to DB:', err);
        }

        // Notify both Driver and User
        socket.emit('ride:completed', { rideId, success: true });
        io.to(`user_${rideState.userId}`).emit('ride:completed', { 
          rideId, 
          message: 'You have reached your destination!',
          fare: finalFare || rideState.estimated_fare || 50,
          paymentMethod: paymentMethod || 'CASH'
        });
        
        // Save fare info so user can fetch it on reconnect
        rideState.finalFare = finalFare || rideState.estimated_fare || 50;
        rideState.paymentMethod = paymentMethod || 'CASH';
        
        // Mark driver as available again
        const driverObj = activeDrivers.get(userId);
        if (driverObj) driverObj.isAvailable = true;
        
        // Do NOT delete the ride yet, wait for the user to complete payment!
      }
    });

    socket.on('ride:payment_complete', (data) => {
      const { rideId } = data;
      const rideState = pendingRides.get(rideId);
      if (rideState && rideState.status === 'COMPLETED') {
        pendingRides.delete(rideId);
        console.log(`Ride ${rideId} deleted after payment completion.`);
      }
    });

    // --- USER OR DRIVER CANCELS THE RIDE ---
    socket.on('ride:cancel', async (data) => {
      let rideId = data?.rideId;
      if (!rideId) {
        for (const [rId, state] of pendingRides.entries()) {
          if (state.userId === userId) {
             rideId = rId;
             break;
          }
        }
      }
      
      if (!rideId) return;

      const rideState = pendingRides.get(rideId);
      
      if (rideState) {
        console.log(`Ride ${rideId} CANCELLED by ${userId}`);
        
        // Notify User
        io.to(`user_${rideState.userId}`).emit('ride:cancelled', { 
          rideId, 
          message: 'Ride has been cancelled.' 
        });
        
        // Notify Driver if assigned
        if (rideState.driverId) {
          const driverObj = activeDrivers.get(rideState.driverId);
          if (driverObj) {
             io.to(driverObj.socketId).emit('ride:cancelled', {
               rideId,
               message: data.reason ? `Ride was cancelled: ${data.reason}` : 'Ride was cancelled by the user.',
               reason: data.reason || null
             });
             driverObj.isAvailable = true; // Free up the driver
          }
        } else {
          // If no driver accepted yet, broadcast to ALL active drivers to clear their pending requests
          activeDrivers.forEach((driverObj) => {
             io.to(driverObj.socketId).emit('ride:cancelled', {
               rideId,
               message: 'Ride was cancelled by the user.'
             });
          });
        }
        
        // Save the cancelled ride to the database
        try {
          await pool.query('SET FOREIGN_KEY_CHECKS = 0');
          await pool.execute(
            `INSERT INTO rides 
            (user_id, driver_id, vehicle_type_id, ride_type_id, pickup_lat, pickup_lng, pickup_address, drop_lat, drop_lng, drop_address, estimated_fare, status, cancelled_by, cancellation_reason, is_parcel, recipient_name, recipient_phone, parcel_description) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CANCELLED', ?, ?, ?, ?, ?, ?)`,
            [
              rideState.userId, 
              rideState.driverId || null, 
              rideState.vehicle_type_id || 1, 
              1,
              rideState.pickup?.latitude || 0, 
              rideState.pickup?.longitude || 0, 
              rideState.pickup?.address || 'Unknown Pickup',
              rideState.drop?.latitude || 0, 
              rideState.drop?.longitude || 0, 
              rideState.drop?.address || 'Unknown Drop',
              rideState.estimated_fare || 0,
              userRole,
              data.reason || null,
              rideState.isParcel || false,
              rideState.recipient_name || null,
              rideState.recipient_phone || null,
              rideState.parcel_description || null
            ]
          );
          await pool.query('SET FOREIGN_KEY_CHECKS = 1');
        } catch (dbErr) {
          console.error('Failed to save cancelled ride to DB:', dbErr);
        }
        
        // Remove from pending rides
        pendingRides.delete(rideId);
      }
    });

    // --- TICKETING / HELP SUPPORT CHAT ---
    socket.on('ticket:join', (data) => {
      const { ticketId } = data;
      if (ticketId) {
        socket.join(`ticket_${ticketId}`);
        console.log(`User/Admin ${userId} joined ticket chat ${ticketId}`);
      }
    });

    socket.on('ticket:message', async (data) => {
      const { ticketId, message, senderType } = data; // senderType = 'USER' | 'ADMIN'
      if (!ticketId || !message) return;
      try {
        // Save to DB
        const [result] = await pool.execute(
          'INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message) VALUES (?, ?, ?, ?)',
          [ticketId, senderType || 'USER', userId, message]
        );
        
        const newMessage = {
          id: result.insertId,
          ticket_id: ticketId,
          sender_type: senderType || 'USER',
          sender_id: userId,
          message,
          created_at: new Date()
        };

        // Broadcast to everyone in the ticket room
        io.to(`ticket_${ticketId}`).emit('ticket:receive_message', newMessage);
      } catch (err) {
        console.error('Error saving ticket message:', err);
      }
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${userId}`);
      if (activeDrivers.has(userId)) {
        activeDrivers.delete(userId);
        socket.broadcast.emit('driver:offline', { driverId: userId });
      }

      if (sessionId) {
        pool.execute(
          `UPDATE driver_sessions SET logout_time = NOW(), session_duration_minutes = TIMESTAMPDIFF(MINUTE, login_time, NOW()) WHERE id = ?`, 
          [sessionId]
        ).then(() => {
          console.log(`Ended session ${sessionId} for driver ${userId}`);
        }).catch(err => console.error('Error ending driver session:', err));
      }
    });
  });

  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

const getActiveRideForDriver = (driverId) => {
  for (const [rideId, rideState] of pendingRides.entries()) {
    if (String(rideState.driverId) === String(driverId) && (rideState.status === 'ACCEPTED' || rideState.status === 'STARTED')) {
      return { rideId, ...rideState };
    }
  }
  return null;
};

const getActiveRideForUser = (userId) => {
  for (const [rideId, rideState] of pendingRides.entries()) {
    if (String(rideState.userId) === String(userId) && (rideState.status === 'ACCEPTED' || rideState.status === 'STARTED' || rideState.status === 'SEARCHING' || rideState.status === 'COMPLETED')) {
      return { rideId, ...rideState };
    }
  }
  return null;
};

module.exports = { initSocket, getIo, getActiveRideForDriver, getActiveRideForUser };
