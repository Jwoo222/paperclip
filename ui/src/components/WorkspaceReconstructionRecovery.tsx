import { t } from "@/i18n";
import { useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ExecutionBlocker } from "@paperclipai/shared";
import { issuesApi } from "../api/issues";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { NativeSelect } from "./ui/select";

export function WorkspaceReconstructionRecovery({ issueId, blocker, canManage, onRecorded }: {
  issueId: string; blocker: ExecutionBlocker; canManage: boolean; onRecorded: () => void;
}) {
  const id = useId();
  const [selected, setSelected] = useState<string[]>([]);
  const [missingWork, setMissingWork] = useState("");
  const [outcomeEvidence, setOutcomeEvidence] = useState("");
  const [actionOutcome, setActionOutcome] = useState<"completed" | "not_performed" | "mixed">("mixed");
  const [acknowledged, setAcknowledged] = useState(false);
  const files = useQuery({ queryKey: queryKeys.issues.attachments(issueId),
    queryFn: () => issuesApi.listAttachments(issueId), enabled: canManage });
  const currentSelection = selected.filter(id => files.data?.some(file => file.id === id));
  const submit = useMutation({
    mutationFn: () => issuesApi.reconstructWorkspace(issueId, {
      actionId: blocker.recoveryActionId!, runId: blocker.runId!, expectedStatusVersion: blocker.workspaceRecoveryStatusVersion!,
      attachmentIds: currentSelection, missingWork: missingWork.trim(), actionOutcome, outcomeEvidence: outcomeEvidence.trim(), acknowledgeLostWork: true,
    }), onSuccess: onRecorded,
  });
  return <details className="w-full">
    <summary className="cursor-pointer">{t("upgrade1029NewComponents.workspaceReconstructionRecovery.summary")}</summary>
    <p>{t("upgrade1029NewComponents.workspaceReconstructionRecovery.destroyed")}</p>
    {canManage ? <div className="flex flex-col gap-2">
      <p>{t("upgrade1029NewComponents.workspaceReconstructionRecovery.instructions")}</p>
      <fieldset disabled={submit.isPending} className="flex flex-col gap-2">
        <legend>{t("upgrade1029NewComponents.workspaceReconstructionRecovery.savedAttachments")}</legend>
        {files.data?.map(file => <div key={file.id} className="flex items-center gap-2">
          <Checkbox id={`${id}-${file.id}`} checked={selected.includes(file.id)} onCheckedChange={checked =>
            setSelected(current => checked === true ? [...current, file.id] : current.filter(value => value !== file.id))} />
          <Label htmlFor={`${id}-${file.id}`}>{t("upgrade1029NewComponents.workspaceReconstructionRecovery.attachmentWithSize", { name: file.originalFilename ?? t("taskDetailExtra.attachmentLabel"), bytes: file.byteSize })}</Label>
        </div>)}
        {files.isPending && <p>{t("upgrade1029NewComponents.workspaceReconstructionRecovery.loadingAttachments")}</p>}
        {files.data?.length === 0 && <p>{t("upgrade1029NewComponents.workspaceReconstructionRecovery.attachFirst")}</p>}
        <Label htmlFor={`${id}-missing`}>{t("upgrade1029NewComponents.workspaceReconstructionRecovery.missingWork")}</Label>
        <Textarea id={`${id}-missing`} maxLength={12000} value={missingWork} onChange={event => setMissingWork(event.target.value)} />
        <Label htmlFor={`${id}-outcome`}>{t("upgrade1029NewComponents.workspaceReconstructionRecovery.externalActions")}</Label>
        <NativeSelect id={`${id}-outcome`} value={actionOutcome} onChange={event => setActionOutcome(event.target.value as typeof actionOutcome)}>
          <option value="mixed">{t("upgrade1029NewComponents.workspaceReconstructionRecovery.outcomeMixed")}</option>
          <option value="not_performed">{t("upgrade1029NewComponents.workspaceReconstructionRecovery.outcomeNone")}</option>
          <option value="completed">{t("upgrade1029NewComponents.workspaceReconstructionRecovery.outcomeAll")}</option>
        </NativeSelect>
        <Label htmlFor={`${id}-evidence`}>{t("upgrade1029NewComponents.workspaceReconstructionRecovery.evidence")}</Label>
        <Textarea id={`${id}-evidence`} maxLength={12000} value={outcomeEvidence} onChange={event => setOutcomeEvidence(event.target.value)} />
        <div className="flex items-center gap-2">
          <Checkbox id={`${id}-ack`} checked={acknowledged} onCheckedChange={checked => setAcknowledged(checked === true)} />
          <Label htmlFor={`${id}-ack`}>{t("upgrade1029NewComponents.workspaceReconstructionRecovery.acknowledge")}</Label>
        </div>
      </fieldset>
      <div className="flex justify-end">
        <Button disabled={submit.isPending || !acknowledged || currentSelection.length === 0 || missingWork.trim().length < 20 || outcomeEvidence.trim().length < 20}
          onClick={() => submit.mutate()}>{submit.isPending ? t("upgrade1029NewComponents.workspaceReconstructionRecovery.queuing") : t("upgrade1029NewComponents.workspaceReconstructionRecovery.rebuild")}</Button>
      </div>
      {files.isError && <p role="alert" className="text-destructive">{files.error.message}</p>}
      {submit.isError && <p role="alert" className="text-destructive">{submit.error.message}</p>}
    </div> : <p>{t("upgrade1029NewComponents.workspaceReconstructionRecovery.boardOnly")}</p>}
  </details>;
}
