import { t as tNewUi } from "@/i18n";
/** Presentation metadata only. Each provider will have its own catalog entry and connection. */
export type RemoteMcpProviderId = "zapier" | "arcade" | "composio" | "executor";

export interface RemoteMcpProvider {
  id: RemoteMcpProviderId;
  name: string;
  description: string;
  instructions: string[];
  setupUrl: string;
  dashboardUrl: string;
  defaultUrl: string;
  placeholder: string;
  urlHelp: string;
  authHelp: string;
  supportsBrowserAuth: boolean;
}

export const remoteMcpProviders: Record<RemoteMcpProviderId, RemoteMcpProvider> = {
  zapier: {
    id: "zapier", name: "Zapier", supportsBrowserAuth: false,
    description: tNewUi("newUi.k81a62210baa3"),
    instructions: [tNewUi("newUi.kf8dd03857996"), tNewUi("newUi.k463fabddad3b"), tNewUi("newUi.k0614c0bfac44")],
    setupUrl: "https://docs.zapier.com/mcp/get-started/connect/other",
    dashboardUrl: "https://mcp.zapier.com",
    defaultUrl: "", placeholder: tNewUi("newUi.k2b71b0cfafae"),
    urlHelp: tNewUi("newUi.kda7245ce04d8"),
    authHelp: tNewUi("newUi.k8bf657567b31"),
  },
  arcade: {
    id: "arcade", name: "Arcade", supportsBrowserAuth: true,
    description: tNewUi("newUi.k081210c35308"),
    instructions: [tNewUi("newUi.kdae765f3b90f"), tNewUi("newUi.k3cae618cbab6"), tNewUi("newUi.k165e251aea8e")],
    setupUrl: "https://docs.arcade.dev/en/operate/governance/mcp-gateways",
    dashboardUrl: "https://app.arcade.dev",
    defaultUrl: "", placeholder: "https://api.arcade.dev/mcp/your-gateway",
    urlHelp: tNewUi("newUi.k5de222ab9163"),
    authHelp: tNewUi("newUi.k56863c0b0bf7"),
  },
  composio: {
    id: "composio", name: "Composio", supportsBrowserAuth: true,
    description: tNewUi("newUi.k8b7285b985d8"),
    instructions: [tNewUi("newUi.k7010e8349506"), tNewUi("newUi.k20bbfc473b4d")],
    setupUrl: "https://docs.composio.dev/docs/composio-connect",
    dashboardUrl: "https://dashboard.composio.dev",
    defaultUrl: "https://connect.composio.dev/mcp", placeholder: "https://connect.composio.dev/mcp",
    urlHelp: "Paste the MCP URL from your existing Composio session. If it requires headers, add them under Change.",
    authHelp: tNewUi("newUi.k2b2155661a73"),
  },
  executor: {
    id: "executor", name: "Executor", supportsBrowserAuth: true,
    description: tNewUi("newUi.kb7bfda4a8849"),
    instructions: [tNewUi("newUi.k5ba5fbea7434"), tNewUi("newUi.k0aaf55f97592"), tNewUi("newUi.kbd19ad56b165")],
    setupUrl: "https://executor.sh/docs/mcp-proxy",
    dashboardUrl: "https://executor.sh",
    defaultUrl: "", placeholder: tNewUi("newUi.kaa2d8df30fbc"),
    urlHelp: tNewUi("newUi.k71a97aad7013"),
    authHelp: tNewUi("newUi.k277fab6d086c"),
  },
};
