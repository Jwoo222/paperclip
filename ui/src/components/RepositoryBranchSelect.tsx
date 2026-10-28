import { t } from "@/i18n";
import { GitBranch, LoaderCircle } from 'lucide-react';
import { SearchableSelect, type SearchableSelectGroup, type SearchableSelectOption } from '@/components/SearchableSelect';
import { Button } from '@/components/ui/button';

export interface RepositoryBranch {
  name: string;
  isDefault?: boolean;
}

interface BranchOption extends SearchableSelectOption {
  isDefault?: boolean;
  entered?: boolean;
}

export function RepositoryBranchSelect({ value, branches, loading, error, disabled, onChange, onRetry }: {
  value: string;
  branches: readonly RepositoryBranch[];
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  onChange: (branch: string) => void;
  onRetry?: () => void;
}) {
  const uniqueBranches = [...new Map(branches.map(branch => [branch.name, branch])).values()];
  const options: BranchOption[] = uniqueBranches.map(branch => ({ key: branch.name, value: branch.name, label: branch.name, searchText: branch.isDefault ? 'default branch' : undefined, isDefault: branch.isDefault }));
  if (value && !options.some(option => option.value === value)) options.push({ key: value, value, label: value });
  const groups: SearchableSelectGroup<string, BranchOption>[] = [
    { id: 'default', label: t('upgrade2610Skills.sourceDialog.defaultBranch'), options: options.filter(option => option.isDefault) },
    { id: 'branches', label: t('upgrade1029NewComponents.repositoryBranchSelect.branches'), options: options.filter(option => !option.isDefault) },
  ];
  return <div className="flex min-w-0 flex-col gap-2">
    <SearchableSelect<string, BranchOption>
      value={value} groups={groups} disabled={disabled} triggerAriaLabel={t("issueProperties.branch")} mobileTitle={t("upgrade1029NewComponents.repositoryBranchSelect.chooseBranch")}
      placeholder={t("upgrade1029NewComponents.repositoryBranchSelect.chooseBranch")} searchPlaceholder={t("upgrade1029NewComponents.repositoryBranchSelect.searchPlaceholder")}
      emptyMessage={loading ? t('upgrade1029NewComponents.repositoryBranchSelect.branchesLoading') : t('upgrade1029NewComponents.repositoryBranchSelect.noMatchingBranches')}
      onValueChange={branch => onChange(branch)}
      deriveGroups={(query, current) => {
        const name = query.trim();
        return name && !options.some(option => option.value === name)
          ? [...current, { id: 'entered', options: [{ key: `entered:${name}`, value: name, label: name, entered: true }] }]
          : current;
      }}
      renderOption={option => <>
        <GitBranch className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate" title={option.value}>{option.entered ? t('upgrade1029NewComponents.repositoryBranchSelect.useEntered', { value: option.value }) : option.label}</span>
        {option.isDefault && <span className="text-xs text-muted-foreground">{t("agentManagement.form.default")}</span>}
      </>}
    />
    {loading && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />{t("upgrade1029NewComponents.repositoryBranchSelect.loadingBranches")}</p>}
    {error && <div className="flex flex-wrap items-center gap-2"><p role="alert" className="text-sm text-destructive">{error} {t("upgrade1029NewComponents.repositoryBranchSelect.stillEnterName")}</p>
      {onRetry && <Button type="button" size="sm" variant="ghost" disabled={loading || disabled} onClick={onRetry}>{t("auditRuntime.common.tryAgain")}</Button>}
    </div>}
  </div>;
}
