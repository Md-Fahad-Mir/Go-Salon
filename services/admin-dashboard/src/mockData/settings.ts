import type { PlatformSettings } from '../types';

export const defaultSettings: PlatformSettings = {
  platformFee: 5,
  otpExpiryMinutes: 15,
  otpResendCooldownMinutes: 2,
  smsEnabled: true,
  emailEnabled: false,
};
