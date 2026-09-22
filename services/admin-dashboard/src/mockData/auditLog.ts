import type { AuditLogEntry } from '../types';
import { isoHoursAgo, pick, randomInt } from './base';

const ADMINS = ['Farhana Ahmed', 'Sabbir Khan', 'Mehjabin Haque', 'system'];
const IPS = ['103.120.44.18', '103.120.44.22', '45.126.9.101', '10.0.4.7'];

interface Seed {
  actionType: AuditLogEntry['actionType'];
  resourceType: string;
  resourceId: string;
  details: string;
  status?: 'success' | 'failed';
  before?: string;
  after?: string;
}

const SEEDS: Seed[] = [
  { actionType: 'approve', resourceType: 'Business', resourceId: 'BIZ-206', details: 'Verified Style Deck after trade licence review', before: 'pending', after: 'verified' },
  { actionType: 'suspend', resourceType: 'User', resourceId: 'USR-1042', details: 'Suspended Nusrat Jahan for repeated no-shows', before: 'active', after: 'suspended' },
  { actionType: 'update', resourceType: 'Settings', resourceId: 'platform-fee', details: 'Changed platform fee per booking', before: '৳4', after: '৳5' },
  { actionType: 'reject', resourceType: 'Review', resourceId: 'MOD-498', details: 'Removed abusive review on Rafiq’s Chair', before: 'visible', after: 'removed' },
  { actionType: 'create', resourceType: 'Hairstyle', resourceId: 'HS-114', details: 'Added “Mehndi party waves” to the catalogue' },
  { actionType: 'update', resourceType: 'Hairstyle', resourceId: 'HS-113', details: 'Deactivated “Ash grey highlights” — low success rate', before: 'active', after: 'inactive' },
  { actionType: 'approve', resourceType: 'Booking', resourceId: 'BKG-3014', details: 'Manually approved booking on behalf of Bindiya Salon', before: 'pending', after: 'approved' },
  { actionType: 'update', resourceType: 'Settings', resourceId: 'ai-model', details: 'Switched image model', before: 'eureka-hair-v2', after: 'eureka-hair-v3' },
  { actionType: 'delete', resourceType: 'Service', resourceId: 'SVC-094', details: 'Removed duplicate “Hair spa” service', status: 'success' },
  { actionType: 'update', resourceType: 'Business', resourceId: 'BIZ-214', details: 'Payout account update rejected by provider', status: 'failed' },
  { actionType: 'login', resourceType: 'Session', resourceId: 'admin', details: 'Admin sign-in from a new device' },
  { actionType: 'create', resourceType: 'Notification', resourceId: 'TPL-03', details: 'Created appointment reminder template' },
  { actionType: 'reject', resourceType: 'Business', resourceId: 'BIZ-218', details: 'Rejected verification — address did not match licence', before: 'pending', after: 'rejected' },
  { actionType: 'update', resourceType: 'User', resourceId: 'USR-1067', details: 'Reset phone verification and reissued OTP' },
  { actionType: 'approve', resourceType: 'Photo', resourceId: 'MOD-499', details: 'Kept portfolio photo after owner confirmation', before: 'flagged', after: 'visible' },
  { actionType: 'update', resourceType: 'Settings', resourceId: 'cancellation-window', details: 'Adjusted cancellation window', before: '3 hours', after: '2 hours' },
  { actionType: 'delete', resourceType: 'User', resourceId: 'USR-1108', details: 'Deleted duplicate customer account' },
  { actionType: 'update', resourceType: 'Booking', resourceId: 'BKG-3022', details: 'Refund issued for cancelled booking' },
];

export const mockAuditLog: AuditLogEntry[] = SEEDS.map((seed, index) => ({
  id: `LOG-${String(8001 + index)}`,
  timestamp: isoHoursAgo(index * randomInt(3, 9) + 1),
  adminUser: pick(ADMINS),
  actionType: seed.actionType,
  resourceType: seed.resourceType,
  resourceId: seed.resourceId,
  details: seed.details,
  status: seed.status ?? 'success',
  ipAddress: pick(IPS),
  before: seed.before,
  after: seed.after,
}));
