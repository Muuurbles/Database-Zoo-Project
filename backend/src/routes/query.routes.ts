import { Router } from 'express';
import { QueryController } from '../controllers/query.controller';
import { protect, restrictTo } from '../middleware/auth.middleware';

const router = Router();

// All query routes require authentication
router.use(protect);

// New 3-Report System
// Roles match the report links in the admin Sidebar
router.get('/animal-health-care', restrictTo('manager', 'keeper', 'veterinarian'), QueryController.getAnimalHealthAndCare);
router.get('/event-performance', restrictTo('manager', 'coordinator'), QueryController.getEventPerformance);
router.get('/financial-report', restrictTo('manager'), QueryController.getFinancialReport);

export default router;
