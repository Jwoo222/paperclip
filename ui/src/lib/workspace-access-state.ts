import { t as tNewUi } from "@/i18n";
import type {
  WorkspaceOperation,
  WorkspaceReadiness,
  WorkspaceReadinessState,
  WorkspaceRuntimeService,
} from "@paperclipai/shared";

/**
 * Derives the workspace access state the UI shows (PAP-17572).
 *
 * The board cannot read a cloned workspace's protected health directly, so state
 * comes from three server-side facts it *can* see: the live runtime rows, the
 * workspace operation log, and the readiness the control plane reported when it
 * last tried to mint a login handoff.
 *
 * Every state carries one concrete next action. The failure this replaces was a
 * generic "Load failed" (or worse, a green badge) that told an operator nothing
 * about whether to wait, start, repair, or read a log.
 */

export type WorkspaceAccessActionKind =
  | "open"
  | "start"
  | "repair"
  | "view_logs"
  /** Nothing to do but wait for a running operation. */
  | "wait";

export type WorkspaceAccessAction = {
  kind: WorkspaceAccessActionKind;
  label: string;
};

export type WorkspaceAccessNotice = {
  title: string;
  description: string;
  action: WorkspaceAccessAction;
};

export type WorkspaceAccessDisplayState = WorkspaceReadinessState | "stopped";

export type WorkspaceAccessState = {
  state: WorkspaceAccessDisplayState;
  title: string;
  description: string;
  action: WorkspaceAccessAction;
  /** True when a password-independent handoff is the expected way in. */
  handoffAvailable: boolean;
  /** A non-blocking historical failure that is still useful to inspect. */
  secondaryNotice?: WorkspaceAccessNotice;
};

/** What the control plane said the last time a handoff was requested. */
export type WorkspaceLoginHandoffFailureInfo = {
  reason: string;
  detail?: string | null;
  readiness?: WorkspaceReadiness | null;
};

function latestOperation(operations: WorkspaceOperation[], phase: WorkspaceOperation["phase"]) {
  return operations.find((operation) => operation.phase === phase) ?? null;
}

function describeSeedPhase(readiness: WorkspaceReadiness | null | undefined): string | null {
  if (!readiness?.failurePhase && !readiness?.seedPhase) return null;
  return readiness.failurePhase ?? readiness.seedPhase ?? null;
}

function timestampMs(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function failedRepairNotice(repair: WorkspaceOperation): WorkspaceAccessNotice {
  const phase = typeof repair.metadata?.repairPhase === "string" ? repair.metadata.repairPhase : null;
  return {
    title: tNewUi("newUi.k9445b1425fef"),
    description: phase
      ? `The repair stopped during ${phase}. The pre-repair backup was kept.`
      : tNewUi("newUi.k0f115777b55f"),
    action: { kind: "view_logs", label: tNewUi("newUi.kbb0e22f5f979") },
  };
}

function failedProvisionNotice(provision: WorkspaceOperation): WorkspaceAccessNotice {
  const phase = typeof provision.metadata?.seedFailurePhase === "string"
    ? provision.metadata.seedFailurePhase
    : null;
  return {
    title: tNewUi("newUi.k7774e3ef52e6"),
    description: phase
      ? `The earlier clone attempt failed during ${phase}. The workspace later became usable.`
      : tNewUi("newUi.k704021f446d7"),
    action: { kind: "view_logs", label: tNewUi("newUi.k0b151b355497") },
  };
}

const HANDOFF_REASON_COPY: Record<string, string> = {
  handoff_not_configured:
    tNewUi("newUi.kbd471d6fffd0"),
  no_board_identity:
    tNewUi("newUi.kc1a50cbbe278"),
  runtime_not_running: tNewUi("newUi.kc1232328566b"),
  runtime_url_unusable: tNewUi("newUi.k3ce9e0a13df0"),
  workspace_not_ready: tNewUi("newUi.k39b35bba3d67"),
};

const READINESS_FAILURE_COPY: Record<string, string> = {
  database_unreachable: tNewUi("newUi.kd3232dba6cca"),
  clone_data_missing: tNewUi("newUi.k2aeb02675b3e"),
  clone_data_unreadable: tNewUi("newUi.kbb78616eaaf1"),
  cloned_membership_missing: tNewUi("newUi.k58246f203cdc"),
  cloned_identity_unreadable: tNewUi("newUi.k88484ff093bc"),
  auth_handoff_not_configured: tNewUi("newUi.k87e10d9656bb"),
  seed_manifest_unreadable: tNewUi("newUi.k301c45312472"),
};

/**
 * Human cause for a readiness rejection, preferring the specific recorded phase
 * over a generic sentence so the copy names what to fix.
 */
export function describeWorkspaceReadinessCause(
  failure: WorkspaceLoginHandoffFailureInfo | null | undefined,
): string | null {
  if (!failure) return null;
  const phase = describeSeedPhase(failure.readiness);
  if (phase && READINESS_FAILURE_COPY[phase]) return READINESS_FAILURE_COPY[phase];
  if (phase) return `Last recorded phase: ${phase}.`;
  if (failure.detail && READINESS_FAILURE_COPY[failure.detail]) return READINESS_FAILURE_COPY[failure.detail];
  return HANDOFF_REASON_COPY[failure.reason] ?? null;
}

export function resolveWorkspaceAccessState(input: {
  runtimeServices: WorkspaceRuntimeService[] | null | undefined;
  operations: WorkspaceOperation[] | null | undefined;
  handoffFailure?: WorkspaceLoginHandoffFailureInfo | null;
}): WorkspaceAccessState {
  const operations = input.operations ?? [];
  const runtimeServices = input.runtimeServices ?? [];
  const repair = latestOperation(operations, "workspace_repair");
  const provision =
    latestOperation(operations, "workspace_seed")
    ?? latestOperation(operations, "workspace_runtime_provision")
    ?? latestOperation(operations, "workspace_provision");
  const failure = input.handoffFailure ?? null;
  const cause = describeWorkspaceReadinessCause(failure);
  const handoffAvailable = failure?.reason !== "handoff_not_configured" && failure?.reason !== "no_board_identity";
  const servingService = runtimeServices.find(
    (service) => service.status === "running" && service.healthStatus === "healthy" && service.url,
  );
  const startingService = runtimeServices.find(
    (service) => service.status === "provisioning" || service.status === "starting",
  );
  const repairFinishedAt = timestampMs(repair?.finishedAt);
  const servingServiceStartedAt = timestampMs(servingService?.startedAt);
  const provisionFinishedAt = timestampMs(provision?.finishedAt);
  const readinessConfirmsServing = Boolean(servingService && failure?.readiness?.state === "ready");
  const runtimeStartedAfterRepair = repairFinishedAt !== null
    && servingServiceStartedAt !== null
    && repairFinishedAt < servingServiceStartedAt;
  const repairFailureWasSuperseded = repair?.status === "failed" && Boolean(
    servingService
    && (readinessConfirmsServing || runtimeStartedAfterRepair),
  );
  const successfulRepairFinishedAt = repair?.status === "succeeded"
    ? timestampMs(repair.finishedAt)
    : null;
  // A failed seed is historical once the workspace is demonstrably serving,
  // or once a later repair has replaced and revalidated that database.
  const provisionFailureWasSuperseded = provision?.status === "failed" && Boolean(
    servingService
    || (
      provisionFinishedAt !== null
      && successfulRepairFinishedAt !== null
      && provisionFinishedAt < successfulRepairFinishedAt
    ),
  );
  const secondaryNotice = repair?.status === "failed" && repairFailureWasSuperseded
    ? failedRepairNotice(repair)
    : provision?.status === "failed" && provisionFailureWasSuperseded
      ? failedProvisionNotice(provision)
      : undefined;

  // A live repair outranks everything: it is already changing the answer.
  if (repair?.status === "running") {
    const phase = typeof repair.metadata?.repairPhase === "string" ? repair.metadata.repairPhase : null;
    return {
      state: "repairing",
      title: tNewUi("newUi.ka275741a1647"),
      description: phase
        ? `Only the isolated database is replaced; the git worktree and your files are preserved. Current phase: ${phase}.`
        : tNewUi("newUi.kf9d0a2a4212e"),
      action: { kind: "wait", label: tNewUi("newUi.k4b259553baee") },
      handoffAvailable,
    };
  }
  if (repair?.status === "failed" && !repairFailureWasSuperseded) {
    const notice = failedRepairNotice(repair);
    return {
      state: "failed",
      ...notice,
      handoffAvailable,
    };
  }

  if (provision?.status === "running") {
    return {
      state: "provisioning",
      title: tNewUi("newUi.k1eb90451c6c6"),
      description: tNewUi("newUi.kc34f6e337f5f"),
      action: { kind: "wait", label: tNewUi("newUi.kc2b1b8e2e039") },
      handoffAvailable,
    };
  }
  if (provision?.status === "failed" && !provisionFailureWasSuperseded) {
    const seedPhase = typeof provision.metadata?.seedFailurePhase === "string"
      ? provision.metadata.seedFailurePhase
      : null;
    return {
      state: "failed",
      title: tNewUi("newUi.k7774e3ef52e6"),
      description: seedPhase
        ? `The clone failed during ${seedPhase}. Repairing replaces only the isolated database.`
        : tNewUi("newUi.k82d05fc2fbe4"),
      action: { kind: "repair", label: tNewUi("newUi.k152f148bfd57") },
      handoffAvailable,
    };
  }

  // Readiness the control plane actually observed beats anything inferred from
  // runtime rows, because it is the only signal that looked inside the clone.
  const staleNotReadyFailure = failure?.reason === "workspace_not_ready" && readinessConfirmsServing;
  if (failure && !staleNotReadyFailure) {
    if (failure.reason === "runtime_not_running" && !servingService && !startingService) {
      return {
        state: "stopped",
        title: tNewUi("newUi.k992fec9f4dae"),
        description: tNewUi("newUi.k904641084353"),
        action: { kind: "start", label: tNewUi("newUi.k0e6b0b29214d") },
        handoffAvailable,
      };
    }
    if (failure.reason === "workspace_not_ready" || failure.reason === "runtime_url_unusable") {
      const readinessState = failure.readiness?.state;
      const validating = readinessState === "validating" || readinessState === "provisioning";
      return {
        state: validating ? "validating" : "degraded",
        title: validating ? tNewUi("newUi.kd86d5002d2a9") : tNewUi("newUi.kf238ba497ea1"),
        description: [
          cause ?? tNewUi("newUi.k835a6bddae3d"),
          validating ? tNewUi("newUi.k5401163cca5f") : tNewUi("newUi.k5ccf3f1e991b"),
        ].join(" "),
        action: validating
          ? { kind: "wait", label: tNewUi("newUi.k5a1a167e3d90") }
          : { kind: "repair", label: tNewUi("newUi.k152f148bfd57") },
        handoffAvailable,
      };
    }
    if (!handoffAvailable) {
      return {
        state: servingService ? "ready" : "degraded",
        title: servingService ? tNewUi("newUi.k3eea985d525d") : tNewUi("newUi.kf238ba497ea1"),
        description: cause ?? tNewUi("newUi.kf2195ef5bc10"),
        action: servingService
          ? { kind: "open", label: tNewUi("newUi.kb3e34b185d06") }
          : { kind: "start", label: tNewUi("newUi.k0e6b0b29214d") },
        handoffAvailable: false,
        secondaryNotice,
      };
    }
  }

  if (startingService) {
    return {
      state: "provisioning",
      title: tNewUi("newUi.k45656776163c"),
      description: tNewUi("newUi.keef837ac8777"),
      action: { kind: "wait", label: tNewUi("newUi.k7212fa79f12a") },
      handoffAvailable,
    };
  }

  if (servingService) {
    return {
      state: "ready",
      title: tNewUi("newUi.k5fa7aac5375c"),
      description: tNewUi("newUi.kb7322496fdac"),
      action: { kind: "open", label: tNewUi("newUi.kb3e34b185d06") },
      handoffAvailable,
      secondaryNotice,
    };
  }

  const unhealthyService = runtimeServices.find(
    (service) => service.status === "running" && service.healthStatus !== "healthy",
  );
  if (unhealthyService) {
    return {
      state: "degraded",
      title: tNewUi("newUi.kf238ba497ea1"),
      description: cause
        ?? tNewUi("newUi.k059c9862b886"),
      action: { kind: "repair", label: tNewUi("newUi.k152f148bfd57") },
      handoffAvailable,
    };
  }

  return {
    state: "stopped",
    title: tNewUi("newUi.k992fec9f4dae"),
    description: tNewUi("newUi.k904641084353"),
    action: { kind: "start", label: tNewUi("newUi.k0e6b0b29214d") },
    handoffAvailable,
  };
}
