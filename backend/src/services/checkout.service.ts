import { DonationModel } from '../models/donation.model';
import { query, getCurrentDateTime, pool } from '../config/database';
import { CheckoutRequest, CheckoutResponse, CheckoutCartItem } from '../types/checkout.types';

export class CheckoutService {
  /**
   * Process checkout - creates records in existing tables from client-side cart
   * Uses database transaction to ensure atomicity (all-or-nothing)
   */
  static async processCheckout(
    customerId: number,
    checkoutData: CheckoutRequest
  ): Promise<CheckoutResponse> {
    if (!checkoutData.items || checkoutData.items.length === 0) {
      throw new Error('Cart is empty');
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

      // Process each cart item within transaction
      for (const item of checkoutData.items) {
        switch (item.item_type) {
          case 'ticket':
            await this.createTicketRecords(item, customerId, checkoutData.payment_method, connection);
            summary.tickets += item.quantity;
            break;

          case 'event':
            await this.createEventRegistration(item, customerId, connection);
            summary.events++;
            break;

          case 'cafe_item':
            await this.createCafeSale(item, customerId, connection);
            summary.cafe_items += item.quantity;
            break;

          case 'gift_shop_item':
            await this.createGiftShopSale(item, customerId, checkoutData.payment_method, connection);
            summary.gift_shop_items += item.quantity;
            break;

          case 'donation':
            await this.createDonation(item, customerId, checkoutData.payment_method, connection);
            summary.donations++;
            break;

          case 'membership':
            await this.createMembership(item, customerId, checkoutData.payment_method, connection);
            summary.memberships++;
            break;

          default:
            console.error(`Unknown item type: ${item.item_type}`);
        }
      }

      // Calculate total
      const totalAmount = checkoutData.items.reduce(
        (sum, item) => sum + item.unit_price * item.quantity,
        0
      );

      // Commit transaction - all operations succeeded
      await connection.commit();

      return {
        success: true,
        summary,
        total_amount: totalAmount,
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
   * Create ticket records (one per quantity)
   */
  private static async createTicketRecords(
    item: CheckoutCartItem,
    customerId: number,
    paymentMethod: 'credit' | 'debit',
    connection: any
  ): Promise<void> {
    const metadata = item.metadata || {};
    const currentDateTime = getCurrentDateTime();

    for (let i = 0; i < item.quantity; i++) {
      await connection.execute(
        `INSERT INTO tickets (customer_id, visit_date, ticket_type, price, payment_method, purchase_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [customerId, metadata.visit_date, metadata.ticket_type, item.unit_price, paymentMethod, currentDateTime]
      );
    }
  }

  /**
   * Create event registration
   */
  private static async createEventRegistration(
    item: CheckoutCartItem,
    customerId: number,
    connection: any
  ): Promise<void> {
    const metadata = item.metadata || {};
    const totalAmount = item.unit_price * (metadata.participants || 1);
    const currentDateTime = getCurrentDateTime();

    await connection.execute(
      `INSERT INTO event_registrations (event_id, customer_id, number_of_participants, total_amount, payment_status, registration_date)
       VALUES (?, ?, ?, ?, 'paid', ?)`,
      [metadata.event_id || item.item_id, customerId, metadata.participants || 1, totalAmount, currentDateTime]
    );
  }

  /**
   * Create cafe sale
   */
  private static async createCafeSale(
    item: CheckoutCartItem,
    customerId: number,
    connection: any
  ): Promise<void> {
    const metadata = item.metadata || {};
    const cafeId = metadata.cafe_id || 1;
    const transactionId = `CAFE-WEB-${customerId}-${Date.now()}`;
    const lineTotal = item.unit_price * item.quantity;
    const currentDateTime = getCurrentDateTime();

    await connection.execute(
      `INSERT INTO cafe_sales (cafe_id, transaction_id, customer_id, employee_id, item_id, quantity, line_total, sale_timestamp, status)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'completed')`,
      [cafeId, transactionId, customerId, item.item_id, item.quantity, lineTotal, currentDateTime]
    );
  }

  /**
   * Create gift shop sale and deplete stock
   * Validates stock availability before processing
   */
  private static async createGiftShopSale(
    item: CheckoutCartItem,
    customerId: number,
    paymentMethod: 'credit' | 'debit',
    connection: any
  ): Promise<void> {
    const metadata = item.metadata || {};
    const giftShopId = metadata.gift_shop_id || 1;
    const totalAmount = item.unit_price * item.quantity;
    const currentDateTime = getCurrentDateTime();

    // Validate item exists and check stock availability
    const [itemResults] = await connection.execute(
      `SELECT item_id, quantity_in_stock, name FROM gift_shop_items
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

    // Create transaction
    const [transactionResult] = await connection.execute(
      `INSERT INTO gift_shop_sales_transactions (gift_shop_id, customer_id, employee_id, total_amount, payment_method, sale_date, status)
       VALUES (?, ?, NULL, ?, ?, ?, 'completed')`,
      [giftShopId, customerId, totalAmount, paymentMethod, currentDateTime]
    );

    const transactionId = transactionResult.insertId;

    // Create sale item
    await connection.execute(
      `INSERT INTO gift_shop_sale_items (transaction_id, item_id, quantity, unit_price)
       VALUES (?, ?, ?, ?)`,
      [transactionId, item.item_id, item.quantity, item.unit_price]
    );

    // Deplete stock - reduce quantity_in_stock by purchased quantity
    // This is atomic in MySQL and prevents race conditions
    await connection.execute(
      `UPDATE gift_shop_items SET quantity_in_stock = quantity_in_stock - ? WHERE item_id = ? AND quantity_in_stock >= ?`,
      [item.quantity, item.item_id, item.quantity]
    );

    // Verify the update was successful (in case another customer bought the last item)
    const [updatedResults] = await connection.execute(
      `SELECT quantity_in_stock FROM gift_shop_items WHERE item_id = ?`,
      [item.item_id]
    );
    const updatedItem = updatedResults[0];

    if (updatedItem.quantity_in_stock < 0) {
      throw new Error(`"${itemData.name}" sold out - unable to complete purchase. Please remove from cart and try again.`);
    }
  }

  /**
   * Create donation record
   */
  private static async createDonation(
    item: CheckoutCartItem,
    customerId: number,
    paymentMethod: 'credit' | 'debit',
    connection: any
  ): Promise<void> {
    const metadata = item.metadata || {};
    const currentDateTime = getCurrentDateTime();

    await connection.execute(
      `INSERT INTO donations (customer_id, amount, donation_date, message, payment_method)
       VALUES (?, ?, ?, ?, ?)`,
      [customerId, item.unit_price, currentDateTime, metadata.donation_message || null, paymentMethod]
    );
  }

  /**
   * Create membership purchase record
   */
  private static async createMembership(
    item: CheckoutCartItem,
    customerId: number,
    paymentMethod: 'credit' | 'debit',
    connection: any
  ): Promise<void> {
    const metadata = item.metadata || {};
    const membershipPrice = 149.00; // Individual membership price
    let paymentMethodId: number | null = null;

    // Check if customer already has an active membership
    const [membershipResults] = await connection.execute(
      `SELECT membership_end_date, annual_pass
       FROM customers
       WHERE customer_id = ? AND annual_pass = 'yes' AND membership_end_date >= CURDATE()`,
      [customerId]
    );
    const existingMembership = membershipResults[0];

    if (existingMembership) {
      // Check if membership expires within 30 days
      const [dateCheckResults] = await connection.execute(
        `SELECT DATEDIFF(membership_end_date, CURDATE()) as days_until_expiry
         FROM customers
         WHERE customer_id = ?`,
        [customerId]
      );
      const dateCheck = dateCheckResults[0];

      const daysUntilExpiry = dateCheck?.days_until_expiry || 0;

      if (daysUntilExpiry > 30) {
        throw new Error(`You already have an active membership that expires in ${daysUntilExpiry} days. You can only renew your membership within 30 days of expiration.`);
      }
    }

    // SECURITY: Payment method storage disabled - no card data will be saved
    // Auto-renewal disabled until payment gateway integration (Stripe/Braintree)
    console.log('[MEMBERSHIP] Payment method storage disabled for security');

    // Calculate membership dates (start today, end 1 year from today)
    const [dateResults] = await connection.execute(
      'SELECT CURDATE() as start_date, DATE_ADD(CURDATE(), INTERVAL 1 YEAR) as end_date'
    );
    const dateResult = dateResults[0];
    const actualStartDate = dateResult?.start_date;
    const actualEndDate = dateResult?.end_date;

    // SECURITY: Auto-renewal disabled until payment gateway integration
    // Requires secure tokenized payment method storage (Stripe/Braintree)
    const autoRenew = false;

    // Update customer membership
    await connection.execute(
      `UPDATE customers
       SET annual_pass = 'yes',
           membership_start_date = CURDATE(),
           membership_end_date = DATE_ADD(CURDATE(), INTERVAL 1 YEAR),
           membership_auto_renew = ?
       WHERE customer_id = ?`,
      [autoRenew, customerId]
    );

    // Record purchase in history table
    const currentDateTime = getCurrentDateTime();
    await connection.execute(
      `INSERT INTO membership_purchases
       (customer_id, purchase_date, start_date, end_date, price, payment_method, payment_method_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customerId, currentDateTime, actualStartDate, actualEndDate, membershipPrice, paymentMethod, paymentMethodId]
    );
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

