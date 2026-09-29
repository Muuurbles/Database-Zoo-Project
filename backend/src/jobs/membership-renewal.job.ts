import cron from 'node-cron';
import { MembershipRenewalService } from '../services/membership-renewal.service';

async function renewMemberships(): Promise<void> {
  try {
    const renewed = await MembershipRenewalService.renewExpiringMemberships();
    if (renewed > 0) {
      console.log(`[Membership Renewal Job] Renewed ${renewed} membership(s)`);
    }
  } catch (error) {
    console.error('[Membership Renewal Job] Job failed:', error);
  }
}

/**
 * Start the membership auto-renewal job.
 *
 * This used to be a MySQL EVENT that ran inside the database server. The database is now an
 * embedded SQLite file with no scheduler of its own, so the backend runs it: daily at midnight
 * (the app's UTC-6 clock), and once on startup to catch up if the server was down at midnight.
 */
export function startMembershipRenewalJob(): void {
  console.log('[Membership Renewal Job] ✅ Job scheduled (daily at midnight)');

  cron.schedule('0 0 * * *', renewMemberships, { timezone: 'Etc/GMT+6' });

  void renewMemberships();
}
