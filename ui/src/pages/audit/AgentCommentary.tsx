import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AgentCommentaryEntry, AgentCommentaryKind } from "@paperclipai/shared";
import { ArrowUpRight, ChevronLeft, ChevronRight, Lightbulb, MessageSquareWarning, Search } from "lucide-react";
import { agentCommentaryApi } from "@/api/agentCommentary";
import { agentsApi } from "@/api/agents";
import { AgentIdentity } from "@/components/AgentIdentity";
import { EmptyState } from "@/components/EmptyState";
import { MarkdownBody } from "@/components/MarkdownBody";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryKeys } from "@/lib/queryKeys";
import { Link, useSearchParams } from "@/lib/router";
import { relativeTime } from "@/lib/utils";
import { t } from "@/i18n";

const PAGE_SIZE = 50;
const ALL = "all";

function MessageKind({ kind }: { kind: AgentCommentaryKind }) {
  const Icon = kind === "suggestion" ? Lightbulb : MessageSquareWarning;
  return <Badge variant="outline" className="gap-1.5 font-normal"><Icon className="size-3" />{kind === "suggestion" ? t("upgrade1029NewPages.commentary.suggestion") : t("upgrade1029NewPages.commentary.complaint")}</Badge>;
}

function CommentaryRow({ entry, onOpen }: { entry: AgentCommentaryEntry; onOpen: (trigger: HTMLButtonElement) => void }) {
  return (
    <li>
      <button type="button" onClick={(event) => onOpen(event.currentTarget)} aria-label={entry.kind === "suggestion" ? t("upgrade1029NewPages.commentary.readSuggestionFrom", { name: entry.agent.name }) : t("upgrade1029NewPages.commentary.readComplaintFrom", { name: entry.agent.name })}
        className="group flex w-full flex-col gap-2 rounded-md px-3 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid md:grid-cols-12 md:items-start md:gap-4">
        <div className="flex items-center justify-between gap-3 md:col-span-2"><AgentIdentity agent={entry.agent} size="sm" /><span className="md:hidden"><MessageKind kind={entry.kind} /></span></div>
        <div className="hidden md:col-span-2 md:block"><MessageKind kind={entry.kind} /></div>
        <div className="flex min-w-0 flex-col gap-2 md:col-span-6">
          <p className="line-clamp-2 whitespace-pre-line break-words text-sm leading-relaxed text-foreground">{entry.preview.trim()}{entry.preview.length >= 280 ? "…" : ""}</p>
          {entry.task && <span className="truncate text-xs text-muted-foreground"><span className="font-mono">{entry.task.identifier ?? t("upgrade1029NewPages.commentary.taskFallback")}</span> · {entry.task.title}</span>}
        </div>
        <time dateTime={entry.createdAt} title={new Date(entry.createdAt).toLocaleString()} className="font-mono text-xs text-muted-foreground md:col-span-2 md:text-right">{relativeTime(entry.createdAt)}</time>
      </button>
    </li>
  );
}

function CommentaryDetail({ companyId, id, onClose, triggerRef }: { companyId: string; id: string | null; onClose: () => void; triggerRef: RefObject<HTMLButtonElement | null> }) {
  const detail = useQuery({
    queryKey: queryKeys.agentCommentary.detail(companyId, id),
    queryFn: ({ signal }) => agentCommentaryApi.get(companyId, id!, signal),
    enabled: id !== null,
  });
  const entry = detail.data;
  return (
    <Dialog open={id !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-(--sz-85vh) flex-col gap-5 sm:max-w-3xl" onCloseAutoFocus={(event) => {
        if (triggerRef.current?.isConnected) {
          event.preventDefault();
          triggerRef.current.focus();
        }
      }}>
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>{entry?.kind === "complaint" ? t("upgrade1029NewPages.commentary.complaint") : entry ? t("upgrade1029NewPages.commentary.suggestion") : t("upgrade1029NewPages.commentary.sectionTitle")}</DialogTitle>
          <DialogDescription>{entry ? t("upgrade1029NewPages.commentary.submittedAt", { date: new Date(entry.createdAt).toLocaleString() }) : t("upgrade1029NewPages.commentary.detailsDescription")}</DialogDescription>
        </DialogHeader>
        {detail.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("upgrade1029NewPages.commentary.loadingMessage")}</p> : detail.error ? (
          <div role="alert" className="flex flex-col items-start gap-3"><p className="text-sm text-destructive">{detail.error.message}</p><Button variant="outline" size="sm" onClick={() => void detail.refetch()}>{t("adapterImport.skills.tryAgain")}</Button></div>
        ) : entry ? <>
          <div className="flex shrink-0 flex-wrap items-center gap-3"><Link to={`/agents/${entry.agent.id}`}><AgentIdentity agent={entry.agent} size="sm" /></Link><MessageKind kind={entry.kind} /></div>
          <div className="min-h-0 overflow-y-auto overscroll-contain break-words pr-2"><MarkdownBody>{entry.body}</MarkdownBody></div>
          <div className="flex shrink-0 flex-wrap items-center gap-4 border-t border-border pt-4 text-sm">
            {entry.task && <Link to={`/issues/${entry.task.identifier ?? entry.task.id}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"><span className="font-mono">{entry.task.identifier ?? t("commonChatTools.sourceTask")}</span><ArrowUpRight className="size-3.5" /></Link>}
            <Link to={`/agents/${entry.agent.id}/runs/${entry.runId}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">{t("auditRuntime.audit.viewRun")}<ArrowUpRight className="size-3.5" /></Link>
          </div>
        </> : null}
      </DialogContent>
    </Dialog>
  );
}

export function AgentCommentary({ companyId }: { companyId: string }) {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const agentId = params.get("agentId") ?? ALL;
  const kind = params.get("kind") === "suggestion" || params.get("kind") === "complaint" ? params.get("kind") as AgentCommentaryKind : undefined;
  const offset = Math.min(100_000, Math.max(0, Math.floor(Number(params.get("offset")) || 0)));
  const selectedId = params.get("entry") || null;
  const [search, setSearch] = useState(q);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const updateFilters = useCallback((patch: Record<string, string>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("offset");
      next.delete("entry");
      for (const [key, value] of Object.entries(patch)) {
        if (!value || value === ALL) next.delete(key); else next.set(key, value);
      }
      return next;
    }, { replace: true });
  }, [setParams]);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (search === q) return;
    const timer = window.setTimeout(() => updateFilters({ q: search }), 250);
    return () => window.clearTimeout(timer);
  }, [search, q, updateFilters]);

  function selectEntry(id: string | null) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (id) next.set("entry", id); else next.delete("entry");
      return next;
    }, { replace: id === null });
  }
  const filters = { q: q || undefined, agentId: agentId === ALL ? undefined : agentId, kind, offset, limit: PAGE_SIZE };
  const messages = useQuery({ queryKey: queryKeys.agentCommentary.list(companyId, filters), queryFn: ({ signal }) => agentCommentaryApi.list(companyId, filters, signal) });
  const agents = useQuery({ queryKey: queryKeys.agents.list(companyId), queryFn: () => agentsApi.list(companyId) });
  const hasFilters = Boolean(q || agentId !== ALL || kind);
  const clearFilters = () => updateFilters({ q: "", agentId: "", kind: "" });

  return (
    <section className="flex flex-col gap-5" aria-label={t("upgrade1029NewPages.commentary.sectionTitle")}>
      <div className="flex flex-col gap-1"><h2 className="text-lg font-semibold">{t("upgrade1029NewPages.commentary.sectionTitle")}</h2><p className="text-sm text-muted-foreground">{t("upgrade1029NewPages.commentary.description")}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={t("upgrade1029NewPages.commentary.searchAria")} placeholder={t("upgrade1029NewPages.commentary.searchPlaceholder")} maxLength={200} value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" /></div>
        <Select value={agentId} onValueChange={(value) => updateFilters({ agentId: value })}><SelectTrigger aria-label={t("upgrade1029NewPages.commentary.filterByAgent")} className="min-w-40"><SelectValue placeholder={t("appDetail.permissions.allAgents")} /></SelectTrigger><SelectContent><SelectItem value={ALL}>{t("appDetail.permissions.allAgents")}</SelectItem>{agents.data?.map((agent) => <SelectItem key={agent.id} value={agent.id}><AgentIdentity agent={agent} size="xs" /></SelectItem>)}</SelectContent></Select>
        <Select value={kind ?? ALL} onValueChange={(value) => updateFilters({ kind: value })}><SelectTrigger aria-label={t("upgrade1029NewPages.commentary.filterByType")} className="min-w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>{t("upgrade1029NewPages.commentary.allTypes")}</SelectItem><SelectItem value="suggestion">{t("upgrade1029NewPages.commentary.suggestions")}</SelectItem><SelectItem value="complaint">{t("upgrade1029NewPages.commentary.complaints")}</SelectItem></SelectContent></Select>
        {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>{t("appsResidualRound3.clearFilters")}</Button>}
      </div>
      {agents.error && <p role="alert" className="text-sm text-destructive">{t("upgrade1029NewPages.commentary.agentFiltersFailed")} <button type="button" className="underline" onClick={() => void agents.refetch()}>{t("adapterImport.skills.tryAgain")}</button></p>}
      {messages.isPending ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">{t("upgrade1029NewPages.commentary.loading")}</p> : messages.error ? (
        <div role="alert" className="flex flex-col items-center gap-3 py-12"><p className="text-sm text-destructive">{messages.error.message}</p><Button variant="outline" size="sm" onClick={() => void messages.refetch()}>{t("adapterImport.skills.tryAgain")}</Button></div>
      ) : messages.data?.items.length === 0 ? (
        <EmptyState icon={Lightbulb} message={offset > 0 ? t("upgrade1029NewPages.commentary.noMessagesOnPage") : hasFilters ? t("upgrade1029NewPages.commentary.noMatches") : t("upgrade1029NewPages.commentary.noneYet")} description={offset > 0 ? t("upgrade1029NewPages.commentary.returnToNewest") : hasFilters ? t("upgrade1029NewPages.commentary.tryAnother") : t("upgrade1029NewPages.commentary.willAppear")} action={offset > 0 ? t("upgrade1029NewPages.commentary.backToLatest") : hasFilters ? t("appsResidualRound3.clearFilters") : undefined} onAction={offset > 0 ? () => updateFilters({ offset: "" }) : hasFilters ? clearFilters : undefined} hideActionIcon />
      ) : messages.data ? <>
        <div>
          <div aria-hidden="true" className="hidden grid-cols-12 gap-4 border-b border-border px-3 pb-3 text-xs font-medium text-muted-foreground md:grid"><span className="col-span-2">{t("agentDetailResidual.agentFallback")}</span><span className="col-span-2">{t("casesExtra.column.type")}</span><span className="col-span-6">{t("upgrade1029NewPages.commentary.message")}</span><span className="col-span-2 text-right">{t("upgrade1029NewPages.commentary.submitted")}</span></div>
          <ul aria-label={t("upgrade1029NewPages.commentary.messagesList")} className="divide-y divide-border">{messages.data.items.map((entry) => <CommentaryRow key={entry.id} entry={entry} onOpen={(trigger) => { triggerRef.current = trigger; selectEntry(entry.id); }} />)}</ul>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p role="status" className="font-mono text-xs text-muted-foreground">{t("upgrade1029NewPages.commentary.range", { start: offset + 1, end: offset + messages.data.items.length, total: messages.data.total })}</p>
          <div className="flex gap-2"><Button variant="outline" size="sm" aria-label={t("upgrade1029NewPages.commentary.previousPage")} disabled={offset === 0} onClick={() => updateFilters({ offset: String(Math.max(0, offset - PAGE_SIZE)) })}><ChevronLeft className="size-4" />{t("commonResidual.gallery.previous")}</Button><Button variant="outline" size="sm" aria-label={t("upgrade1029NewPages.commentary.nextPage")} disabled={offset + messages.data.items.length >= messages.data.total} onClick={() => updateFilters({ offset: String(offset + PAGE_SIZE) })}>{t("commonResidual.gallery.next")}<ChevronRight className="size-4" /></Button></div>
        </div>
      </> : null}
      <CommentaryDetail key={companyId} companyId={companyId} id={selectedId} onClose={() => selectEntry(null)} triggerRef={triggerRef} />
    </section>
  );
}
