import { query, pickColumns } from '../config/database';

export interface Notification {
  notification_id?: number;
  customer_id: number;
  message: string;
  notification_type?: 'info' | 'warning' | 'alert';
  is_read?: boolean;
  created_at?: string;
}

export interface NotificationOwner {
  customerId?: number | null;
  employeeId?: number | null;
}

export class NotificationModel {
  static async findByCustomerId(customerId: number, unreadOnly: boolean = false): Promise<Notification[]> {
    let sql = 'SELECT * FROM notifications WHERE customer_id = ?';
    const params: any[] = [customerId];

    if (unreadOnly) {
      sql += ' AND is_read = FALSE';
    }

    sql += ' ORDER BY created_at DESC';

    console.log('[NOTIFICATIONS DB] Executing query:', sql);
    console.log('[NOTIFICATIONS DB] Parameters:', params);

    const results = await query<Notification[]>(sql, params);
    console.log('[NOTIFICATIONS DB] Query returned', results.length, 'rows');

    return results;
  }

  static async findByEmployeeId(employeeId: number, unreadOnly: boolean = false): Promise<Notification[]> {
    // FIXED: Changed 'employ' to 'employee_id'
    let sql = 'SELECT * FROM notifications WHERE employee_id = ?';
    const params: any[] = [employeeId];

    if (unreadOnly) {
      sql += ' AND is_read = FALSE';
    }

    sql += ' ORDER BY created_at DESC';

    console.log('[NOTIFICATIONS DB] Executing query:', sql);
    console.log('[NOTIFICATIONS DB] Parameters:', params);

    const results = await query<Notification[]>(sql, params);
    console.log('[NOTIFICATIONS DB] Query returned', results.length, 'rows');

    return results;
  }

  // Owner-scoped: only touches the notification if it belongs to this customer or employee
  static async markAsRead(notificationId: number, owner: NotificationOwner): Promise<void> {
    const sql = 'UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND (customer_id = ? OR employee_id = ?)';
    await query(sql, [notificationId, owner.customerId ?? null, owner.employeeId ?? null]);
  }

  static async markAllAsReadForCustomer(customerId: number): Promise<void> {
    const sql = 'UPDATE notifications SET is_read = TRUE WHERE customer_id = ? AND is_read = FALSE';
    await query(sql, [customerId]);
  }

  static async markAllAsReadForEmployee(employeeId: number): Promise<void> {
    const sql = 'UPDATE notifications SET is_read = TRUE WHERE employee_id = ? AND is_read = FALSE';
    await query(sql, [employeeId]);
  }

  static async create(notification: Omit<Notification, 'notification_id' | 'created_at'>): Promise<Notification> {
    notification = pickColumns('notifications', notification) as typeof notification;
    const columns = Object.keys(notification).join(', ');
    const placeholders = Object.keys(notification).map(() => '?').join(', ');
    const values = Object.values(notification);

    const sql = `INSERT INTO notifications (${columns}) VALUES (${placeholders})`;
    const result = await query<any>(sql, values);
    return { notification_id: result.insertId, ...notification };
  }

  static async delete(notificationId: number, owner: NotificationOwner): Promise<void> {
    const sql = 'DELETE FROM notifications WHERE notification_id = ? AND (customer_id = ? OR employee_id = ?)';
    await query(sql, [notificationId, owner.customerId ?? null, owner.employeeId ?? null]);
  }

  static async deleteByCustomerIdAndType(customerId: number, type: string): Promise<void> {
    const sql = 'DELETE FROM notifications WHERE customer_id = ? AND notification_type = ?';
    await query(sql, [customerId, type]);
  }

  static async deleteByEmployeeIdAndType(employeeId: number, type: string): Promise<void> {
    const sql = 'DELETE FROM notifications WHERE employee_id = ? AND notification_type = ?';
    await query(sql, [employeeId, type]);
  }

  static async getUnreadCount(customerId: number): Promise<number> {
    const sql = 'SELECT COUNT(*) as count FROM notifications WHERE customer_id = ? AND is_read = FALSE';
    const results = await query<any[]>(sql, [customerId]);
    return results[0]?.count || 0;
  }

  static async getUnreadCountForEmployee(employeeId: number): Promise<number> {
    const sql = 'SELECT COUNT(*) as count FROM notifications WHERE employee_id = ? AND is_read = FALSE';
    const results = await query<any[]>(sql, [employeeId]);
    return results[0]?.count || 0;
  }
}
