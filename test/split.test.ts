// Task 2.1 — equal splits in whole cents.
import { describe, expect, it } from "vitest";
import { splitEqually } from "../src/split";

describe("splitEqually", () => {
	it("splits evenly when the amount divides", () => {
		expect(splitEqually(9000, ["Asha", "Ben", "Chen"])).toEqual([
			{ member: "Asha", cents: 3000 },
			{ member: "Ben", cents: 3000 },
			{ member: "Chen", cents: 3000 },
		]);
	});

	it("gives leftover cents to the first participants", () => {
		expect(splitEqually(1000, ["Asha", "Ben", "Chen"]).map((s) => s.cents)).toEqual([
			334, 333, 333,
		]);
		expect(splitEqually(1001, ["Asha", "Chen"]).map((s) => s.cents)).toEqual([501, 500]);
		expect(splitEqually(2, ["A", "B", "C"]).map((s) => s.cents)).toEqual([1, 1, 0]);
	});

	it("never loses or invents a cent, and shares differ by at most one (property)", () => {
		let seed = 42; // deterministic pseudo-random, so a failure is reproducible
		const next = () => {
			seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
			return seed;
		};
		for (let run = 0; run < 2000; run++) {
			const amount = 1 + (next() % 10_000_000);
			const people = Array.from({ length: 1 + (next() % 20) }, (_, i) => `m${i}`);
			const shares = splitEqually(amount, people).map((s) => s.cents);
			expect(shares.reduce((a, b) => a + b, 0)).toBe(amount);
			expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
			expect(shares).toEqual([...shares].sort((a, b) => b - a)); // extra cents go first
		}
	});

	it("refuses inputs that could not come from a valid expense", () => {
		expect(() => splitEqually(100, [])).toThrow(RangeError);
		expect(() => splitEqually(12.5, ["A"])).toThrow(RangeError);
		expect(() => splitEqually(-1, ["A"])).toThrow(RangeError);
	});
});
