import { query, pool, pickColumns } from '../config/database';
import { GiftShopSale, GiftShopSaleItem } from '../types/giftShopSale.types';

export class GiftShopSaleModel {
  static async create(sale: GiftShopSale): Promise<GiftShopSale> {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const { items, ...saleData } = sale;
      const saleFields = Object.entries(pickColumns('gift_shop_sales_transactions', saleData));
      const saleSql = `INSERT INTO gift_shop_sales_transactions (${saleFields.map(([key]) => key).join(', ')})
                       VALUES (${saleFields.map(() => '?').join(', ')})`;
      const saleResult = await connection.query(saleSql, saleFields.map(([, value]) => value));
      const transactionId = (saleResult[0] as any).insertId;

      for (const item of items) {
        await connection.query(
          `INSERT INTO gift_shop_sale_items (transaction_id, item_id, quantity, unit_price)
           VALUES (?, ?, ?, ?)`,
          [transactionId, item.item_id, item.quantity, item.unit_price]
        );

        // Deplete stock the same way online checkout does; fail the whole sale if there isn't enough
        const [stockResult] = await connection.query(
          `UPDATE gift_shop_items SET quantity_in_stock = quantity_in_stock - ?
           WHERE item_id = ? AND deleted_at IS NULL AND quantity_in_stock >= ?`,
          [item.quantity, item.item_id, item.quantity]
        );
        if (stockResult.affectedRows === 0) {
          const error: any = new Error(`Not enough stock for gift shop item #${item.item_id}`);
          error.statusCode = 400;
          throw error;
        }
      }

      await connection.commit();
      connection.release();

      return { ...sale, transaction_id: transactionId };
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  }


  static async findById(id: number): Promise<GiftShopSale | null> {
    const saleSql = 'SELECT * FROM gift_shop_sales_transactions WHERE transaction_id = ?';
    const saleResults = await query<GiftShopSale[]>(saleSql, [id]);

    if (saleResults.length === 0) {
      return null;
    }

    const itemsSql = 'SELECT * FROM gift_shop_sale_items WHERE transaction_id = ?';
    const items = await query<GiftShopSaleItem[]>(itemsSql, [id]);

    return { ...saleResults[0], items };
  }

  static async findByDate(date: string): Promise<GiftShopSale[]> {
    const sql = 'SELECT * FROM gift_shop_sales_transactions WHERE DATE(sale_date) = ?';
    return await query<GiftShopSale[]>(sql, [date]);
  }

  // A return is not a "deletion" of the original transaction.
  // It should be marked as "returned" to preserve the financial record.
  static async remove(id: number): Promise<void> {
    const sql = "UPDATE gift_shop_sales_transactions SET status = 'returned' WHERE transaction_id = ?";
    await query(sql, [id]);
  }
}
