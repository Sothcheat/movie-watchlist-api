import { normalizeIp } from '@nestjs/throttler';
import type { Request } from 'express';

/** Vercel sets this to the visitor's IP and overwrites any value the client sent. */
const VERCEL_FORWARDED_FOR = 'x-vercel-forwarded-for';
const REAL_IP = 'x-real-ip';

const firstValue = (header: string | string[] | undefined) =>
  (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim() ||
  undefined;

/**
 * The rate-limit key for a request. Behind the Vercel proxy, req.ip is a Vercel address shared
 * by many visitors, so the visitor's IP comes from Vercel's headers. Those are only trusted
 * when the origin lock is on, as it guarantees every request came through Vercel.
 */
export function clientIp(req: Request, behindVercel: boolean): string {
  const ip = behindVercel
    ? (firstValue(req.headers[VERCEL_FORWARDED_FOR]) ??
      firstValue(req.headers[REAL_IP]) ??
      req.ip)
    : req.ip;
  // Groups IPv6 addresses by /64, as the throttler's own tracker does.
  return normalizeIp(ip ?? '');
}
