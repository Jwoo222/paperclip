import { useId, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { Bot, Search, User } from "lucide-react";
import type { IssueFiltersPopover } from "./IssueFiltersPopover";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { FlyoutHeader } from "./ui/flyout";
import { StatusIcon } from "./StatusIcon";
import { TruncatedText } from "./TruncatedText";
import { issueFilterLabel, issueStatusOrder, searchIssueFilterOptions, toggleIssueFilterValue } from "@/lib/issue-filters";
import { t } from "@/i18n";

type PanelProps = Pick<ComponentProps<typeof IssueFiltersPopover>, "state" | "onChange" | "activeFilterCount" | "agents" | "projects" | "labels" | "creators" | "currentUserId"> & { onClear: () => void };

function FilterGroup({ title, searchLabel, searchPlaceholder, query, onQueryChange, children, optionsKey }: { title: string; searchLabel?: string; searchPlaceholder?: string; query?: string; onQueryChange?: (value: string) => void; children: ReactNode; optionsKey: string }) {
  const headingId = useId();
  return (
    <section className="task-filter-group" aria-labelledby={headingId}>
      <h3 id={headingId}>{title}</h3>
      <div className="task-filter-group-body">
        {searchLabel ? <div className="task-filter-search"><Search aria-hidden /><Input aria-label={searchLabel} placeholder={searchPlaceholder} value={query} onChange={event => onQueryChange?.(event.target.value)} /></div> : null}
        <div className="task-filter-options" data-filter-options={optionsKey}>{children}</div>
      </div>
    </section>
  );
}

function FilterRow({ label, checked, onToggle, icon }: { label: string; checked: boolean; onToggle: () => void; icon?: ReactNode }) {
  return <label className="task-filter-option" data-marquee-surface><Checkbox aria-label={label} checked={checked} onCheckedChange={onToggle} />{icon ? <span className="task-filter-icon" aria-hidden>{icon}</span> : null}<TruncatedText className="task-filter-option-label">{label}</TruncatedText></label>;
}

/** Proposed five-group IA; the collection retains ownership of filter state. */
export function IssueFilterPanel({ state, onChange, activeFilterCount, agents = [], projects = [], labels = [], creators = [], currentUserId, onClear }: PanelProps) {
  const [queries, setQueries] = useState({ projects: "", creators: "", assignees: "", labels: "" });
  const search = (key: keyof typeof queries) => (value: string) => setQueries(current => ({ ...current, [key]: value }));
  const visibleProjects = searchIssueFilterOptions(projects, queries.projects, option => option.name);
  const visibleCreators = searchIssueFilterOptions(creators, queries.creators, option => `${option.label} ${option.searchText ?? ""}`);
  const assignees = [{ id: "__unassigned", name: t("issueWork.noAssignee"), icon: null }, ...(currentUserId ? [{ id: "__me", name: t("work.filters.me"), icon: <User /> }] : []), ...agents.map(agent => ({ ...agent, icon: null }))];
  const visibleAssignees = searchIssueFilterOptions(assignees, queries.assignees, option => option.name);
  const visibleLabels = searchIssueFilterOptions(labels, queries.labels, option => option.name);
  return <>
    <FlyoutHeader className="task-filters-header"><span>{t("searchStatus.filters")}</span>{activeFilterCount ? <Button variant="ghost" onClick={() => { onClear(); setQueries({ projects: "", creators: "", assignees: "", labels: "" }); }}>{t("work.filters.clear")}</Button> : null}</FlyoutHeader>
    <div className="task-filters-grid">
      <FilterGroup title={t("work.filters.status")} optionsKey="statuses">
        {issueStatusOrder.map(status => <FilterRow key={status} label={issueFilterLabel(status)} checked={state.statuses.includes(status)} onToggle={() => onChange({ statuses: toggleIssueFilterValue(state.statuses, status) })} icon={<StatusIcon status={status} />} />)}
      </FilterGroup>
      <FilterGroup title={t("work.filters.project")} optionsKey="projects" searchLabel={t("upgrade1029NewComponents.allowedProjectsEditor.searchProjects")} searchPlaceholder={t("upgrade1029NewComponents.issueFilterPanel.searchProjectsPlaceholder")} query={queries.projects} onQueryChange={search("projects")}>
        {visibleProjects.map(project => <FilterRow key={project.id} label={project.name} checked={state.projects.includes(project.id)} onToggle={() => onChange({ projects: toggleIssueFilterValue(state.projects, project.id) })} />)}
        {!visibleProjects.length ? <p className="task-filter-empty">{queries.projects ? t("upgrade1029NewComponents.issueFilterPanel.noProjectsMatch") : t("upgrade1029NewComponents.issueFilterPanel.noProjectsAvailable")}</p> : null}
      </FilterGroup>
      <FilterGroup title={t("work.filters.creator")} optionsKey="creators" searchLabel={t("upgrade1029NewComponents.issueFilterPanel.searchCreators")} searchPlaceholder={t("work.filters.searchCreators")} query={queries.creators} onQueryChange={search("creators")}>
        {visibleCreators.map(creator => <FilterRow key={creator.id} label={creator.label} checked={state.creators.includes(creator.id)} onToggle={() => onChange({ creators: toggleIssueFilterValue(state.creators, creator.id) })} icon={creator.kind === "agent" ? <Bot /> : <User />} />)}
        {!visibleCreators.length ? <p className="task-filter-empty">{queries.creators ? t("work.filters.noCreatorsMatch") : t("upgrade1029NewComponents.issueFilterPanel.noCreatorsAvailable")}</p> : null}
      </FilterGroup>
      <FilterGroup title={t("searchStatus.filter.assignee")} optionsKey="responsible" searchLabel={t("upgrade1029NewComponents.issueFilterPanel.searchAssignees")} searchPlaceholder={t("upgrade1029NewComponents.issueFilterPanel.searchAssigneesPlaceholder")} query={queries.assignees} onQueryChange={search("assignees")}>
        {visibleAssignees.map(assignee => <FilterRow key={assignee.id} label={assignee.name} checked={state.assignees.includes(assignee.id)} onToggle={() => onChange({ assignees: toggleIssueFilterValue(state.assignees, assignee.id) })} icon={assignee.icon} />)}
        {!visibleAssignees.length ? <p className="task-filter-empty">{t("upgrade1029NewComponents.issueFilterPanel.noAssigneesMatch")}</p> : null}
      </FilterGroup>
      <FilterGroup title={t("casesExtra.list.label")} optionsKey="labels" searchLabel={t("upgrade1029NewComponents.issueFilterPanel.searchLabels")} searchPlaceholder={t("upgrade1029NewComponents.issueFilterPanel.searchLabelsPlaceholder")} query={queries.labels} onQueryChange={search("labels")}>
        {visibleLabels.map(label => <FilterRow key={label.id} label={label.name} checked={state.labels.includes(label.id)} onToggle={() => onChange({ labels: toggleIssueFilterValue(state.labels, label.id) })} icon={<span className="task-filter-label-dot" style={{ "--task-filter-label-color": label.color } as CSSProperties} />} />)}
        {!visibleLabels.length ? <p className="task-filter-empty">{queries.labels ? t("upgrade1029NewComponents.issueFilterPanel.noLabelsMatch") : t("upgrade1029NewComponents.issueFilterPanel.noLabelsAvailable")}</p> : null}
      </FilterGroup>
    </div>
  </>;
}
