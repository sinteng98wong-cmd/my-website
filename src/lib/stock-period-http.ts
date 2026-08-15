/**
 * HTTP mapping for the period lock.
 *
 * Kept apart from lib/stock-period so that module — which lib/stock-ledger
 * imports on the hot posting path — stays free of next/server.
 *
 * Every route that can post a stock movement wraps its handler in
 * `withPeriodLock`. A locked period surfaces as a 409 with the clinic and
 * period named, rather than an unhandled throw and a 500.
 */
import { NextResponse } from "next/server";
import { isPeriodLockedError } from "./stock-period";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withPeriodLock<A extends any[]>(
  handler: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (e) {
      if (isPeriodLockedError(e)) {
        return NextResponse.json(
          { error: e.message, clinicId: e.clinicId, period: e.period, code: "PERIOD_LOCKED" },
          { status: 409 }
        );
      }
      throw e;
    }
  };
}
