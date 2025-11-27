/**
 * Notification Email Job
 *
 * Scheduled job that runs periodically to process pending email notifications.
 * Uses node-cron to schedule the job.
 *
 * Schedule: Every 5 minutes
 */

import cron from 'node-cron';
import { NotificationEmailService } from '../services/notification-email.service';

// Control job logging verbosity
const ENABLE_EMAIL_LOGGING = process.env.ENABLE_EMAIL_LOGGING === 'true';

/**
 * Start the notification email job
 */
export function startNotificationEmailJob(): void {
  // Run every 8 seconds
  const schedule = '*/8 * * * * *';

  console.log('[Notification Email Job] ✅ Job scheduled (every 8 seconds)');

  cron.schedule(schedule, async () => {
    if (ENABLE_EMAIL_LOGGING) {
      console.log(`[${new Date().toISOString()}] Running notification email job...`);
    }

    try {
      await NotificationEmailService.processPendingEmails();
    } catch (error) {
      console.error('[Notification Email Job] Job failed:', error);
    }
  });
}

/**
 * Manually trigger the email job (for testing)
 */
export async function runNotificationEmailJobNow(): Promise<void> {
  if (ENABLE_EMAIL_LOGGING) {
    console.log('[Notification Email Job] Manual trigger...');
  }

  try {
    await NotificationEmailService.processPendingEmails();
    if (ENABLE_EMAIL_LOGGING) {
      console.log('[Notification Email Job] ✅ Manual trigger completed.');
    }
  } catch (error) {
    console.error('[Notification Email Job] ❌ Manual trigger failed:', error);
    throw error;
  }
}
