import { Router } from 'express';
import { TicketController } from '../controllers/ticket.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = Router();

// Staff point-of-sale ticket sales (customers buy tickets through /api/checkout)
router.post('/', protect, restrictTo('manager', 'cashier'), TicketController.createTicket);

// Protected routes - require authentication
router.get('/', protect, restrictTo('manager'), TicketController.getAllTickets);
router.get('/date/:date', protect, restrictTo('manager'), TicketController.getTicketsByDate);
router.get('/:id', protect, restrictTo('manager', 'cashier'), TicketController.getTicketById);

// DELETE functionality removed - transactions are final and cannot be deleted

export default router;
