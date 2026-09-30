const { successResponse, errorResponse } = require('../utils/responseHandler');

const getUserPayments = async (req, res) => {
  try {
    // Since we don't have a payments table yet, return mock data
    const mockPayments = [
      {
        id: 1,
        date: new Date().toISOString(),
        amount: 250,
        method: 'UPI',
        status: 'SUCCESS',
        description: 'Payment for Ride #1234'
      },
      {
        id: 2,
        date: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        amount: 120,
        method: 'Wallet',
        status: 'SUCCESS',
        description: 'Payment for Ride #1230'
      },
      {
        id: 3,
        date: new Date(Date.now() - 86400000 * 3).toISOString(), // 3 days ago
        amount: 350,
        method: 'Credit Card',
        status: 'FAILED',
        description: 'Payment for Ride #1225'
      }
    ];

    return successResponse(res, 200, 'Payments fetched successfully', mockPayments);
  } catch (error) {
    console.error(error);
    return errorResponse(res, 500, 'Failed to fetch payments');
  }
};

module.exports = { getUserPayments };
