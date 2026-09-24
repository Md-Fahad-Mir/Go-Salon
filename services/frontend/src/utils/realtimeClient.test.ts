// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://192.168.1.50:5174/pro/salon/profile" }

/* Where the booking socket is opened.

   Under jsdom, and at a LAN address on purpose: this is the case that broke.
   The page is served to a phone from the Mac's address, and the socket has to
   go back to the same origin so the Vite proxy can forward it. A wrong URL
   here fails silently — the dashboards simply stop updating, with nothing on
   screen to say so — which is why it is pinned rather than trusted. */

import { describe, expect, it } from 'vitest';
import { socketUrl } from './realtimeClient';

describe('socketUrl', () => {
  it('follows the page origin when the API base is relative', () => {
    // No host is written down anywhere: whatever served the page serves the
    // socket, so a new DHCP lease changes nothing.
    expect(socketUrl('/api')).toBe('ws://192.168.1.50:5174/ws/bookings/');
  });

  it('still honours an absolute base, for a deployed build', () => {
    expect(socketUrl('https://api.gosalon.com/api')).toBe('wss://api.gosalon.com/ws/bookings/');
  });

  it('upgrades to wss when the base is https', () => {
    expect(socketUrl('https://api.gosalon.com/api')).toMatch(/^wss:/);
  });

  it('drops any query string the base carried', () => {
    expect(socketUrl('https://api.gosalon.com/api?v=2')).toBe(
      'wss://api.gosalon.com/ws/bookings/',
    );
  });
});
