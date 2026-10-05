import { t as tNewUi } from "@/i18n";
import { HelpCircle } from "lucide-react";
import { AgentSetupPrompt } from "@/components/AgentSetupPrompt";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MCP_CONFIG_HELP_INSTRUCTIONS, MCP_CONFIG_HELP_PROMPT } from "@paperclipai/shared";

/**
 * Compact question-mark help beside the Paste-a-config copy (PAP-17087, plan 3A).
 *
 * Purely static: it renders a constant prompt and copies it. It deliberately has
 * no props, no company id, and no access to the textarea, so opening or copying
 * it cannot create a connection, call an agent, submit the pasted config, or leak
 * anything the operator has typed.
 */
export function McpConfigHelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={tNewUi("newUi.k2b39abc0e46c")}
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-(--sz-85vh) overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tNewUi("newUi.kfd679cf37003")}</DialogTitle>
          <DialogDescription>
            {tNewUi("newUi.kb00855675142")}
          </DialogDescription>
        </DialogHeader>

        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          {MCP_CONFIG_HELP_INSTRUCTIONS.map((instruction) => (
            <li key={instruction}>{instruction}</li>
          ))}
        </ol>

        <div className="space-y-2">
          <label htmlFor="mcp-config-help-prompt" className="text-sm font-medium text-foreground">
            {tNewUi("newUi.k928a8e35e48c")}
          </label>
          <Textarea
            id="mcp-config-help-prompt"
            readOnly
            value={MCP_CONFIG_HELP_PROMPT}
            rows={12}
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
            className="min-h-(--sz-220px) font-mono text-(length:--text-compact) leading-relaxed"
          />
        </div>

        <div>
          <AgentSetupPrompt
            prompt={MCP_CONFIG_HELP_PROMPT}
            label="Get a config with an agent"
            title="MCP configuration"
            description="Paste this into your agent to create an MCP config, then paste its JSON reply back into Paperclip."
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
