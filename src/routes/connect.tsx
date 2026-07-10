import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Check, ExternalLink, Loader2, AlertCircle, CheckCircle2, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type TestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; toolCount: number; serverName?: string }
  | { status: "error"; title: string; detail: string };


function ConnectPage() {
  const [mcpUrl, setMcpUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMcpUrl(new URL("/mcp", window.location.origin).toString());
  }, []);

  async function copy() {
    if (!mcpUrl) return;
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    </div>
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
