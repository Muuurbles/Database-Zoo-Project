import { pool } from '../config/database';

import { MEMBERSHIP_PRICE } from '../config/pricing';

// Memberships that ended up to this many days ago are still renewed, so a server that was down on
// the renewal date catches up when it starts. Older lapses are left expired.
const CATCH_UP_DAYS = 30;

export class MembershipRenewalService {
  /**
   * Renew memberships that expire today (or lapsed within CATCH_UP_DAYS) for customers who turned on auto-renewal and have a
   * saved payment method: extend the membership by a year and record an auto-renewed purchase.
   *
   * This replaces the MySQL stored procedure `auto_renew_memberships()` and its daily EVENT.
   * It is safe to run repeatedly - once renewed, a membership ends a year later.
   *
   * @returns the number of memberships renewed
   */
  static async renewExpiringMemberships(): Promise<number> {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Record the purchases first, while the old end date is still on the customer row
      const [purchases] = await connection.execute(
        `INSERT INTO membership_purchases
           (customer_id, purchase_date, start_date, end_date, price, payment_method, auto_renewed, payment_method_id)
         SELECT c.customer_id, NOW(), c.membership_end_date, date(c.membership_end_date, '+1 year'),
                ?, 'credit', 1, pm.payment_method_id
         FROM customers c
         INNER JOIN customer_payment_methods pm ON c.customer_id = pm.customer_id
         WHERE c.annual_pass = 'yes'
           AND c.membership_auto_renew = 1
           AND c.membership_end_date BETWEEN date(CURDATE(), '-${CATCH_UP_DAYS} days') AND CURDATE()`,
        [MEMBERSHIP_PRICE]
      );

      // Then roll each membership forward: the new term starts when the old one ended
      await connection.execute(
        `UPDATE customers
         SET membership_start_date = membership_end_date,
             membership_end_date = date(membership_end_date, '+1 year'),
             annual_pass = 'yes'
         WHERE annual_pass = 'yes'
           AND membership_auto_renew = 1
           AND membership_end_date BETWEEN date(CURDATE(), '-${CATCH_UP_DAYS} days') AND CURDATE()
           AND customer_id IN (SELECT customer_id FROM customer_payment_methods)`
      );

      await connection.commit();
      return purchases.affectedRows;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
