const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { connectDB } = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Security middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

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

// Body parser
app.use(express.json());

// Mount Routes
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));
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

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'API is running' });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

const http = require('http');
const { initSocket } = require('./sockets/socketManager');

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

module.exports = { app, server };
