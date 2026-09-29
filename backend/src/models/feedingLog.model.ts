import { query, pickColumns } from '../config/database';
import { FeedingLog, FeedingLogWithKeeper, CreateFeedingLogInput, UpdateFeedingLogInput, FeedingLogFilters } from '../types/feedingLog.types';

export class FeedingLogModel {
  static async findAll(filters?: FeedingLogFilters): Promise<FeedingLogWithKeeper[]> {
    let sql = `
      SELECT
        fl.*,
        e.first_name || ' ' || e.last_name as keeper_name,
        a.name as animal_name
      FROM feeding_logs fl
      LEFT JOIN employees e ON fl.keeper_id = e.employee_id
      LEFT JOIN animals a ON fl.animal_id = a.animal_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.animalId) {
      sql += ' AND fl.animal_id = ?';
      params.push(filters.animalId);
    }

    if (filters?.keeperId) {
      sql += ' AND fl.keeper_id = ?';
      params.push(filters.keeperId);
    }

    if (filters?.startDate) {
      sql += ' AND fl.feeding_time >= ?';
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      // A bare 'YYYY-MM-DD' end date includes that whole day
      sql += /^\d{4}-\d{2}-\d{2}$/.test(filters.endDate)
        ? " AND fl.feeding_time < date(?, '+1 day')"
        : ' AND fl.feeding_time <= ?';
      params.push(filters.endDate);
    }

    sql += ' ORDER BY fl.feeding_time DESC';

    return await query<FeedingLogWithKeeper[]>(sql, params);
  }

  static async findByAnimalId(animalId: number, limit?: number): Promise<FeedingLogWithKeeper[]> {
    let sql = `
      SELECT
        fl.*,
        e.first_name || ' ' || e.last_name as keeper_name,
        a.name as animal_name
      FROM feeding_logs fl
      LEFT JOIN employees e ON fl.keeper_id = e.employee_id
      LEFT JOIN animals a ON fl.animal_id = a.animal_id
      WHERE fl.animal_id = ?
      ORDER BY fl.feeding_time DESC
    `;

    const params: any[] = [animalId];
    if (limit && Number.isInteger(limit) && limit > 0) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    return await query<FeedingLogWithKeeper[]>(sql, params);
  }

  static async findById(id: number): Promise<FeedingLogWithKeeper | null> {
    const sql = `
      SELECT
        fl.*,
        e.first_name || ' ' || e.last_name as keeper_name,
        a.name as animal_name
      FROM feeding_logs fl
      LEFT JOIN employees e ON fl.keeper_id = e.employee_id
      LEFT JOIN animals a ON fl.animal_id = a.animal_id
      WHERE fl.log_id = ?
    `;
    const results = await query<FeedingLogWithKeeper[]>(sql, [id]);
    return results.length > 0 ? results[0] : null;
  }

  static async create(log: CreateFeedingLogInput): Promise<FeedingLog> {
    log = pickColumns('feeding_logs', log) as typeof log;
    // If feeding_time is not provided, it will use CURRENT_TIMESTAMP as default
    const columns = Object.keys(log).join(', ');
    const placeholders = Object.keys(log).map(() => '?').join(', ');
    const values = Object.values(log);

    const sql = `INSERT INTO feeding_logs (${columns}) VALUES (${placeholders})`;
    const result = await query<any>(sql, values);

    // Return the created log
    const created = await this.findById(result.insertId);
    return created as FeedingLog;
  }

  static async update(id: number, updates: UpdateFeedingLogInput): Promise<FeedingLogWithKeeper | null> {
    updates = pickColumns('feeding_logs', updates) as typeof updates;
    if (Object.keys(updates).length === 0) return await this.findById(id);

    const setClause = Object.keys(updates)
      .map(key => `${key} = ?`)
      .join(', ');

    if (setClause.length === 0) {
      return await this.findById(id);
    }

    const values = Object.values(updates);
    const sql = `UPDATE feeding_logs SET ${setClause} WHERE log_id = ?`;
    await query(sql, [...values, id]);
    return await this.findById(id);
  }

  static async delete(id: number): Promise<void> {
    const sql = 'DELETE FROM feeding_logs WHERE log_id = ?';
    await query(sql, [id]);
  }
}
