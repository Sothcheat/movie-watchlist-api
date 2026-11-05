import type { Request } from 'express';
import { clientIp } from './client-ip.js';

const req = (headers: Record<string, string>, ip = '76.76.21.1') =>
  ({ headers, ip }) as unknown as Request;

describe('clientIp', () => {
  describe('behind Vercel', () => {
    it('takes the first entry of x-vercel-forwarded-for', () => {
      expect(
        clientIp(
          req({ 'x-vercel-forwarded-for': '203.0.113.7, 76.76.21.9' }),
          true,
        ),
      ).toBe('203.0.113.7');
    });

    it('falls back to x-real-ip, then to req.ip', () => {
      expect(clientIp(req({ 'x-real-ip': '203.0.113.8' }), true)).toBe(
        '203.0.113.8',
      );
      expect(clientIp(req({}), true)).toBe('76.76.21.1');
    });

    it('groups IPv6 visitors by /64, like the throttler does', () => {
      expect(
        clientIp(
          req({ 'x-vercel-forwarded-for': '2001:db8:1:2:aaaa:bbbb:cccc:dddd' }),
          true,
        ),
      ).toBe('2001:db8:1:2::/64');
    });
  });

  it('ignores the forwarding headers when the origin lock is off', () => {
    expect(
      clientIp(req({ 'x-vercel-forwarded-for': '203.0.113.7' }), false),
    ).toBe('76.76.21.1');
  });
});
