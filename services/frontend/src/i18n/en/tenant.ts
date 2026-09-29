/* Joining a salon — the screen a shop's QR code opens. */

export const tenant = {
  'tenant.joiningTitle': 'Adding you to the salon',
  'tenant.joiningBody': 'This only takes a moment.',
  'tenant.joinedTitle': 'You’re in',
  'tenant.joinedBody': '{name} is on your list of salons now.',
  'tenant.joinedAction': 'Open the salon',
  'tenant.errInvalidTitle': 'That code is not valid',
  'tenant.errInvalidBody': 'The salon may have printed a new one. Ask at the counter for the current code.',
  'tenant.errNotCustomerTitle': 'This account cannot join a salon',
  'tenant.errNotCustomerBody': 'Only a customer account keeps a list of salons. Sign in with your customer account to join this one.',
  'tenant.signInTitle': 'Sign in to join',
  'tenant.signInBody': 'We will bring you straight back here.',

  /* The switcher, in Settings. */
  'tenant.switchTitle': 'Salon',
  'tenant.switchHint': 'Which salon the app is showing you.',
  /* The header's own switcher, on Home — its icon-button label and its
     sheet's title. */
  'tenant.switchAction': 'Switch salon',
  'tenant.switchTap': 'Tap to switch',
  'tenant.switchActive': 'Showing now',
  'tenant.errListTitle': 'We could not load your salons',
  'tenant.errListBody': 'The app is still showing the last list it had.',

  /* Leaving a salon. Soft on the server, so the copy says what survives. */
  'tenant.manage': 'Remove a salon',
  'tenant.manageTitle': 'Remove which salon?',
  'tenant.removeTitle': 'Remove {name}?',
  'tenant.removeBody': 'It comes off your salon list. Your bookings there stay, and scanning the shop’s code again puts it back.',
  'tenant.removed': '{name} is off your list',
  'tenant.errRemove': 'We could not remove that salon. Try again in a moment.',

  /* Home. `homeTitle`, `homeHint` and `bookAt` are `YourSalons`'s and leave
     with it in FR3. The rest are the new Home's: the salon you are in, the way
     to one, or — after a fresh sign-in with several — which one you mean. */
  'tenant.homeTitle': 'Your salons',
  'tenant.homeHint': 'Tap one to book.',
  'tenant.homeEmptyTitle': 'No salons yet',
  'tenant.homeEmptyBody': 'Scan the QR code in a salon to add it here. Ask at the counter — every salon on Go Salon has one.',
  'tenant.homeEmptyAction': 'Scan a salon’s QR code',
  'tenant.homePickTitle': 'Which salon are you visiting?',
  'tenant.homePickBody': 'Tap one to open it. You can switch any time from the salon icon at the top.',
  'tenant.bookAt': 'Book at {name}',

  /* The in-app scanner. */
  'tenant.scanTitle': 'Add a salon',
  'tenant.scanHint': 'Point your camera at the salon’s QR code.',
  'tenant.scanAddSalon': 'Add a salon',
  /* The second line under "Add a salon" in the header's salon switcher. */
  'tenant.scanRow': 'Scan a salon’s QR code',
  'tenant.scanCameraLabel': 'Camera, looking for a salon’s QR code',
  'tenant.scanStarting': 'Opening the camera…',
  'tenant.scanNotOurs': 'That is not a salon code. Try the one on the counter.',
  'tenant.scanDeniedTitle': 'The camera is switched off',
  'tenant.scanDeniedBody': 'Allow camera access in your browser settings, then come back. You can also scan the code with your phone’s own camera app — it opens the salon straight away.',
  'tenant.scanUnsupportedTitle': 'This browser cannot open the camera',
  'tenant.scanUnsupportedBody': 'Scan the code with your phone’s own camera app instead — it opens the salon straight away.',

  /* The offer to add the app to the home screen — on the join journey only,
     for somebody who scanned a code in a browser. `installIosSteps` names
     Safari's own menu items, with their icons dropped in. */
  'tenant.installTitle': 'Get the Go Salon app',
  'tenant.installBody': 'Add it to your home screen and this salon is one tap away next time — no app store needed.',
  'tenant.installAction': 'Install',
  'tenant.installIosSteps': 'Tap {share} Share, then {add} Add to Home Screen.',
  'tenant.installDismiss': 'Not now',

  /* The shop's own QR code, on the owner's salon screen. */
  'tenant.qrTitle': 'Your QR code',
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
