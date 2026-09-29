import { Notification, NotificationModel, NotificationOwner } from '../models/notification.model';

export class NotificationService {
  static async getNotifications(customerId: number, unreadOnly: boolean = false): Promise<Notification[]> {
    return await NotificationModel.findByCustomerId(customerId, unreadOnly);
  }

  // ✅ GOOD
  static async getNotificationsForEmployee(employeeId: number, unreadOnly: boolean = false): Promise<Notification[]> {
    return await NotificationModel.findByEmployeeId(employeeId, unreadOnly);
  }

  static async markAsRead(notificationId: number, owner: NotificationOwner): Promise<void> {
    return await NotificationModel.markAsRead(notificationId, owner);
  }

  static async markAllAsRead(customerId: number): Promise<void> {
    return await NotificationModel.markAllAsReadForCustomer(customerId);
  }
    // 🚩 FIXED: Changed parameter to employeeId and call the correct Model method
  static async markAllAsReadForEmployee(employeeId: number): Promise<void> {
    // You will need to ensure this method exists in your Model!
    return await NotificationModel.markAllAsReadForEmployee(employeeId);
  }

  static async createNotification(notification: Omit<Notification, 'notification_id' | 'created_at'>): Promise<Notification> {
    return await NotificationModel.create(notification);
  }

  static async deleteNotification(notificationId: number, owner: NotificationOwner): Promise<void> {
    return await NotificationModel.delete(notificationId, owner);
  }

  static async deleteByCustomerIdAndType(customerId: number, type: string): Promise<void> {
    return await NotificationModel.deleteByCustomerIdAndType(customerId, type);
  }

  // 🚩 FIXED: Called deleteByEmployeeIdAndType on the Model (was calling Customer version)
  static async deleteByEmployeeIdAndType(employeeId: number, type: string): Promise<void> {
    // You will need to ensure this method exists in your Model!
    return await NotificationModel.deleteByEmployeeIdAndType(employeeId, type);
  }

  static async getUnreadCount(customerId: number): Promise<number> {
    return await NotificationModel.getUnreadCount(customerId);
  }

  // 🚩 FIXED: Explicitly calling the Employee version in the Model to avoid ID collision
  static async getUnreadCountForEmployee(employeeId: number): Promise<number> {
    // You will need to ensure this method exists in your Model!
    return await NotificationModel.getUnreadCountForEmployee(employeeId);
  }
}