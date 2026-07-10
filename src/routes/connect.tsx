import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Copy,
  Check,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle2,
  PlugZap,
  Trash2,
  Plus,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentOrg } from "@/hooks/use-current-org";
import {
  createOrgMcpServer,
  deleteOrgMcpServer,
  listOrgMcpServers,
  type OrgMcpServer,
} from "@/lib/org-mcp-servers.functions";

type TestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; toolCount: number; serverName?: string }
  | { status: "error"; title: string; detail: string };

/**
 * Probe an MCP endpoint with an `initialize` JSON-RPC call and classify the
 * response. A 401 with WWW-Authenticate is treated as success (OAuth-protected
 * endpoint reachable). Any hard error is surfaced with an actionable message.
 */
async function probeMcpServer(rawUrl: string): Promise<TestState> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      status: "error",
      title: "Invalid URL",
      detail: "That doesn't look like a valid URL.",
    };
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    return {
      status: "error",
      title: "Insecure URL",
      detail: "MCP clients require an https:// endpoint.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(rawUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "aqari-connect-test", version: "1.0.0" },
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const msg =
      (err as Error).name === "AbortError"
        ? "The server didn't respond within 10 seconds."
        : "Couldn't reach the MCP server. Check the URL and your network.";
    return { status: "error", title: "Network error", detail: msg };
  }
  clearTimeout(timer);

  if (res.status === 401 || res.status === 403) {
    if (res.headers.get("www-authenticate")) {
      return {
        status: "ok",
        toolCount: 0,
        serverName: "MCP endpoint reachable — OAuth required (this is expected).",
      };
    }
    return {
      status: "error",
      title: "Authorization failed",
      detail: `Server returned ${res.status} without an OAuth challenge.`,
    };
  }
  if (res.status === 404) {
    return {
      status: "error",
      title: "MCP endpoint not found",
      detail: "The server returned 404. Check that the URL points at a live MCP endpoint.",
    };
  }
  if (res.status === 406) {
    return {
      status: "error",
      title: "Protocol mismatch",
      detail: "Server rejected the Accept header. The endpoint may not implement MCP.",
    };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      status: "error",
      title: `Server error ${res.status}`,
      detail: body.slice(0, 200) || `The server responded with HTTP ${res.status}.`,
    };
  }
  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  let payloadText = raw;
  if (contentType.includes("text/event-stream")) {
    const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
    payloadText = dataLine ? dataLine.slice(5).trim() : raw;
  }
  let parsedBody: {
    result?: { serverInfo?: { name?: string } };
    error?: { message?: string };
  };
  try {
    parsedBody = JSON.parse(payloadText);
  } catch {
    return {
      status: "error",
      title: "Invalid response",
      detail: "The server responded but the body wasn't valid JSON-RPC.",
    };
  }
  if (parsedBody.error) {
    return {
      status: "error",
      title: "MCP error",
      detail: parsedBody.error.message ?? "Server returned a JSON-RPC error.",
    };
  }
  return {
    status: "ok",
    toolCount: 0,
    serverName: parsedBody.result?.serverInfo?.name ?? "MCP server responded successfully.",
  };
}



function ConnectPage() {
  const [mcpUrl, setMcpUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });

  useEffect(() => {
    setMcpUrl(new URL("/mcp", window.location.origin).toString());
  }, []);

  async function copy() {
    if (!mcpUrl) return;
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function runTest() {
    if (!mcpUrl) return;
    setTest({ status: "running" });
    setTest(await probeMcpServer(mcpUrl));
  }



  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Connect an AI assistant</h1>
        <p className="mt-2 text-muted-foreground">
          Connect ChatGPT or Claude to Aqari so your assistant can work with your properties,
          tenants, and expenses on your behalf.
        </p>
      </header>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Your MCP server URL</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="flex-1 truncate rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              {mcpUrl || "…"}
            </code>
            <Button onClick={copy} disabled={!mcpUrl} className="shrink-0">
              {copied ? (
                <>
                  <Check className="h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy URL
                </>
              )}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            The assistant signs in with your Aqari account and acts as you. It only sees data
            you'd see when signed in.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={runTest}
              disabled={!mcpUrl || test.status === "running"}
              className="w-fit"
            >
              {test.status === "running" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Testing…
                </>
              ) : (
                <>
                  <PlugZap className="h-4 w-4" /> Test connection
                </>
              )}
            </Button>

            {test.status === "ok" && (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle>Connection successful</AlertTitle>
                <AlertDescription>{test.serverName}</AlertDescription>
              </Alert>
            )}
            {test.status === "error" && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{test.title}</AlertTitle>
                <AlertDescription>{test.detail}</AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Connect ChatGPT</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal space-y-2 ps-5">
            <li>
              Open{" "}
              <a
                href="https://chatgpt.com/#settings/Connectors/Advanced"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline"
              >
                ChatGPT Connector settings <ExternalLink className="h-3 w-3" />
              </a>{" "}
              and enable <strong>Developer mode</strong> (read the risk notice shown there).
            </li>
            <li>
              In the chat composer, open the <strong>+</strong> menu and turn on Developer mode.
            </li>
            <li>
              Click <strong>Add sources</strong>, then <strong>Connect more</strong>.
            </li>
            <li>Give the connector a name (e.g. "Aqari") and paste the MCP URL above.</li>
            <li>Sign in with your Aqari account and approve the connection.</li>
            <li>Ask ChatGPT something like "List my properties in Aqari".</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connect Claude</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal space-y-2 ps-5">
            <li>
              Open{" "}
              <a
                href="https://claude.ai/customize/connectors?modal=add-custom-connector"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline"
              >
                Claude's Add custom connector page <ExternalLink className="h-3 w-3" />
              </a>
              .
            </li>
            <li>Give the connector a name (e.g. "Aqari") and paste the MCP URL above.</li>
            <li>Sign in with your Aqari account and approve the connection.</li>
            <li>
              Enable the connector from the chat composer, then ask Claude to use Aqari.
            </li>
          </ol>
        </CardContent>
      </Card>

      <SavedServersCard />
    </div>
  );
}

function SavedServersCard() {
  const { orgId, role, ready } = useCurrentOrg();
  const qc = useQueryClient();
  const canEdit = role === "owner" || role === "admin";

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [tests, setTests] = useState<Record<string, TestState>>({});

  const servers = useQuery({
    queryKey: ["org-mcp-servers", orgId],
    queryFn: () => listOrgMcpServers({ data: { orgId: orgId! } }),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: (input: { name: string; url: string }) =>
      createOrgMcpServer({ data: { orgId: orgId!, name: input.name, url: input.url } }),
    onSuccess: () => {
      toast.success("MCP server saved");
      setName("");
      setUrl("");
      qc.invalidateQueries({ queryKey: ["org-mcp-servers", orgId] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteOrgMcpServer({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["org-mcp-servers", orgId] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  async function testOne(server: OrgMcpServer) {
    setTests((t) => ({ ...t, [server.id]: { status: "running" } }));
    const result = await probeMcpServer(server.url);
    setTests((t) => ({ ...t, [server.id]: result }));
  }

  if (!ready) return null;
  if (!orgId) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Saved MCP servers</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Sign in to save and share external MCP servers with your organization.
        </CardContent>
      </Card>
    );
  }

  const list = servers.data ?? [];

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Saved MCP servers for your organization</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Save external MCP servers (e.g. third-party assistants) so everyone in your
          organization can find and test them from here.
        </p>

        {servers.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved servers yet.</p>
        ) : (
          <ul className="space-y-3">
            {list.map((s) => {
              const t = tests[s.id] ?? { status: "idle" as const };
              return (
                <li key={s.id} className="rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{s.name}</div>
                      <code className="mt-1 block truncate text-xs text-muted-foreground">
                        {s.url}
                      </code>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(s.url);
                          toast.success("URL copied");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => testOne(s)}
                        disabled={t.status === "running"}
                      >
                        {t.status === "running" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <PlugZap className="h-3.5 w-3.5" />
                        )}
                        Test
                      </Button>
                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Remove "${s.name}"?`)) deleteMut.mutate(s.id);
                          }}
                          disabled={deleteMut.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {t.status === "ok" && (
                    <Alert className="mt-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertTitle>Reachable</AlertTitle>
                      <AlertDescription>{t.serverName}</AlertDescription>
                    </Alert>
                  )}
                  {t.status === "error" && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>{t.title}</AlertTitle>
                      <AlertDescription>{t.detail}</AlertDescription>
                    </Alert>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit ? (
          <form
            className="space-y-3 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim() || !url.trim()) return;
              createMut.mutate({ name: name.trim(), url: url.trim() });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <div className="space-y-1">
                <Label htmlFor="mcp-name">Name</Label>
                <Input
                  id="mcp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Linear MCP"
                  maxLength={80}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mcp-url">URL</Label>
                <Input
                  id="mcp-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/mcp"
                  inputMode="url"
                />
              </div>
            </div>
            <Button type="submit" disabled={createMut.isPending || !name.trim() || !url.trim()}>
              {createMut.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Add server
                </>
              )}
            </Button>
          </form>
        ) : (
          <p className="border-t pt-4 text-xs text-muted-foreground">
            Only organization owners and admins can add or remove saved servers.
          </p>
        )}
      </CardContent>
    </Card>
  );
}


export const Route = createFileRoute("/connect")({
  head: () => ({
    meta: [
      { title: "Connect an AI assistant — Aqari" },
      {
        name: "description",
        content:
          "Connect ChatGPT or Claude to your Aqari account so your AI assistant can manage properties, tenants, and expenses on your behalf.",
      },
      { property: "og:title", content: "Connect an AI assistant to Aqari" },
      {
        property: "og:description",
        content: "Step-by-step instructions to connect ChatGPT or Claude to Aqari via MCP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConnectPage,
});
