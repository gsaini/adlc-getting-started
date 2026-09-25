export type Share = { member: string; cents: number };

/**
 * Split an amount equally in whole cents. Leftover cents go one each to the
 * first participants, so the shares always sum exactly to the amount and the
 * same input always gives the same split. `participants` must already be in
 * group member order.
 */
export function splitEqually(amountCents: number, participants: readonly string[]): Share[] {
	if (!Number.isInteger(amountCents) || amountCents < 0) {
		throw new RangeError(`amountCents must be a non-negative integer, got ${amountCents}`);
	}
	if (participants.length === 0) throw new RangeError("at least one participant is required");

	const base = Math.floor(amountCents / participants.length);
	const leftover = amountCents - base * participants.length;
	return participants.map((member, i) => ({ member, cents: base + (i < leftover ? 1 : 0) }));
}
