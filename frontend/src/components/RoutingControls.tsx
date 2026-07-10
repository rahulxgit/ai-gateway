import { ALL_PROVIDERS, TASK_TYPES } from '../types';
import type { ProviderName, TaskType } from '../types';

export function RoutingControls({
  taskType,
  onTaskTypeChange,
  forceProvider,
  onForceProviderChange,
}: {
  taskType: TaskType;
  onTaskTypeChange: (t: TaskType) => void;
  forceProvider: ProviderName | 'auto';
  onForceProviderChange: (p: ProviderName | 'auto') => void;
}) {
  return (
    <div className="flex items-center gap-2 font-mono text-[11px]">
      <select
        value={taskType}
        onChange={(e) => onTaskTypeChange(e.target.value as TaskType)}
        className="rounded-md border border-hairline bg-panel-raised px-2 py-1 text-ink-muted outline-none transition hover:text-ink focus:border-signal-dim"
      >
        {TASK_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            task: {t.label.toLowerCase()}
          </option>
        ))}
      </select>

      <select
        value={forceProvider}
        onChange={(e) => onForceProviderChange(e.target.value as ProviderName | 'auto')}
        className="rounded-md border border-hairline bg-panel-raised px-2 py-1 text-ink-muted outline-none transition hover:text-ink focus:border-signal-dim"
      >
        <option value="auto">provider: auto</option>
        {ALL_PROVIDERS.map((p) => (
          <option key={p} value={p}>
            provider: {p}
          </option>
        ))}
      </select>
    </div>
  );
}
