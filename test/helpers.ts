import { exports } from "cloudflare:workers";

export type Json = Record<string, unknown>;

/** Call the Worker in-process, the way a client would over HTTP. */
export async function api(method: string, path: string, body?: unknown, headers: HeadersInit = {}) {
	const init: RequestInit = { method, headers: { ...headers } };
	if (body !== undefined) {
		init.body = typeof body === "string" ? body : JSON.stringify(body);
		(init.headers as Record<string, string>)["content-type"] = "application/json";
	}
	const res = await exports.default.fetch(`https://split.test${path}`, init);
	const text = await res.text();
	const json = text ? (JSON.parse(text) as Json) : null;
	return { status: res.status, contentType: res.headers.get("content-type") ?? "", json };
}

export async function createGroup(members = ["Asha", "Ben", "Chen"], name = "Lisbon trip") {
	const res = await api("POST", "/groups", { name, members });
	if (res.status !== 201) throw new Error(`createGroup failed: ${JSON.stringify(res)}`);
	return res.json as { id: string; name: string; members: string[]; createdAt: string };
}

export async function addExpense(groupId: string, body: Json) {
	return api("POST", `/groups/${groupId}/expenses`, body);
}

export function problemPaths(json: Json | null): string[] {
	return ((json?.errors as { path: string }[] | undefined) ?? []).map((e) => e.path);
}

export const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
