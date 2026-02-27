/**
 * Auction Price Resolution — Second-Price Sealed-Bid Algorithm
 *
 * Pure functions with no DB access. Ported from HypeTrainFF's pricing.ts.
 */

export interface ProxyBidSnapshot {
  rosterId: number;
  maxBid: number;
}

export interface OutbidNotification {
  rosterId: number;
  lotId: string;
  previousBid: number;
  newLeadingBid: number;
}

export interface PriceResolutionInput {
  lotId: string;
  currentBid: number;
  currentBidderRosterId: number | null;
  proxyBids: ProxyBidSnapshot[]; // sorted: highest maxBid first, earliest first for ties
  minBid: number;
  minIncrement: number;
}

export interface PriceResolutionOutput {
  newLeader: number;
  newPrice: number;
  leaderChanged: boolean;
  priceChanged: boolean;
  newBidCount: number;
  outbidNotifications: OutbidNotification[];
}

/**
 * Resolve auction price using second-price sealed-bid rules.
 *
 * - Highest bidder wins at second-highest + minIncrement (capped at their max)
 * - Single bidder: wins at max(currentBid, minBid)
 * - Monotonic guard: resolved price never decreases below currentBid
 * - Returns null if no bids
 */
export function resolveSecondPrice(
  input: PriceResolutionInput,
  currentBidCount: number,
): PriceResolutionOutput | null {
  const { proxyBids, currentBid, currentBidderRosterId, lotId, minBid, minIncrement } = input;

  if (proxyBids.length === 0) return null;

  const previousLeader = currentBidderRosterId;
  let newLeader: number;
  let newPrice: number;

  if (proxyBids.length === 1) {
    newLeader = proxyBids[0].rosterId;
    newPrice = Math.max(currentBid ?? minBid, minBid);
  } else {
    const highest = proxyBids[0];
    const secondHighest = proxyBids[1];
    newLeader = highest.rosterId;
    newPrice = Math.min(highest.maxBid, secondHighest.maxBid + minIncrement);
  }

  // Monotonic guard
  newPrice = Math.max(newPrice, currentBid ?? 0);

  const leaderChanged = newLeader !== previousLeader;
  const priceChanged = newPrice !== currentBid;

  const outbidNotifications: OutbidNotification[] = [];
  if (leaderChanged && previousLeader) {
    outbidNotifications.push({
      rosterId: previousLeader,
      lotId,
      previousBid: currentBid,
      newLeadingBid: newPrice,
    });
  }

  const newBidCount = priceChanged ? currentBidCount + 1 : currentBidCount;

  return {
    newLeader,
    newPrice,
    leaderChanged,
    priceChanged,
    newBidCount,
    outbidNotifications,
  };
}

/**
 * Compute whether to extend a lot's deadline on leader change.
 * Only extends, never shortens.
 */
export function computeExtendedDeadline(
  now: Date,
  currentDeadline: Date,
  bidWindowSeconds: number,
): { shouldExtend: boolean; newDeadline: Date } {
  const newDeadline = new Date(now.getTime() + bidWindowSeconds * 1000);
  const shouldExtend = newDeadline > currentDeadline;
  return {
    shouldExtend,
    newDeadline: shouldExtend ? newDeadline : currentDeadline,
  };
}
