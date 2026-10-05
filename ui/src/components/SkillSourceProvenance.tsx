import type { CompanySkill } from '@paperclipai/shared';
import { Link } from '@/lib/router';
import { t } from '@/i18n';
export function SkillSourceProvenance({ skill }: { skill: CompanySkill }) {
  const id = skill.metadata?.skillSourceId ?? skill.metadata?.legacySkillSourceId;
  if (typeof id !== 'string') return null;
  const state = skill.metadata?.skillSourceState;
  const label = !skill.metadata?.skillSourceId ? t('upgrade2610Skills.provenance.refreshToSync') : state === 'removed' ? t('upgrade2610Skills.provenance.removed')
    : state === 'not_syncing' ? t('upgrade2610Skills.provenance.notSyncing')
    : state === 'update_failed' ? t('upgrade2610Skills.provenance.updateFailed') : t('upgrade2610Skills.provenance.synced');
  return <div className="flex flex-col gap-1 py-3 text-xs text-muted-foreground">
    <span>{label}</span>
    <span className="break-all font-mono">{String(skill.metadata?.skillSourcePath ?? '')}{skill.sourceRef ? ` · ${skill.sourceRef.slice(0, 8)}` : ''}</span>
    <Link to={`/skills/sources/${id}`} className="text-foreground underline">{t('upgrade2610Skills.provenance.manageSource')}</Link>
  </div>;
}
