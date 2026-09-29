import { query, pickColumns } from '../config/database';
import { Event, EventWithDetails } from '../types/event.types';

export class EventModel {
  // current_registrations: participants on live (not deleted, not refunded) registrations
  private static readonly SELECT_EVENTS = `
    SELECT e.*, emp.first_name || ' ' || emp.last_name as coordinator_name,
           (SELECT COALESCE(SUM(er.number_of_participants), 0)
            FROM event_registrations er
            WHERE er.event_id = e.event_id AND er.deleted_at IS NULL AND er.refunded_at IS NULL) as current_registrations
    FROM events e
    LEFT JOIN employees emp ON e.coordinator_id = emp.employee_id`;

  static async findAll(): Promise<EventWithDetails[]> {
    const sql = `${this.SELECT_EVENTS}
      WHERE e.deleted_at IS NULL
      ORDER BY e.event_date DESC`;
    return await query<EventWithDetails[]>(sql);
  }

  static async findAllIncludingDeleted(): Promise<EventWithDetails[]> {
    const sql = `${this.SELECT_EVENTS}
      ORDER BY e.event_date DESC`;
    return await query<EventWithDetails[]>(sql);
  }

  static async create(eventData: Omit<Event, 'event_id'>): Promise<Event> {
    eventData = pickColumns('events', eventData) as typeof eventData;
    const { name, description, event_date, start_time, end_time, location, max_participants, ticket_price, image_url, coordinator_id } = eventData;
    const sql = 'INSERT INTO events (name, description, event_date, start_time, end_time, location, max_participants, ticket_price, image_url, coordinator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    const result = await query<any>(sql, [name, description, event_date, start_time, end_time, location, max_participants, ticket_price, image_url || null, coordinator_id]);
    return (await this.findById(result.insertId)) as Event;
  }

  static async findById(eventId: number): Promise<Event | null> {
    const sql = `${this.SELECT_EVENTS}
      WHERE e.event_id = ? AND e.deleted_at IS NULL`;
    const results = await query<Event[]>(sql, [eventId]);
    return results.length > 0 ? results[0] : null;
  }

  static async update(eventId: number, eventData: Partial<Event>): Promise<Event | null> {
    eventData = pickColumns('events', eventData) as typeof eventData;
    if (Object.keys(eventData).length === 0) return await this.findById(eventId);

    const setClause = Object.keys(eventData).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(eventData), eventId];

    const sql = `UPDATE events SET ${setClause} WHERE event_id = ?`;
    await query(sql, values);
    return await this.findById(eventId);
  }

  static async remove(eventId: number): Promise<boolean> {
    // Soft delete the event by setting deleted_at timestamp
    // The database trigger 'trigger_event_cancellation' will automatically:
    // 1. Create notifications for all registered customers
    // 2. Mark all event registrations as refunded

    const sql = 'UPDATE events SET deleted_at = NOW() WHERE event_id = ? AND deleted_at IS NULL';
    const result = await query<any>(sql, [eventId]);

    if (result.affectedRows > 0) {
      console.log(`[Event Cancellation] Event ${eventId} cancelled. Trigger will create notifications and process refunds.`);
    } else {
      console.warn(`Event ${eventId} not found or already deleted`);
    }

    return result.affectedRows > 0;
  }

  static async restore(eventId: number): Promise<Event | null> {
    const sql = 'UPDATE events SET deleted_at = NULL WHERE event_id = ?';
    await query(sql, [eventId]);
    return await this.findById(eventId);
  }
}
