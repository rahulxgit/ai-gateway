import { useState } from 'react';
import { OPENROUTER_FREE_MODELS, TASK_TYPES } from '../types';
import type { ProviderName, TaskType } from '../types';
import { ProviderPicker } from './ProviderPicker';

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
    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
      <label className="sr-only" htmlFor="task-routing-select">Task type</label>
      <select
        id="task-routing-select"
        value={taskType}
        onChange={(e) => onTaskTypeChange(e.target.value as TaskType)}
        className="rounded-lg border border-hairline bg-panel-raised px-2.5 py-2 text-ink-muted outline-none transition hover:border-signal-dim hover:text-ink focus:border-signal-dim"
        title="Routing task type"
      >
        {TASK_TYPES.map((task) => (
          <option key={task.value} value={task.value}>
            task: {task.label.toLowerCase()}
          </option>
        ))}
      </select>

      <ProviderPicker
        value={forceProvider}
        onChange={(next) => {
          onForceProviderChange(next);
          if (next !== 'openrouter') {
            onModelChange('');
            setCustomMode(false);
          }
        }}
      />

      {forceProvider === 'openrouter' && (
        <div className="flex items-center gap-1.5">
          {!customMode ? (
            <label className="sr-only" htmlFor="openrouter-model-select">OpenRouter model</label>
            <select
              id="openrouter-model-select"
              value={isFreeModelPreset ? model : ''}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setCustomMode(true);
                  return;
                }
                onModelChange(e.target.value);
              }}
              className="rounded-lg border border-ok-dim/70 bg-ok/10 px-2.5 py-2 text-ok outline-none transition hover:border-ok focus:border-ok"
              title="OpenRouter model override"
            >
              <option value="">model: default</option>
              {OPENROUTER_FREE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>free: {m.label}</option>
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
              placeholder="provider/model[:free]"
              aria-label="Custom OpenRouter model ID"
              className="w-56 rounded-lg border border-ok-dim/70 bg-ok/10 px-3 py-2 text-ok placeholder:text-ink-faint outline-none focus:border-ok"
            />
          )}
        </div>
      )}
    </div>
  );
}
