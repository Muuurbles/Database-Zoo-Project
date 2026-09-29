import { query, pickColumns } from '../config/database';
import { Attraction } from '../types/attraction.types';

export class AttractionModel {
  static async findAll(): Promise<Attraction[]> {
    const sql = 'SELECT * FROM attractions WHERE deleted_at IS NULL';
    return await query<Attraction[]>(sql);
  }

  static async findById(id: number): Promise<Attraction | null> {
    const sql = 'SELECT * FROM attractions WHERE attraction_id = ? AND deleted_at IS NULL';
    const results = await query<Attraction[]>(sql, [id]);
    return results.length > 0 ? results[0] : null;
  }

  static async create(attraction: Omit<Attraction, 'attraction_id'>): Promise<Attraction> {
    attraction = pickColumns('attractions', attraction) as typeof attraction;
    const fields = Object.entries(attraction).filter(([, value]) => value !== undefined);
    const columns = fields.map(([key]) => key).join(', ');
    const placeholders = fields.map(() => '?').join(', ');

    const sql = `INSERT INTO attractions (${columns}) VALUES (${placeholders})`;
    const result = await query<any>(sql, fields.map(([, value]) => value));
    return { attraction_id: result.insertId, ...attraction };
  }

  static async update(id: number, updates: Partial<Attraction>): Promise<Attraction | null> {
    updates = pickColumns('attractions', updates) as typeof updates;
    if (Object.keys(updates).length === 0) return await this.findById(id);

    const fields = Object.entries(updates).filter(([, value]) => value !== undefined);
    if (fields.length === 0) {
      return await this.findById(id);
    }

    const setClause = fields.map(([key]) => `${key} = ?`).join(', ');
    const sql = `UPDATE attractions SET ${setClause} WHERE attraction_id = ?`;
    await query(sql, [...fields.map(([, value]) => value), id]);
    return await this.findById(id);
  }

  static async remove(id: number): Promise<void> {
    const sql = 'UPDATE attractions SET deleted_at = NOW() WHERE attraction_id = ?';
    await query(sql, [id]);
  }
}
