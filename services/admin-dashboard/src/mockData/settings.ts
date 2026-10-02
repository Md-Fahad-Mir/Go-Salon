import type { PlatformSettings, SubscriptionTierPlan } from '../types';

export const defaultSettings: PlatformSettings = {
  platformFee: 5,
  aiImagePrice: 15,
  otpExpiryMinutes: 15,
  otpResendCooldownMinutes: 2,
  smsEnabled: true,
  emailEnabled: false,
  aiModel: 'gosalon-hair-v3',
  aiMaxConcurrent: 24,
  aiTimeoutSeconds: 45,
  aiRateLimitPerHour: 60,
};

export const SUBSCRIPTION_TIERS: SubscriptionTierPlan[] = [
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
];

export const AI_MODELS = ['gosalon-hair-v3', 'gosalon-hair-v2', 'gosalon-hair-lite'] as const;
