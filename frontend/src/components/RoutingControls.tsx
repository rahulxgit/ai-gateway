import { useState } from 'react';
import { ALL_PROVIDERS, OPENROUTER_FREE_MODELS, TASK_TYPES } from '../types';
import type { ProviderName, TaskType } from '../types';

export function RoutingControls({
  taskType,
  onTaskTypeChange,
  forceProvider,
  onForceProviderChange,
  model,
  onModelChange,
}: {
  taskType: TaskType;
  onTaskTypeChange: (t: TaskType) => void;
  forceProvider: ProviderName | 'auto';
  onForceProviderChange: (p: ProviderName | 'auto') => void;
  model: string;
  onModelChange: (m: string) => void;
}) {
  const [customMode, setCustomMode] = useState(false);
  const isFreeModelPreset = OPENROUTER_FREE_MODELS.some((m) => m.value === model);

  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
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
        onChange={(e) => {
          const next = e.target.value as ProviderName | 'auto';
          onForceProviderChange(next);
          // Switching away from openrouter clears any free-model override —
          // that model ID is meaningless against a different provider.
          if (next !== 'openrouter') {
            onModelChange('');
            setCustomMode(false);
          }
        }}
        className="rounded-md border border-hairline bg-panel-raised px-2 py-1 text-ink-muted outline-none transition hover:text-ink focus:border-signal-dim"
      >
        <option value="auto">provider: auto</option>
        {ALL_PROVIDERS.map((p) => (
          <option key={p} value={p}>
            provider: {p}
          </option>
        ))}
      </select>

      {forceProvider === 'openrouter' && (
        <div className="flex items-center gap-1.5">
          {!customMode ? (
            <select
              value={isFreeModelPreset ? model : ''}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setCustomMode(true);
                  return;
                }
                onModelChange(e.target.value);
              }}
              className="rounded-md border border-ok-dim bg-ok-dim/10 px-2 py-1 text-ok outline-none transition focus:border-ok"
              title="Free OpenRouter model — no cost against your existing key"
            >
              <option value="">model: default (paid)</option>
              {OPENROUTER_FREE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  free: {m.label}
                </option>
              ))}
              <option value="__custom__">custom model id…</option>
            </select>
          ) : (
            <input
              autoFocus
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              onBlur={() => {
                if (!model) setCustomMode(false);
              }}
              placeholder="e.g. qwen/qwen3-14b:free"
              className="w-52 rounded-md border border-ok-dim bg-ok-dim/10 px-2 py-1 text-ok placeholder:text-ink-faint outline-none focus:border-ok"
            />
          )}
        </div>
      )}
    </div>
  );
}
