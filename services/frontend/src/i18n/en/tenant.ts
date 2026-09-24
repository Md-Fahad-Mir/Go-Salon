/* Joining a salon — the screen a shop's QR code opens. */

export const tenant = {
  'tenant.joiningTitle': 'Adding you to the salon',
  'tenant.joiningBody': 'This only takes a moment.',
  'tenant.joinedTitle': 'You’re in',
  'tenant.joinedBody': '{name} is on your list of salons now.',
  'tenant.joinedAction': 'Start booking',
  'tenant.errInvalidTitle': 'That code is not valid',
  'tenant.errInvalidBody': 'The salon may have printed a new one. Ask at the counter for the current code.',
  'tenant.errNotCustomerTitle': 'This account cannot join a salon',
  'tenant.errNotCustomerBody': 'Only a customer account keeps a list of salons. Sign in with your customer account to join this one.',
  'tenant.signInTitle': 'Sign in to join',
  'tenant.signInBody': 'We will bring you straight back here.',

  /* The switcher, in Settings. */
  'tenant.switchTitle': 'Salon',
  'tenant.switchHint': 'Which salon the app is showing you.',
  'tenant.switchActive': 'Showing now',
  'tenant.errListTitle': 'We could not load your salons',
  'tenant.errListBody': 'The app is still showing the last list it had.',

  /* Leaving a salon. Soft on the server, so the copy says what survives. */
  'tenant.manage': 'Remove a salon',
  'tenant.manageTitle': 'Remove which salon?',
  'tenant.removeTitle': 'Remove {name}?',
  'tenant.removeBody': 'It comes off your salon list. Your bookings and reviews there stay, and scanning the shop’s code again puts it back.',
  'tenant.removed': '{name} is off your list',
  'tenant.errRemove': 'We could not remove that salon. Try again in a moment.',

  /* Home: the salons you can book at. */
  'tenant.homeTitle': 'Your salons',
  'tenant.homeHint': 'Tap one to book.',
  'tenant.homeEmptyTitle': 'No salons yet',
  'tenant.homeEmptyBody': 'Scan the QR code in a salon to add it here. Ask at the counter — every salon on Eureka has one.',
  'tenant.bookAt': 'Book at {name}',

  /* The shop's own QR code, on the owner's salon screen. */
  'tenant.qrTitle': 'Your QR code',
  'tenant.qrHint': 'Customers scan this to add your salon. Print it and keep it where they can reach it — the counter, the mirror, the door.',
  'tenant.qrAlt': 'The QR code customers scan to add your salon',
  'tenant.qrSave': 'Save the image',
  'tenant.qrSaved': 'Saved to your device',
  'tenant.qrErrTitle': 'We could not load your code',
  'tenant.qrRegenerate': 'Make a new code',
  'tenant.qrRegenerateTitle': 'Make a new code?',
  'tenant.qrRegenerateBody': 'Every printed copy of your current code stops working the moment you do this. Anyone who scans one will be told it is not valid, and you will need to print and put up the new one everywhere the old one is. Customers who have already joined stay joined.',
  /* Distinct from the button that opens the dialog, so the two are never the
     same accessible name on screen at once — the same split F4b uses between
     "Remove a salon" and "Remove". */
  'tenant.qrRegenerateConfirm': 'Replace the code',
  'tenant.qrRegenerated': 'Your new code is ready',
  'tenant.qrRegenerateFailed': 'We could not make a new code. Your current one still works.',
} as const;
