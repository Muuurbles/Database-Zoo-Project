import { query, pool } from '../config/database';
import { CafeSale, CafeSaleItem } from '../types/cafeSale.types';
import { randomUUID } from 'crypto';

export class CafeSaleModel {
  static async create(sale: Omit<CafeSale, 'sale_id' | 'transaction_id'>): Promise<CafeSale> {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const transactionId = randomUUID();
      const itemPromises = sale.items.map(item => {
        const sql = `INSERT INTO cafe_sales (cafe_id, transaction_id, customer_id, employee_id, item_id, quantity, line_total)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`;
        return connection.query(sql, [
          sale.cafe_id,
          transactionId,
          sale.customer_id ?? null,
          sale.employee_id ?? null,
          item.item_id,
          item.quantity,
          item.line_total
        ]);
      });

      await Promise.all(itemPromises);

      await connection.commit();
      connection.release();

      return { ...sale, transaction_id: transactionId };
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  }

  static async findByTransactionId(transactionId: string): Promise<CafeSale | null> {
    const sql = 'SELECT * FROM cafe_sales WHERE transaction_id = ?';
    const results = await query<any[]>(sql, [transactionId]);

    if (results.length === 0) {
      return null;
    }

    const sale: CafeSale = {
      transaction_id: results[0].transaction_id,
      cafe_id: results[0].cafe_id,
      customer_id: results[0].customer_id,
      employee_id: results[0].employee_id,
      sale_timestamp: results[0].sale_timestamp,
      items: results.map(row => ({
        item_id: row.item_id,
        quantity: row.quantity,
        line_total: row.line_total
      }))
    };

    return sale;
  }

  static async findByDateAndCafe(date: string, cafeId: number): Promise<any[]> {
    const sql = 'SELECT * FROM cafe_sales WHERE DATE(sale_timestamp) = ? AND cafe_id = ?';
    return await query<any[]>(sql, [date, cafeId]);
  }

  static async remove(transactionId: string): Promise<void> {
    const sql = "UPDATE cafe_sales SET status = 'returned' WHERE transaction_id = ?";
    await query(sql, [transactionId]);
  }
}
