// TaskForm.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export type TaskStepFormData = {
  id?: string; // Optional for new steps being created
  title: string;
  weight?: number | null;
  is_done?: boolean;
  position?: number;
};

export type TaskFormData = {
  id?: string;
  title: string;
  description?: string | null;
  priority?: 'Low' | 'Medium' | 'High';
  due_date?: string | null; // YYYY-MM-DD
  project_id?: string | null;

  // assignment (legacy single + new multi)
  assignee_id?: string | null;
  assignee_ids?: string[];

  // progress
  progress_mode?: 'manual' | 'target' | 'steps';
  progress_percentage?: number; // manual
  progress_goal?: number | null; // target
  progress_current?: number | null; // target
};

type Props = {
  task?: Partial<TaskFormData> | null;
  projects: { id: string; name: string }[];
  users: { id: string; name: string; email?: string | null }[];
  onSave: (data: TaskFormData, initialSteps?: TaskStepFormData[]) => void | Promise<void>;
  onCancel: () => void;
};

const PRIORITIES: Array<TaskFormData['priority']> = ['High', 'Medium', 'Low'];

const toYYYYMMDD = (d?: string | null) => {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d as string; // assume already yyyy-mm-dd
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export function TaskForm({ task, projects, users, onSave, onCancel }: Props) {
  // base fields
  const [title, setTitle] = useState(task?.title ?? '');
  const [projectId, setProjectId] = useState<string | null>((task?.project_id as string) ?? null);
  const [priority, setPriority] = useState<TaskFormData['priority']>(task?.priority ?? 'Medium');
  const [dueDate, setDueDate] = useState<string>(toYYYYMMDD(task?.due_date ?? null));
  const [description, setDescription] = useState(task?.description ?? '');

  // assignment
  const [assigneeId, setAssigneeId] = useState<string | null>((task?.assignee_id as string) ?? null);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    Array.isArray(task?.assignee_ids) ? task!.assignee_ids! : (assigneeId ? [assigneeId] : [])
  );

  // progress mode
  const [mode, setMode] = useState<TaskFormData['progress_mode']>(task?.progress_mode ?? 'manual');
  const [manualPct, setManualPct] = useState<number>(Math.round(Number(task?.progress_percentage ?? 0)));
  const [goal, setGoal] = useState<number | ''>(task?.progress_goal ?? '');
  const [current, setCurrent] = useState<number>(Number(task?.progress_current ?? 0));

  // step seeding
  const [newStepTitle, setNewStepTitle] = useState('');
  const [seedSteps, setSeedSteps] = useState<TaskStepFormData[]>([]);

  // UI: search + saving + scroll
  const [projectSearch, setProjectSearch] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Define a unique value to represent "No project"
  const NO_PROJECT_VALUE = '__no_project__';

  useEffect(() => {
    if (!assigneeIds?.length && assigneeId) {
      setAssigneeIds([assigneeId]);
    }
  }, [assigneeId]); // keep legacy single in sync

  const addSeedStep = () => {
    const t = newStepTitle.trim();
    if (!t) return;
    setSeedSteps((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}`, title: t, weight: 1, is_done: false, position: prev.length },
    ]);
    setNewStepTitle('');
  };
  const removeSeedStep = (idx: number) => {
    setSeedSteps((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i })));
  };

  const canSave = title.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || isSaving) return;

    const payload: TaskFormData = {
      id: task?.id as string | undefined,
      title: title.trim(),
      description: description?.trim() || '',
      priority: priority ?? 'Medium',
      due_date: dueDate ? dueDate : null,
      project_id: projectId || null,

      // assignment: keep both
      assignee_id: assigneeId || null,
      assignee_ids: assigneeIds ?? [],

      progress_mode: mode ?? 'manual',
    };

    if (mode === 'manual') {
      payload.progress_percentage = Math.max(0, Math.min(100, Math.round(manualPct || 0)));
    } else if (mode === 'target') {
      payload.progress_goal = goal === '' ? null : Number(goal);
      payload.progress_current = Number(current || 0);
    }

    try {
      setIsSaving(true);
      const maybePromise = onSave(payload, mode === 'steps' ? seedSteps : undefined);
      if (maybePromise && typeof (maybePromise as Promise<void>).then === 'function') {
        await maybePromise;
      }
    } finally {
      // Keep a tiny delay so the animation feels intentional
      setTimeout(() => setIsSaving(false), 350);
    }
  };

  const toggleMultiAssignee = (id: string) => {
    setAssigneeIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
    // keep legacy single for compatibility (first selected)
    setAssigneeId((prevSingle) => {
      const next = assigneeIds.includes(id) ? assigneeIds.filter((x) => x !== id) : [...assigneeIds, id];
      return next[0] ?? null;
    });
  };

  const usersSorted = useMemo(() => [...users].sort((a, b) => a.name.localeCompare(b.name)), [users]);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, projectSearch]);

  const filteredUsers = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    if (!q) return usersSorted;
    return usersSorted.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.email ? u.email.toLowerCase().includes(q) : false)
    );
  }, [usersSorted, assigneeSearch]);

  return (
    // Scrollable container (works nicely inside a Dialog/Drawer)
    <div className="max-h-[74vh] overflow-y-auto pr-1 space-y-6">
      {/* Top section: Title + Project + Priority + Due + Description */}
      <Card className="p-4">
        <div className="grid gap-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Title</Label>
            <Input
              className="col-span-3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Prepare client report"
            />
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right mt-2">Project</Label>
            <div className="col-span-3">
              {/* Searchable Project Select: simple inline filter on the dropdown */}
              <Select
                value={projectId ?? NO_PROJECT_VALUE}
                onValueChange={(v) => setProjectId(v === NO_PROJECT_VALUE ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <div className="p-2 sticky top-0 bg-white">
                    <Input
                      placeholder="Search projects…"
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <SelectItem value={NO_PROJECT_VALUE}>No project</SelectItem>
                  {filteredProjects.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
                  ) : (
                    filteredProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Priority</Label>
            <div className="col-span-3">
              <Select value={priority ?? 'Medium'} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Due date</Label>
            <Input
              type="date"
              className="col-span-3"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right mt-2">Description</Label>
            <Textarea
              className="col-span-3"
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details"
              rows={4}
            />
          </div>
        </div>
      </Card>

      {/* Assignees (searchable) */}
      <Card className="p-4">
        <div className="grid gap-4">
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right mt-1">Assignees</Label>
            <div className="col-span-3">
              <div className="mb-2">
                <Input
                  value={assigneeSearch}
                  onChange={(e) => setAssigneeSearch(e.target.value)}
                  placeholder="Search people by name or email…"
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {filteredUsers.length === 0 ? (
                  <div className="text-xs text-muted-foreground px-1 py-2">No matches</div>
                ) : (
                  filteredUsers.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 rounded-md border p-2">
                      <Checkbox
                        checked={assigneeIds.includes(u.id)}
                        onCheckedChange={() => toggleMultiAssignee(u.id)}
                      />
                      <span className="text-sm">
                        {u.name}
                        {u.email ? <span className="text-xs text-gray-500"> — {u.email}</span> : null}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Progress */}
      <Card className="p-4">
        <div className="grid gap-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Progress mode</Label>
            <div className="col-span-3">
              <Select value={mode ?? 'target'} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual %</SelectItem>
                  <SelectItem value="target">Target (goal/current)</SelectItem>
                  <SelectItem value="steps">Steps</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {mode === 'manual' && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Percent complete</Label>
              <Input
                className="col-span-3"
                type="number"
                min={0}
                max={100}
                value={manualPct}
                onChange={(e) => setManualPct(Math.max(0, Math.min(100, Number(e.target.value || 0))))}
              />
            </div>
          )}

          {mode === 'target' && (
            <>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Goal</Label>
                <Input
                  className="col-span-3"
                  type="number"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Current</Label>
                <Input
                  className="col-span-3"
                  type="number"
                  value={current}
                  onChange={(e) => setCurrent(Number(e.target.value))}
                />
              </div>
            </>
          )}

          {mode === 'steps' && (
            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right mt-2">Seed steps</Label>
              <div className="col-span-3">
                <div className="flex gap-2 mb-2">
                  <Input
                    value={newStepTitle}
                    onChange={(e) => setNewStepTitle(e.target.value)}
                    placeholder="Add a step and press +"
                    onKeyDown={(e) => e.key === 'Enter' && addSeedStep()}
                  />
                  <Button onClick={addSeedStep} variant="secondary" className="active:scale-95 transition">
                    +
                  </Button>
                </div>
                {seedSteps.length ? (
                  <ul className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {seedSteps.map((s, i) => (
                      <li key={s.id} className="flex items-center justify-between rounded bg-gray-50 p-2">
                        <span className="text-sm">
                          {i + 1}. {s.title}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => removeSeedStep(i)} className="active:scale-95">
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500">No steps yet.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-white/80 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <Button variant="outline" onClick={onCancel} className="active:scale-95 transition">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className={`transition active:scale-95 ${isSaving ? 'animate-pulse' : ''}`}
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {task?.id ? 'Saving…' : 'Creating…'}
            </>
          ) : (
            <>{task?.id ? 'Save changes' : 'Create task'}</>
          )}
        </Button>
      </div>
    </div>
  );
}
