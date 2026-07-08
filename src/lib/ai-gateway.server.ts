import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Minimal Lovable AI Gateway provider for TanStack Start server code.
 * Reads LOVABLE_API_KEY inside server handlers only.
 */
export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}
