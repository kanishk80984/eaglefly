const { pool } = require('../config/db');

exports.createTicket = async (req, res) => {
    try {
        const userId = req.user.id;
        const userType = req.user.role === 'DRIVER' ? 'DRIVER' : 'USER';
        const { topic } = req.body;
        
        if (!topic) {
            return res.status(400).json({ success: false, message: 'Topic is required' });
        }

        const [result] = await pool.execute(
            'INSERT INTO tickets (user_id, user_type, topic) VALUES (?, ?, ?)',
            [userId, userType, topic]
        );

        res.status(201).json({ success: true, ticketId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to create ticket' });
    }
};

exports.getUserTickets = async (req, res) => {
    try {
        const userId = req.user.id;
        const userType = req.user.role === 'DRIVER' ? 'DRIVER' : 'USER';
        const [tickets] = await pool.execute(
            'SELECT * FROM tickets WHERE user_id = ? AND user_type = ? ORDER BY created_at DESC',
            [userId, userType]
        );
        res.status(200).json({ success: true, data: tickets });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
    }
};

exports.getAllTickets = async (req, res) => {
    try {
        const [tickets] = await pool.execute(`
            SELECT 
                t.*, 
                COALESCE(u.name, d.name) as user_name, 
                COALESCE(u.phone, d.phone) as user_phone
            FROM tickets t
            LEFT JOIN users u ON t.user_id = u.id AND t.user_type = 'USER'
            LEFT JOIN drivers d ON t.user_id = d.id AND t.user_type = 'DRIVER'
            ORDER BY t.created_at DESC
        `);
        console.log(`Fetched ${tickets.length} tickets for admin`);
        res.status(200).json({ success: true, data: tickets });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
    }
};

exports.getTicketMessages = async (req, res) => {
    try {
        const ticketId = req.params.id;
        const [messages] = await pool.execute(
            'SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC',
            [ticketId]
        );
        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to fetch messages' });
    }
};

exports.updateTicketStatus = async (req, res) => {
    try {
        const ticketId = req.params.id;
        const { status } = req.body;
        
        if (!['OPEN', 'CLOSED'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        await pool.execute(
            'UPDATE tickets SET status = ? WHERE id = ?',
            [status, ticketId]
        );
        
        res.status(200).json({ success: true, message: `Ticket status updated to ${status}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to update ticket status' });
    }
};
