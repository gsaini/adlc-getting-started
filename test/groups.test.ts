// Requirement: Create a group · Requirement: Read a group (tasks 3.1, 3.2)
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, ISO_8601, problemPaths } from "./helpers";

const countGroups = async () =>
	(await env.DB.prepare("SELECT COUNT(*) AS n FROM groups").first<{ n: number }>())?.n ?? 0;

describe("Create a group", () => {
	it("Valid group", async () => {
		const res = await api("POST", "/groups", {
			name: " Lisbon trip ",
			members: ["Asha", "Ben", "Chen"],
		});
		expect(res.status).toBe(201);
		expect(res.json).toMatchObject({ name: "Lisbon trip", members: ["Asha", "Ben", "Chen"] });
		expect(res.json?.id).toEqual(expect.any(String));
		expect(res.json?.id).not.toBe("");
		expect(res.json?.createdAt).toMatch(ISO_8601);
		expect(Object.keys(res.json ?? {}).sort()).toEqual(["createdAt", "id", "members", "name"]);
	});

	it("keeps members trimmed and in the order given", async () => {
		const res = await api("POST", "/groups", { name: "x", members: [" Zoe ", "adam"] });
		expect(res.json?.members).toEqual(["Zoe", "adam"]);
	});

	it.each([
		["1 member", ["Asha"]],
		["21 members", Array.from({ length: 21 }, (_, i) => `m${i}`)],
	])("Too few or too many members: %s", async (_label, members) => {
		const res = await api("POST", "/groups", { name: "x", members });
		expect(res.status).toBe(400);
		expect(res.json).toMatchObject({ title: "Validation failed", status: 400 });
		expect(problemPaths(res.json)).toContain("members");
	});

	it("accepts exactly 2 and exactly 20 members", async () => {
		expect((await api("POST", "/groups", { name: "x", members: ["A", "B"] })).status).toBe(201);
		const twenty = Array.from({ length: 20 }, (_, i) => `m${i}`);
		expect((await api("POST", "/groups", { name: "x", members: twenty })).status).toBe(201);
	});

	it("Duplicate member names", async () => {
		const res = await api("POST", "/groups", { name: "x", members: ["Ben", " ben ", "Asha"] });
		expect(res.status).toBe(400);
		expect(res.json).toMatchObject({ title: "Validation failed", status: 400 });
		expect(problemPaths(res.json)).toContain("members");
		expect(await countGroups()).toBe(0);
	});

	it.each([
		["empty name", { name: "   ", members: ["A", "B"] }, "name"],
		["81-character name", { name: "x".repeat(81), members: ["A", "B"] }, "name"],
		["blank member", { name: "x", members: ["A", "   "] }, "members.1"],
		["41-character member", { name: "x", members: ["x".repeat(41), "B"] }, "members.0"],
	])("Blank or overlong names: %s", async (_label, body, path) => {
		const res = await api("POST", "/groups", body);
		expect(res.status).toBe(400);
		expect(res.json).toMatchObject({ title: "Validation failed", status: 400 });
		expect(problemPaths(res.json)).toContain(path);
		expect(await countGroups()).toBe(0);
	});

	it("treats the same name in composed and decomposed Unicode as a duplicate", async () => {
		const composed = "Jos\u00e9"; // é as one code point
		const decomposed = "Jose\u0301"; // e + combining acute accent
		const res = await api("POST", "/groups", { name: "x", members: [composed, decomposed] });
		expect(res.status).toBe(400);
		expect(problemPaths(res.json)).toContain("members");
	});

	it("accepts an 80-character name and 40-character members", async () => {
		const res = await api("POST", "/groups", {
			name: "x".repeat(80),
			members: ["y".repeat(40), "B"],
		});
		expect(res.status).toBe(201);
	});

	it("rejects a body that is not an object", async () => {
		const res = await api("POST", "/groups", [1, 2, 3]);
		expect(res.status).toBe(400);
		expect(res.json).toMatchObject({ title: "Validation failed" });
	});
});

describe("Read a group", () => {
	it("Existing group", async () => {
		const created = await api("POST", "/groups", { name: "Flat", members: ["Asha", "Ben"] });
		const res = await api("GET", `/groups/${created.json?.id}`);
		expect(res.status).toBe(200);
		expect(res.json).toEqual(created.json);
	});

	it("Unknown group", async () => {
		const res = await api("GET", "/groups/does-not-exist");
		expect(res.status).toBe(404);
		expect(res.json).toMatchObject({ title: "Group not found", status: 404 });
	});
});
