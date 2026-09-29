/**
 * Event Cancellation Log Model
 *
 * There is no log table: an event is "cancelled" when it is soft-deleted (deleted_at set), and
 * trigger_event_cancellation (zoo_schema.sql) then notifies registrants and marks their
 * registrations refunded. The logs are derived from those rows.
 */

import { query } from '../config/database';

export interface EventCancellationLog {
  log_id: number;
  event_id: number;
  event_name: string;
  event_date: string;
  cancelled_at: string;
  cancelled_by: string;
  total_registrations: number;
  customers_notified: number;
  refunds_needed: number;
}

export class EventCancellationLogModel {
  // One row per cancelled event. log_id is the event_id, so it stays stable across requests.
  private static readonly CANCELLATIONS_SQL = `
    SELECT
      e.event_id as log_id,
      e.event_id,
      e.name as event_name,
      e.event_date,
      e.deleted_at as cancelled_at,
      'System' as cancelled_by,
      COUNT(er.registration_id) as total_registrations,
      COUNT(CASE WHEN er.refunded_at IS NOT NULL THEN 1 END) as customers_notified,
      COALESCE(SUM(CASE WHEN er.refunded_at IS NOT NULL THEN er.total_amount ELSE 0 END), 0) as refunds_needed
    FROM events e
    LEFT JOIN event_registrations er ON e.event_id = er.event_id AND er.deleted_at IS NULL
    WHERE e.deleted_at IS NOT NULL`;

  private static readonly GROUP_BY = `GROUP BY e.event_id, e.name, e.event_date, e.deleted_at`;

  /**
   * Get all event cancellation logs, ordered by most recent first
   */
  static async findAll(limit: number = 10): Promise<EventCancellationLog[]> {
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 10;
    return query<EventCancellationLog[]>(
      `${this.CANCELLATIONS_SQL}
      ${this.GROUP_BY}
      ORDER BY e.deleted_at DESC
      LIMIT ?`,
      [safeLimit]
    );
  }

  /**
   * Get a specific cancellation log by ID (the cancelled event's ID)
   */
  static async findById(logId: number): Promise<EventCancellationLog | null> {
    const logs = await query<EventCancellationLog[]>(
      `${this.CANCELLATIONS_SQL} AND e.event_id = ?
      ${this.GROUP_BY}`,
      [logId]
    );

    return logs[0] || null;
  }

  /**
   * Get cancellation logs for a specific event
   */
  static async findByEventId(eventId: number): Promise<EventCancellationLog[]> {
    return query<EventCancellationLog[]>(
      `${this.CANCELLATIONS_SQL} AND e.event_id = ?
      ${this.GROUP_BY}
      ORDER BY e.deleted_at DESC`,
      [eventId]
    );
  }

  /**
   * Get cancellation statistics (summary)
   */
  static async getStatistics(): Promise<{
    total_cancellations: number;
    total_customers_affected: number;
    total_refunds_needed: number;
    recent_cancellations_24h: number;
  }> {
    const result = await query<any[]>(
      `SELECT
        COUNT(*) as total_cancellations,
        COALESCE(SUM(customers_notified), 0) as total_customers_affected,
        COALESCE(SUM(refunds_needed), 0) as total_refunds_needed,
        COALESCE(SUM(CASE WHEN cancelled_at >= datetime(NOW(), '-24 hours') THEN 1 ELSE 0 END), 0) as recent_cancellations_24h
      FROM (
        ${this.CANCELLATIONS_SQL}
        ${this.GROUP_BY}
      )`
    );

    return result[0] as any;
  }
}
