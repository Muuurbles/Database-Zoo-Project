import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Date formatting utilities
export function formatDateForInput(date: string | undefined | null): string {
  if (!date) return '';
  // Extract just the date part (YYYY-MM-DD) from datetime strings
  return date.split('T')[0];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

// Format a Date as 'YYYY-MM-DD' using local date parts (not toISOString(), which is UTC)
export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// Today's date as 'YYYY-MM-DD' in the browser's local time
export function todayLocalDateString(): string {
  return toLocalDateString(new Date());
}

// Convert an ISO instant to a local 'YYYY-MM-DDTHH:mm' value for <input type="datetime-local">
export function toLocalDateTimeInput(value: string | Date | undefined | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  return `${toLocalDateString(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// Percentage of part in total, formatted with 1 decimal; 0.0 when total is 0/invalid (avoids NaN%)
export function formatPercent(part: number | string, total: number | string): string {
  const p = parseFloat(String(part));
  const t = parseFloat(String(total));
  if (!t || !isFinite(t) || !isFinite(p)) return (0).toFixed(1);
  return ((p / t) * 100).toFixed(1);
}

// TODO: Add utility functions for currency formatting

// TODO: Add utility functions for time formatting
