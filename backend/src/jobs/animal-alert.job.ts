import cron from 'node-cron';
import { AnimalAlertService } from '../services/animal-alert.service';

// Control job logging verbosity
const ENABLE_EMAIL_LOGGING = process.env.ENABLE_EMAIL_LOGGING === 'true';

/**
 * Start the animal alert email job
 */
export function startAnimalAlertEmailJob(): void {
  // Run every 8 seconds
  const schedule = '*/8 * * * * *';
  const batchSize = 5;

  console.log('[Animal Alert Email Job] ✅ Job scheduled (every 8 seconds)');

  cron.schedule(schedule, async () => {
    if (ENABLE_EMAIL_LOGGING) {
      console.log(`[${new Date().toISOString()}] Running animal alert email job...`);
    }

    try {
      await AnimalAlertService.processAnimalAlerts(batchSize);
    } catch (error) {
      console.error('[Animal Alert Email Job] Job failed:', error);
    }
  });
}

/**
 * Manually trigger the email job (for testing)
 */
export async function runAnimalAlertEmailJobNow(): Promise<void> {
  if (ENABLE_EMAIL_LOGGING) {
    console.log('[Animal Alert Email Job] Manual trigger...');
  }

  try {
    await AnimalAlertService.processAnimalAlerts();
    if (ENABLE_EMAIL_LOGGING) {
      console.log('[Animal Alert Email Job] ✅ Manual trigger completed.');
    }
  } catch (error) {
    console.error('[Animal Alert Email Job] ❌ Manual trigger failed:', error);
    throw error;
  }
}
