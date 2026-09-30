const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const http = require('http');

const { connectDB } = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const { initSocket } = require('./sockets/socketManager');

// ======================================================
// Load Environment Variables
// ======================================================

dotenv.config();

// ======================================================
// Create Express App
// ======================================================

const app = express();

// ======================================================
// Trust Vercel Reverse Proxy
// ======================================================

app.set('trust proxy', 1);

// ======================================================
// Connect Database
// ======================================================

connectDB();

// ======================================================
// Security Middleware
// ======================================================

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    }
  })
);

app.use(cors());

// ======================================================
// Rate Limiting
// ======================================================

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,

  validate: {
    forwardedHeader: false
  }
});

app.use(limiter);

// ======================================================
// Body Parser
// ======================================================

app.use(express.json());

// ======================================================
// Routes
// ======================================================

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const rideTypeRoutes = require('./routes/rideTypeRoutes');
const rideRoutes = require('./routes/rideRoutes');
const mapsRoutes = require('./routes/mapsRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const driverRoutes = require('./routes/driverRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const adRoutes = require('./routes/adRoutes');

// ======================================================
// Static Uploads
// ======================================================

app.use(
  '/uploads',
  express.static(path.join(__dirname, '../../uploads'))
);

// ======================================================
// API Routes
// ======================================================

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/vehicle-types', vehicleRoutes);
app.use('/api/ride-types', rideTypeRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/maps', mapsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/driver', driverRoutes);
app.use('/api/support/tickets', ticketRoutes);
app.use('/api/ads', adRoutes);

// ======================================================
// Health Check
// ======================================================

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Eagle Fly API is running'
  });
});

// ======================================================
// Root Endpoint
// ======================================================

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Eagle Fly Backend API is running'
  });
});

// ======================================================
// Error Handling
// ======================================================

app.use(notFound);
app.use(errorHandler);

// ======================================================
// HTTP Server
// ======================================================

const server = http.createServer(app);

// ======================================================
// Initialize Socket.IO
// ======================================================

initSocket(server);

// ======================================================
// Local Development Server
// ======================================================

const PORT = process.env.PORT || 5000;

if (process.env.VERCEL !== '1') {
  server.listen(PORT, () => {
    console.log(
      `Server running in ${
        process.env.NODE_ENV || 'development'
      } mode on port ${PORT}`
    );
  });
}

// ======================================================
// Export Server
// ======================================================

module.exports = server;
