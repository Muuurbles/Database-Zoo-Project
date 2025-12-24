import { Request, Response } from 'express';
import { TransactionService } from '../services/transaction.service';

export class TransactionController {
  static async getAll(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;

      const result = await TransactionService.getAllPaginated(page, limit);
      res.json(result);
    } catch (error) {
      console.error('Failed to get all transactions', error);
      res.status(500).json({ message: 'Failed to get all transactions' });
    }
  }
}
