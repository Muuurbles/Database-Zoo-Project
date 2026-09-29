export type QueryResult<T> = T;
export type QueryResults<T> = Array<T>;

/** Result of an INSERT/UPDATE/DELETE, shaped like the mysql2 `ResultSetHeader` the models were written against. */
export interface MutationResult {
  affectedRows: number;
  changedRows: number;
  insertId: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
