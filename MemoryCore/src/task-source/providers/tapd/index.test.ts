
import { afterEach, describe, expect, it, vi } from "vitest";
import { tapdProvider } from "./index.js";
import type { TaskSourceContext } from "../../types.js";

const ctx: TaskSourceContext = {
  cred: { kind: "bearer", secret: "test-token" },
  endpoint: "https://tapd.test/mcp",
  siteBaseUrl: "https://tapd.test",
};

function makeRows(type: string, ids: number[]) {
  return ids.map((id) => ({
    id: `${type}-${id}`,
    name: `${type} item ${id}`,
    title: `${type} item ${id}`,
    status: "new",
  }));
}

function mockTapdFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      const { tool_name, tool_args } = request.params.arguments;
      const { page = 1, limit = 2 } = tool_args;

      let result: unknown;

      if (tool_name === "tapd_field_detail_get") {
        result = { status: { options: {} } };
      } else {
        const type =
          tool_name === "stories_get"
            ? "story"
            : tool_name === "tasks_get"
              ? "task"
              : "bug";

        const allRows =
          type === "story"
            ? makeRows(type, [1, 2])
            : makeRows(type, [1, 2, 3, 4]);

        const start = (Number(page) - 1) * Number(limit);
        result = {
          count: allRows.length,
          data: allRows.slice(start, start + Number(limit)),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: {
            content: [{ type: "text", text: JSON.stringify(result) }],
          },
        }),
      } as Response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TAPD listCandidates pagination", () => {
  it("does not skip the first task records on the next combined page", async () => {
    mockTapdFetch();

    const firstPage = await tapdProvider.listCandidates(ctx, {
      scope: "123",
      itemTypes: ["story", "task", "bug"],
      page: 1,
      limit: 2,
    });

    const secondPage = await tapdProvider.listCandidates(ctx, {
      scope: "123",
      itemTypes: ["story", "task", "bug"],
      page: 2,
      limit: 2,
    });
    const thirdPage = await tapdProvider.listCandidates(ctx, {
      scope: "123",
      itemTypes: ["story", "task", "bug"],
      page: 3,
      limit: 2,
    });

    const fifthPage = await tapdProvider.listCandidates(ctx, {
      scope: "123",
      itemTypes: ["story", "task", "bug"],
      page: 5,
      limit: 2,
    });
    expect(firstPage.items.map((item) => item.externalId)).toEqual([
      "story-1",
      "story-2",
    ]);

    expect(secondPage.items.map((item) => item.externalId)).toEqual([
      "task-1",
      "task-2",
    ]);
    expect(thirdPage.items.map((item) => item.externalId)).toEqual([
      "task-3",
      "task-4",
    ]);

    expect(fifthPage.items.map((item) => item.externalId)).toEqual([
      "bug-3",
      "bug-4",
    ]);

    expect(fifthPage.hasMore).toBe(false);
  });
});
