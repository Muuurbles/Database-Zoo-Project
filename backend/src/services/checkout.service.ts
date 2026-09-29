import { query, getCurrentDateTime, pool } from '../config/database';
import { CheckoutRequest, CheckoutResponse, CheckoutCartItem } from '../types/checkout.types';
import { TICKET_PRICES, TicketType, MEMBERSHIP_PRICE } from '../config/pricing';

export class CheckoutService {
  /**
   * Process checkout - creates records in existing tables from client-side cart
   * Uses database transaction to ensure atomicity (all-or-nothing)
   *
   * Every amount is priced on the server (item rows in the database, or config/pricing.ts);
   * the cart's unit_price is only used for donations, where the customer picks the amount.
   */
  static async processCheckout(
    customerId: number,
    checkoutData: CheckoutRequest
  ): Promise<CheckoutResponse> {
    if (!checkoutData.items || checkoutData.items.length === 0) {
      throw new Error('Cart is empty');
    }

    for (const item of checkoutData.items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new Error(`Invalid quantity for "${item.name}"`);
      }
    }

    // Get database connection from pool for transaction
    const connection = await pool.getConnection();

    try {
      // Start transaction
      await connection.beginTransaction();

      // SECURITY: Payment method storage disabled - see savePaymentMethod() for details
      // Auto-renewal requires payment gateway integration (Stripe/Braintree)
      if (checkoutData.save_payment_method && checkoutData.payment_data) {
        await this.savePaymentMethod(customerId, checkoutData.payment_data);
      }

      // Track counts for response
      const summary = {
        tickets: 0,
        events: 0,
        cafe_items: 0,
        gift_shop_items: 0,
        donations: 0,
        memberships: 0,
      };
      let totalAmount = 0;

      // All cafe items in one checkout are one cafe transaction
      const cafeTransactionId = `CAFE-WEB-${customerId}-${Date.now()}`;

      // Process each cart item within transaction
      for (const item of checkoutData.items) {
        switch (item.item_type) {
          case 'ticket':
            totalAmount += await this.createTicketRecords(item, customerId, checkoutData.payment_method, connection);
            summary.tickets += item.quantity;
            break;

          case 'event':
            totalAmount += await this.createEventRegistration(item, customerId, connection);
            summary.events++;
            break;

          case 'cafe_item':
            totalAmount += await this.createCafeSale(item, customerId, cafeTransactionId, connection);
            summary.cafe_items += item.quantity;
            break;

          case 'gift_shop_item':
            totalAmount += await this.createGiftShopSale(item, customerId, checkoutData.payment_method, connection);
            summary.gift_shop_items += item.quantity;
            break;

          case 'donation':
            totalAmount += await this.createDonation(item, customerId, checkoutData.payment_method, connection);
            summary.donations++;
            break;

          case 'membership':
            totalAmount += await this.createMembership(item, customerId, checkoutData.payment_method, connection);
            summary.memberships++;
            break;

          default:
            throw new Error(`Unknown item type: ${(item as any).item_type}`);
        }
      }

      // Commit transaction - all operations succeeded
      await connection.commit();

      return {
        success: true,
        summary,
        total_amount: Math.round(totalAmount * 100) / 100,
        message: 'Order completed successfully',
      };

    } catch (error) {
      // Rollback transaction on any error
      await connection.rollback();
      console.error('[CHECKOUT] Transaction rolled back due to error:', error);
      throw error;
    } finally {
      // Always release connection back to pool
      connection.release();
    }
  }

  /**
   * Create ticket records (one per quantity). Returns the amount charged.
   */
  private static async createTicketRecords(
    item: CheckoutCartItem,
    customerId: number,
    paymentMethod: 'credit' | 'debit',
    connection: any
  ): Promise<number> {
    const metadata = item.metadata || {};
    const ticketType = metadata.ticket_type as TicketType | undefined;
    if (!ticketType || !(ticketType in TICKET_PRICES)) {
      throw new Error(`Invalid ticket type for "${item.name}"`);
    }
    const price = TICKET_PRICES[ticketType];

    const [dateRows] = await connection.execute(
      'SELECT CASE WHEN ? >= CURDATE() THEN 1 ELSE 0 END as ok',
      [metadata.visit_date ?? null]
    );
    if (!metadata.visit_date || dateRows[0]?.ok !== 1) {
      throw new Error('Tickets must be for today or a future date');
    }

    const currentDateTime = getCurrentDateTime();
    for (let i = 0; i < item.quantity; i++) {
      await connection.execute(
        `INSERT INTO tickets (customer_id, visit_date, ticket_type, price, payment_method, purchase_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [customerId, metadata.visit_date, ticketType, price, paymentMethod, currentDateTime]
      );
    }
    return price * item.quantity;
  }

  /**
   * Create event registration. The cart quantity is the number of participants.
   * Returns the amount charged.
   */
  private static async createEventRegistration(
    item: CheckoutCartItem,
    customerId: number,
    connection: any
  ): Promise<number> {
    const metadata = item.metadata || {};
    const eventId = metadata.event_id || item.item_id;
    const participants = metadata.participants || item.quantity;

    const [eventRows] = await connection.execute(
      `SELECT e.name, e.ticket_price, e.max_participants,
              CASE WHEN e.event_date >= CURDATE() THEN 1 ELSE 0 END as is_upcoming,
              (SELECT COALESCE(SUM(er.number_of_participants), 0)
               FROM event_registrations er
               WHERE er.event_id = e.event_id AND er.deleted_at IS NULL AND er.refunded_at IS NULL) as registered
       FROM events e
       WHERE e.event_id = ? AND e.deleted_at IS NULL`,
      [eventId]
    );
    const event = eventRows[0];

    if (!event) {
      throw new Error(`Event "${item.name}" not found or has been cancelled`);
    }
    if (event.is_upcoming !== 1) {
      throw new Error(`"${event.name}" has already taken place`);
    }
    if (event.ticket_price == null) {
      throw new Error(`"${event.name}" is not open for registration`);
    }
    if (event.max_participants != null && event.registered + participants > event.max_participants) {
      const left = Math.max(event.max_participants - event.registered, 0);
      throw new Error(`Only ${left} spot(s) left for "${event.name}" (requested: ${participants})`);
    }

    const totalAmount = event.ticket_price * participants;
    const currentDateTime = getCurrentDateTime();

    await connection.execute(
      `INSERT INTO event_registrations (event_id, customer_id, number_of_participants, total_amount, payment_status, registration_date)
       VALUES (?, ?, ?, ?, 'paid', ?)`,
      [eventId, customerId, participants, totalAmount, currentDateTime]
    );
    return totalAmount;
  }

  /**
   * Create cafe sale. Returns the amount charged.
   */
  private static async createCafeSale(
    item: CheckoutCartItem,
    customerId: number,
    transactionId: string,
    connection: any
  ): Promise<number> {
    const [itemRows] = await connection.execute(
      `SELECT cafe_id, name, price, is_available FROM cafe_items
       WHERE item_id = ? AND deleted_at IS NULL`,
      [item.item_id]
    );
    const cafeItem = itemRows[0];

    if (!cafeItem) {
      throw new Error(`Cafe item #${item.item_id} not found or has been deleted`);
    }
    if (!cafeItem.is_available) {
      throw new Error(`"${cafeItem.name}" is not available right now`);
    }

    const lineTotal = cafeItem.price * item.quantity;
    const currentDateTime = getCurrentDateTime();

    await connection.execute(
      `INSERT INTO cafe_sales (cafe_id, transaction_id, customer_id, employee_id, item_id, quantity, line_total, sale_timestamp, status)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'completed')`,
      [cafeItem.cafe_id, transactionId, customerId, item.item_id, item.quantity, lineTotal, currentDateTime]
    );
    return lineTotal;
  }

  /**
   * Create gift shop sale and deplete stock
   * Validates stock availability before processing. Returns the amount charged.
   */
  private static async createGiftShopSale(
    item: CheckoutCartItem,
    customerId: number,
    paymentMethod: 'credit' | 'debit',
    connection: any
  ): Promise<number> {
    const currentDateTime = getCurrentDateTime();

    // Validate item exists and check stock availability
    const [itemResults] = await connection.execute(
      `SELECT item_id, gift_shop_id, price, quantity_in_stock, name FROM gift_shop_items
       WHERE item_id = ? AND deleted_at IS NULL`,
      [item.item_id]
    );
    const itemData = itemResults[0];

    if (!itemData) {
      throw new Error(`Gift shop item #${item.item_id} not found or has been deleted`);
    }

    if (itemData.quantity_in_stock <= 0) {
      throw new Error(`"${itemData.name}" is out of stock`);
    }

    if (itemData.quantity_in_stock < item.quantity) {
      throw new Error(`Only ${itemData.quantity_in_stock} of "${itemData.name}" available (requested: ${item.quantity})`);
    }

    const totalAmount = itemData.price * item.quantity;

    // Create transaction
    const [transactionResult] = await connection.execute(
      `INSERT INTO gift_shop_sales_transactions (gift_shop_id, customer_id, employee_id, total_amount, payment_method, sale_date, status)
       VALUES (?, ?, NULL, ?, ?, ?, 'completed')`,
      [itemData.gift_shop_id, customerId, totalAmount, paymentMethod, currentDateTime]
    );

    const transactionId = transactionResult.insertId;

    // Create sale item
    await connection.execute(
      `INSERT INTO gift_shop_sale_items (transaction_id, item_id, quantity, unit_price)
       VALUES (?, ?, ?, ?)`,
      [transactionId, item.item_id, item.quantity, itemData.price]
    );

    // Deplete stock - reduce quantity_in_stock by purchased quantity
    const [stockResult] = await connection.execute(
      `UPDATE gift_shop_items SET quantity_in_stock = quantity_in_stock - ? WHERE item_id = ? AND quantity_in_stock >= ?`,
      [item.quantity, item.item_id, item.quantity]
    );

    if (stockResult.affectedRows === 0) {
      throw new Error(`"${itemData.name}" sold out - unable to complete purchase. Please remove from cart and try again.`);
    }
    return totalAmount;
  }

  /**
   * Create donation record. The customer chooses the amount. Returns the amount charged.
   */
  private static async createDonation(
    item: CheckoutCartItem,
    customerId: number,
    paymentMethod: 'credit' | 'debit',
    connection: any
  ): Promise<number> {
    const metadata = item.metadata || {};
    const amount = Math.round(Number(item.unit_price) * item.quantity * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Donation amount must be greater than zero');
    }
    const currentDateTime = getCurrentDateTime();

    await connection.execute(
      `INSERT INTO donations (customer_id, amount, donation_date, message, payment_method)
       VALUES (?, ?, ?, ?, ?)`,
      [customerId, amount, currentDateTime, metadata.donation_message || null, paymentMethod]
    );
    return amount;
  }

  /**
   * Create membership purchase record. Returns the amount charged.
   *
   * Renewing an active membership (allowed in its last 30 days) extends it by a year from its
   * current end date, so the remaining days aren't lost.
   */
  private static async createMembership(
    item: CheckoutCartItem,
    customerId: number,
    paymentMethod: 'credit' | 'debit',
    connection: any
  ): Promise<number> {
    const metadata = item.metadata || {};
    if (item.quantity !== 1) {
      throw new Error('Only one membership can be purchased at a time');
    }

    // Check if customer already has an active membership
    const [membershipResults] = await connection.execute(
      `SELECT membership_start_date, membership_end_date, membership_auto_renew,
              CAST(julianday(membership_end_date) - julianday(CURDATE()) AS INTEGER) as days_until_expiry
       FROM customers
       WHERE customer_id = ? AND annual_pass = 'yes' AND membership_end_date >= CURDATE()`,
      [customerId]
    );
    const existingMembership = membershipResults[0];

    if (existingMembership && existingMembership.days_until_expiry > 30) {
      throw new Error(`You already have an active membership that expires in ${existingMembership.days_until_expiry} days. You can only renew your membership within 30 days of expiration.`);
    }

    // Active member renewing: the new year starts where the current one ends
    const [dateResults] = await connection.execute(
      existingMembership
        ? "SELECT membership_end_date as start_date, date(membership_end_date, '+1 year') as end_date FROM customers WHERE customer_id = ?"
        : "SELECT CURDATE() as start_date, date(CURDATE(), '+1 year') as end_date",
      existingMembership ? [customerId] : []
    );
    const { start_date: periodStart, end_date: periodEnd } = dateResults[0];

    // Auto-renew charges the saved card, so it can only be turned on when one is saved
    const [cardRows] = await connection.execute(
      'SELECT 1 as has_card FROM customer_payment_methods WHERE customer_id = ?',
      [customerId]
    );
    const autoRenew = metadata.auto_renew === undefined
      ? Boolean(existingMembership?.membership_auto_renew)
      : Boolean(metadata.auto_renew) && cardRows.length > 0;

    // Update customer membership (an active member keeps their original start date)
    await connection.execute(
      `UPDATE customers
       SET annual_pass = 'yes',
           membership_start_date = ?,
           membership_end_date = ?,
           membership_auto_renew = ?
       WHERE customer_id = ?`,
      [existingMembership ? existingMembership.membership_start_date : periodStart, periodEnd, autoRenew, customerId]
    );

    // Record purchase in history table
    const currentDateTime = getCurrentDateTime();
    await connection.execute(
      `INSERT INTO membership_purchases
       (customer_id, purchase_date, start_date, end_date, price, payment_method, payment_method_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customerId, currentDateTime, periodStart, periodEnd, MEMBERSHIP_PRICE, paymentMethod, null]
    );
    return MEMBERSHIP_PRICE;
  }

  /**
   * Payment Method Storage - DISABLED FOR SECURITY
   *
   * @SECURITY_NOTE: This student project does not store credit card information.
   * Storing raw credit card data (especially CVV) violates PCI DSS compliance.
   *
   * PRODUCTION IMPLEMENTATION WOULD USE:
   * =====================================
   *
   * **Stripe (Recommended)**
   * - Stripe.js tokenizes cards in browser (card data never touches your server)
   * - Payment Methods API for storing tokenized cards
   * - Automatic PCI DSS compliance
   * - Subscriptions API for recurring billing
   * - Example: const paymentMethod = await stripe.paymentMethods.create({ type: 'card', card: cardElement });
   *
   * **Braintree**
   * - PayPal-backed payment processing
   * - Drop-in UI handles all card input
   * - Vault API for storing payment methods
   * - Built-in fraud protection
   *
   * **Square**
   * - Web Payments SDK for card tokenization
   * - Cards API for secure storage
   * - Unified platform for online and in-person payments
   *
   * CURRENT BEHAVIOR:
   * ================
   * This method is a no-op. Payment flow simulated for demonstration only.
   * No sensitive card data is transmitted to or stored by the server.
   */
  private static async savePaymentMethod(customerId: number, paymentData: any): Promise<void> {
    console.log('[PAYMENT] Payment method save requested for customer:', customerId);
    console.log('[PAYMENT] In production, this would create a Stripe PaymentMethod token');
    console.log('[PAYMENT] No credit card data is stored in this student project');

    // No-op - do not store any payment information
    return;
  }
}

