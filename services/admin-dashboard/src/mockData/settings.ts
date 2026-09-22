import type { PlatformSettings } from '../types';

export const defaultSettings: PlatformSettings = {
  platformFee: 5,
  aiImagePrice: 15,
  cancellationWindowHours: 2,
  otpExpiryMinutes: 15,
  otpResendCooldownMinutes: 2,
  currency: 'BDT',
  currencySymbol: '৳',
  autoVerifyBusinesses: false,
  smsEnabled: true,
  emailEnabled: false,
  aiModel: 'eureka-hair-v3',
  aiMaxConcurrent: 24,
  aiTimeoutSeconds: 45,
  aiRateLimitPerHour: 60,
  notificationTypes: {
    'Booking approved': true,
    'Booking declined': true,
    'Booking reminder': true,
    'Payment receipt': true,
    'Payment reminder': false,
    'OTP verification': true,
    'Subscription renewal': true,
  },
  verificationDocs: {
    'Trade licence': true,
    'National ID of owner': true,
    'Shop photo (exterior)': true,
    'TIN certificate': false,
    'Bank / MFS payout account': true,
  },
};

export const SUBSCRIPTION_TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    features: ['Browse salons and barbers', 'Book appointments', '3 AI try-ons per month'],
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 199,
    features: ['Everything in Free', '30 AI try-ons per month', 'Priority booking slots', 'Booking history export'],
  },
  {
    id: 'advanced',
    name: 'Advanced',
    price: 499,
    featured: true,
    features: [
      'Everything in Basic',
      'Unlimited AI hairstyle generation',
      'Highest-resolution renders',
      'Early access to new styles',
    ],
  },
] as const;

export const AI_MODELS = ['eureka-hair-v3', 'eureka-hair-v2', 'eureka-hair-lite'] as const;
