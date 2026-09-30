const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/', protect, ticketController.createTicket);
router.get('/', protect, ticketController.getUserTickets);
router.get('/:id/messages', protect, ticketController.getTicketMessages);

// Admin route
router.get('/admin/all', protect, authorize('ADMIN', 'SUPER_ADMIN'), ticketController.getAllTickets);
router.put('/admin/:id/status', protect, authorize('ADMIN', 'SUPER_ADMIN'), ticketController.updateTicketStatus);

module.exports = router;
