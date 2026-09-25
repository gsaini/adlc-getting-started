// Requirement: Health check · Requirement: Error responses (tasks 1.2, 3.1)
import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { api, createGroup } from "./helpers";

const DOCS = "https://github.com/gsaini/adlc-getting-started/blob/main/docs/problems.md";

async function countGroups() {
	const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM groups").first<{ n: number }>();
	return row?.n ?? 0;
}

describe("Health check", () => {
	it("Service is up", async () => {
		const res = await api("GET", "/health");
		expect(res.status).toBe(200);
		expect(res.json).toEqual({ status: "ok" });
	});
});

describe("Error responses", () => {
	it("Malformed JSON", async () => {
		const res = await api("POST", "/groups", '{"name":');
		expect(res.status).toBe(400);
		expect(res.contentType).toContain("application/problem+json");
		expect(res.json).toMatchObject({
			type: `${DOCS}#malformed-json`,
			title: "Malformed JSON",
			status: 400,
		});
		expect(await countGroups()).toBe(0);
	});

	it("Oversized body (with Content-Length)", async () => {
		const res = await api("POST", "/groups", { name: "x".repeat(17_000), members: ["A", "B"] });
		expect(res.status).toBe(413);
		expect(res.json).toMatchObject({
			type: `${DOCS}#payload-too-large`,
			title: "Payload too large",
			status: 413,
		});
		expect(await countGroups()).toBe(0);
	});

	it("Oversized body (streamed, no Content-Length)", async () => {
		const chunk = new TextEncoder().encode("x".repeat(4096));
		let sent = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (sent++ < 5)
					controller.enqueue(chunk); // 20,480 bytes in total
				else controller.close();
			},
		});
		const res = await exports.default.fetch("https://split.test/groups", {
			method: "POST",
			headers: { "content-type": "application/json", "transfer-encoding": "chunked" },
			body,
			// @ts-expect-error: `duplex` is required for streamed request bodies but missing from RequestInit
			duplex: "half",
		});
		expect(res.status).toBe(413);
		expect(await countGroups()).toBe(0);
	});

	it("A body just under the limit is accepted", async () => {
		const res = await api("POST", "/groups", {
			name: "ok",
			members: ["A", "B"],
			pad: "x".repeat(16_000),
		});
		expect(res.status).toBe(201);
	});

	it("Unknown route", async () => {
		const res = await api("GET", "/nope");
		expect(res.status).toBe(404);
		expect(res.contentType).toContain("application/problem+json");
		expect(res.json).toMatchObject({ type: `${DOCS}#not-found`, title: "Not found", status: 404 });
	});

	it("Unknown route wins over a bad body", async () => {
		const res = await api("POST", "/nope", "{");
		expect(res.status).toBe(404);
		expect(res.json).toMatchObject({ title: "Not found" });
	});

	it("Wrong method on a known path", async () => {
		const group = await createGroup();
		const res = await api("DELETE", `/groups/${group.id}`);
		expect(res.status).toBe(404);
		expect(res.json).toMatchObject({ title: "Not found" });
		expect((await api("GET", `/groups/${group.id}`)).status).toBe(200);
	});

	it("Validation runs before the group lookup", async () => {
		const res = await api("POST", "/groups/does-not-exist/expenses", { payer: "", amountCents: 0 });
		expect(res.status).toBe(400);
		expect(res.json).toMatchObject({ title: "Validation failed" });
	});
});
