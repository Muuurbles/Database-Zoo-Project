/**
 * Prices that aren't stored in the database. Checkout charges these, never the price the browser
 * sends. Keep them in step with TICKET_PRICES in frontend/src/app/tickets/page.tsx and
 * MEMBERSHIP_PLANS in frontend/src/app/membership/page.tsx, which are what customers are shown.
 */
export const TICKET_PRICES = {
  adult: 45.0,
  child: 30.0,
  senior: 35.0,
  student: 38.0,
} as const;

export type TicketType = keyof typeof TICKET_PRICES;

export const MEMBERSHIP_PRICE = 149.0;
