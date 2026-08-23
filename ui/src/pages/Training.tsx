import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DecisionTrainingExample, DecisionTrainingSourceKind, IssueComment, Project } from "@paperclipai/shared";
import { ArrowLeft, Download, Search } from "lucide-react";
import { useNavigate, useParams } from "@/lib/router";
import { decisionTrainingApi, type DecisionTrainingFilters } from "@/api/decisionTraining";
import { issuesApi } from "@/api/issues";
import { projectsApi } from "@/api/projects";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToastActions } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { decisionTrainingHref } from "@/lib/decisionTraining";
import { queryKeys } from "@/lib/queryKeys";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { t } from "@/i18n";

type SnapshotRecord = Record<string, unknown>;

function stringValue(record: SnapshotRecord | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function recordDate(record: SnapshotRecord) {
  const value = record.createdAt ?? record.created_at;
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : "";
}

function recordId(record: SnapshotRecord) {
  return stringValue(record, "id") ?? "";
}

export function partitionTrainingThread(
  snapshotComments: SnapshotRecord[],
  liveComments: Array<SnapshotRecord | IssueComment>,
  cutoffAt: string,
) {
  const snapshotIds = new Set(snapshotComments.map(recordId).filter(Boolean));
  const cutoffMs = new Date(cutoffAt).getTime();
  const excluded = liveComments.filter((comment) => {
    if (snapshotIds.has(recordId(comment as SnapshotRecord))) return false;
    const createdMs = new Date(recordDate(comment as SnapshotRecord)).getTime();
    return Number.isNaN(createdMs) || createdMs > cutoffMs;
  });
  return { included: snapshotComments, excluded };
}

function decisionTitle(example: DecisionTrainingExample, issueTitle?: string) {
  const payload = example.snapshot.decision.payload;
  return stringValue(payload, "title", "prompt", "summary", "action") ?? issueTitle ?? t("statusTraining.training.decisionExample");
}

function outcomeLabel(value: string | null) {
  if (!value) return t("statusTraining.training.pendingAtCapture");
  return value.replaceAll("_", " ");
}

function authorLabel(id: string) {
  return id === "local-board" ? t("statusTraining.training.localBoard") : id.slice(0, 8);
}

function downloadExport(companyId: string) {
  const anchor = document.createElement("a");
  anchor.href = `/api/companies/${companyId}/decision-training/export.jsonl`;
  anchor.download = "decision-training.jsonl";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function TrainingLibrary() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [q, setQ] = useState("");
  const [project, setProject] = useState("all");
  const [kind, setKind] = useState("all");
  const [author, setAuthor] = useState("all");

  useEffect(() => setBreadcrumbs([{ label: t("statusTraining.training.decisions"), href: "/decisions" }, { label: t("statusTraining.training.training") }]), [setBreadcrumbs]);

  const filters = useMemo<DecisionTrainingFilters>(() => ({
    q: q.trim() || undefined,
    project: project === "all" ? undefined : project,
    kind: kind === "all" ? undefined : kind as DecisionTrainingSourceKind,
    author: author === "all" ? undefined : author,
  }), [author, kind, project, q]);
  const recordsQuery = useQuery({
    queryKey: [...queryKeys.decisionTraining.list(selectedCompanyId ?? ""), filters],
    queryFn: ({ signal }) => decisionTrainingApi.list(selectedCompanyId!, filters, { signal }),
    enabled: Boolean(selectedCompanyId),
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId ?? "", { includeArchived: true }),
    queryFn: () => projectsApi.list(selectedCompanyId!, { includeArchived: true }),
    enabled: Boolean(selectedCompanyId),
  });
  const records = recordsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const projectNames = new Map(projects.map((item: Project) => [item.id, item.name]));
  const authors = [...new Set(records.map((row) => row.example.createdByUserId))];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">{t("statusTraining.training.examples")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("statusTraining.training.examplesDescription")}</p>
        </div>
        <Button variant="outline" onClick={() => selectedCompanyId && downloadExport(selectedCompanyId)} disabled={!selectedCompanyId}>
          <Download className="size-4" /> Export JSONL
        </Button>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={t("statusTraining.training.searchAria")} value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("statusTraining.training.searchPlaceholder")} className="pl-9" />
        </div>
        <Select value={project} onValueChange={setProject}><SelectTrigger aria-label={t("statusTraining.training.filterProject")}><SelectValue placeholder={t("statusTraining.training.projectAll")} /></SelectTrigger><SelectContent><SelectItem value="all">{t("statusTraining.training.projectAll")}</SelectItem>{projects.map((item: Project) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
        <Select value={kind} onValueChange={setKind}><SelectTrigger aria-label={t("statusTraining.training.filterKind")}><SelectValue placeholder={t("statusTraining.training.kindAll")} /></SelectTrigger><SelectContent><SelectItem value="all">{t("statusTraining.training.kindAll")}</SelectItem><SelectItem value="interaction">{t("statusTraining.training.interaction")}</SelectItem><SelectItem value="approval">{t("statusTraining.training.approval")}</SelectItem><SelectItem value="execution_decision">{t("statusTraining.training.executionDecision")}</SelectItem></SelectContent></Select>
        <Select value={author} onValueChange={setAuthor}><SelectTrigger aria-label={t("statusTraining.training.filterAuthor")}><SelectValue placeholder={t("statusTraining.training.authorAll")} /></SelectTrigger><SelectContent><SelectItem value="all">{t("statusTraining.training.authorAll")}</SelectItem>{authors.map((userId) => <SelectItem key={userId} value={userId}>{authorLabel(userId)}</SelectItem>)}</SelectContent></Select>
      </div>

      {recordsQuery.isLoading ? <p className="text-sm text-muted-foreground">{t("statusTraining.training.loadingExamples")}</p> : null}
      {recordsQuery.isError ? <p className="text-sm text-destructive">{t("statusTraining.training.loadExamplesFailed")}</p> : null}
      {!recordsQuery.isLoading && !recordsQuery.isError && records.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">{t("statusTraining.training.noMatches")}</p> : null}

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="hidden grid-cols-6 gap-4 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
          <span>{t("statusTraining.training.decision")}</span><span>{t("statusTraining.training.outcome")}</span><span>{t("statusTraining.training.snapshot")}</span><span>{t("statusTraining.training.author")}</span><span>{t("statusTraining.training.created")}</span><span>{t("statusTraining.training.edited")}</span>
        </div>
        {records.map(({ example, issueIdentifier, issueTitle }) => {
          const issue = example.snapshot.issue;
          const projectName = projectNames.get(stringValue(issue, "projectId", "project_id") ?? "") ?? t("statusTraining.training.noProject");
          const edited = example.updatedAt !== example.createdAt;
          return (
            <button key={example.id} type="button" onClick={() => navigate(decisionTrainingHref(example.id))} className="grid w-full gap-3 border-t border-border px-4 py-4 text-left transition-colors first:border-t-0 hover:bg-muted/30 md:grid-cols-6 md:items-center md:gap-4">
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{decisionTitle(example, issueTitle)}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{issueIdentifier} · {projectName} · {example.sourceKind.replaceAll("_", " ")}</span></span>
              <span className="text-sm capitalize">{outcomeLabel(example.decisionOutcome)}</span>
              <span className="font-mono text-xs text-muted-foreground">{t("statusTraining.training.snapshotMeta", { comments: example.snapshot.cutoff.commentCount, runs: example.snapshot.runs.length, repo: example.snapshot.code.commitSha?.slice(0, 9) ?? t("statusTraining.training.noRepo") })}</span>
              <span className="text-sm">{authorLabel(example.createdByUserId)}</span><span className="text-xs text-muted-foreground">{formatDate(example.createdAt)}</span><span className="text-xs text-muted-foreground">{edited ? formatDate(example.updatedAt) : "—"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function JsonPanel({ value }: { value: unknown }) {
  return <pre className="overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-4 font-mono text-xs leading-relaxed">{JSON.stringify(value, null, 2)}</pre>;
}

export function TrainingThreadPanel({ example, liveComments }: { example: DecisionTrainingExample; liveComments: IssueComment[] }) {
  const { included, excluded } = partitionTrainingThread(example.snapshot.comments, liveComments, example.cutoffAt);
  const renderComment = (comment: SnapshotRecord, ghosted = false) => (
    <div key={recordId(comment) || `${recordDate(comment)}-${stringValue(comment, "body")}`} data-excluded-from-snapshot={ghosted ? "true" : undefined} className={cn("py-4", ghosted && "opacity-50")}>
      <div className="font-mono text-xs text-muted-foreground">{stringValue(comment, "authorType", "author_type") ?? t("statusTraining.training.comment")} · {recordDate(comment) ? formatDateTime(recordDate(comment)) : t("statusTraining.training.unknownTime")} · {recordId(comment).slice(0, 10)}</div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{stringValue(comment, "body") ?? ""}</p>
      {ghosted ? <p className="mt-2 text-xs font-medium text-destructive">{t("statusTraining.training.excludedAfterCutoff")}</p> : null}
    </div>
  );
  return <div className="divide-y divide-border">{included.map((comment) => renderComment(comment))}<div data-training-cutoff className="flex items-center gap-3 py-4"><span className="h-px flex-1 bg-destructive" /><span className="font-mono text-xs font-bold text-destructive">{t("statusTraining.trainingExtra.cutoffMarker")} · {formatDateTime(example.cutoffAt)}</span><span className="h-px flex-1 bg-destructive" /></div>{excluded.map((comment) => renderComment(comment as SnapshotRecord, true))}</div>;
}

export function TrainingInspector() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState(false);
  const recordQuery = useQuery({ queryKey: queryKeys.decisionTraining.detail(id), queryFn: ({ signal }) => decisionTrainingApi.get(id, { signal }), enabled: Boolean(id) });
  const example = recordQuery.data;
  const commentsQuery = useQuery({ queryKey: ["issues", example?.issueId, "comments", "training-audit"], queryFn: () => issuesApi.listComments(example!.issueId, { order: "asc" }), enabled: Boolean(example?.issueId) });
  useEffect(() => {
    if (example && !editing) setNotes(example.notes);
  }, [editing, example]);
  useEffect(() => setBreadcrumbs([{ label: t("statusTraining.training.decisions"), href: "/decisions" }, { label: t("statusTraining.training.training"), href: decisionTrainingHref() }, { label: example ? decisionTitle(example) : t("statusTraining.training.example") }]), [example, setBreadcrumbs]);
  const saveMutation = useMutation({
    mutationFn: () => decisionTrainingApi.updateNotes(id, notes.trim()),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.decisionTraining.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.decisionTraining.list(updated.companyId) });
      pushToast({ title: t("statusTraining.training.notesUpdated"), tone: "success" });
      setEditing(false);
    },
    onError: (error) => {
      pushToast({
        title: t("statusTraining.training.couldNotUpdateNotes"),
        body: error instanceof Error ? error.message : t("statusTraining.training.tryAgain"),
        tone: "error",
      });
    },
  });

  if (recordQuery.isLoading) return <p className="p-6 text-sm text-muted-foreground">{t("statusTraining.training.loadingExample")}</p>;
  if (recordQuery.isError) return <p className="p-6 text-sm text-destructive">{t("statusTraining.training.loadExampleFailed")}</p>;
  if (!example) return <p className="p-6 text-sm text-destructive">{t("statusTraining.training.exampleNotFound")}</p>;
  const issueIdentifier = stringValue(example.snapshot.issue, "identifier") ?? example.issueId.slice(0, 8);
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate(decisionTrainingHref())}><ArrowLeft className="size-4" /> {t("statusTraining.training.training")}</Button><h1 className="truncate text-xl font-bold">{decisionTitle(example)}</h1><p className="mt-1 text-sm text-muted-foreground">{issueIdentifier} · {outcomeLabel(example.decisionOutcome)} · {t("statusTraining.training.cutoff")} {formatDateTime(example.cutoffAt)}</p></div><Button variant="outline" onClick={() => downloadExport(example.companyId)}><Download className="size-4" /> {t("statusTraining.training.exportJsonl")}</Button></header>
      <div className="grid gap-8 lg:grid-cols-2">
        <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-semibold">{t("statusTraining.training.notes")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("statusTraining.training.lastEdited", { date: formatDateTime(example.updatedAt) })}</p></div>{!editing ? <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>{t("statusTraining.training.edit")}</Button> : null}</div>{editing ? <div className="space-y-3"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-72" /><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => { setNotes(example.notes); setEditing(false); }}>{t("statusTraining.training.cancel")}</Button><Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || notes.trim() === example.notes}>{t("statusTraining.training.saveNotes")}</Button></div></div> : <p className="whitespace-pre-wrap text-sm leading-relaxed">{example.notes || t("statusTraining.training.noNotes")}</p>}</section>
        <section className="min-w-0"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{t("statusTraining.training.frozenState")}</h2><span className="font-mono text-xs text-muted-foreground">{t("statusTraining.training.readOnly")}</span></div><Tabs defaultValue="thread"><TabsList variant="line" className="w-full justify-start overflow-x-auto"><TabsTrigger value="thread">{t("statusTraining.training.thread")}</TabsTrigger><TabsTrigger value="issue">{t("statusTraining.training.issue")}</TabsTrigger><TabsTrigger value="runs">{t("statusTraining.training.runs")}</TabsTrigger><TabsTrigger value="code">{t("statusTraining.training.code")}</TabsTrigger><TabsTrigger value="decision">{t("statusTraining.training.decision")}</TabsTrigger></TabsList><TabsContent value="thread"><TrainingThreadPanel example={example} liveComments={commentsQuery.data ?? []} /></TabsContent><TabsContent value="issue"><JsonPanel value={example.snapshot.issue} /></TabsContent><TabsContent value="runs"><JsonPanel value={example.snapshot.runs} /></TabsContent><TabsContent value="code"><JsonPanel value={example.snapshot.code} /></TabsContent><TabsContent value="decision"><JsonPanel value={example.snapshot.decision} /></TabsContent></Tabs></section>
      </div>
    </div>
  );
}
