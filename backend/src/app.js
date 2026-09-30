const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { connectDB } = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Load environment variables
dotenv.config();

const app = express();

// Trust Vercel's reverse proxy
app.set('trust proxy', 1);
// Connect to database
connectDB();

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    }
  })
);

app.use(cors());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,

  validate: {
    forwardedHeader: false
  }
});
app.use(limiter);

// Body parser
app.use(express.json());

// Routes
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

// Static uploads
app.use(
  '/uploads',
  express.static(path.join(__dirname, '../../uploads'))
);

// API routes
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

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Eagle Fly API is running'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Eagle Fly Backend API is running'
  });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

// IMPORTANT:
// Vercel requires the Express app itself to be exported.
// Do not call server.listen() here.
module.exports = app;
