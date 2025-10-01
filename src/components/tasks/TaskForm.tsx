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
  id?: string;
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
  due_date?: string | null;
  project_id?: string | null;

  assignee_id?: string | null;
  assignee_ids?: string[];

  // only "target" or "steps"
  progress_mode?: 'target' | 'steps';
  progress_goal?: number | null;
  progress_current?: number | null;
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
  if (Number.isNaN(dt.getTime())) return d as string;
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export function TaskForm({ task, projects, users, onSave, onCancel }: Props) {
  // base
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

  // progress
  const [mode, setMode] = useState<TaskFormData['progress_mode']>(task?.progress_mode ?? 'target');
  const [goal, setGoal] = useState<number | ''>(task?.progress_goal ?? '');
  const [current, setCurrent] = useState<number>(Number(task?.progress_current ?? 0));

  // step seeding
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepWeight, setNewStepWeight] = useState<number>(1);
  const [seedSteps, setSeedSteps] = useState<TaskStepFormData[]>([]);

  const [projectSearch, setProjectSearch] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const NO_PROJECT_VALUE = '__no_project__';

  useEffect(() => {
    if (!assigneeIds?.length && assigneeId) {
      setAssigneeIds([assigneeId]);
    }
  }, [assigneeId]);

  const addSeedStep = () => {
    const t = newStepTitle.trim();
    if (!t) return;
    setSeedSteps((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}`, title: t, weight: newStepWeight || 1, is_done: false, position: prev.length },
    ]);
    setNewStepTitle('');
    setNewStepWeight(1);
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

      assignee_id: assigneeId || null,
      assignee_ids: assigneeIds ?? [],

      progress_mode: mode,
    };

    if (mode === 'target') {
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
      setTimeout(() => setIsSaving(false), 350);
    }
  };

  const toggleMultiAssignee = (id: string) => {
    setAssigneeIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
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
      (u) => u.name.toLowerCase().includes(q) || (u.email ? u.email.toLowerCase().includes(q) : false)
    );
  }, [usersSorted, assigneeSearch]);

  return (
    <div className="max-h-[74vh] overflow-y-auto pr-1 space-y-6">
      {/* Base info */}
      <Card className="p-4">
        <div className="grid gap-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Title</Label>
            <Input className="col-span-3" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right mt-2">Project</Label>
            <div className="col-span-3">
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
                  {filteredProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
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
            <Input type="date" className="col-span-3" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right mt-2">Description</Label>
            <Textarea className="col-span-3" value={description ?? ''} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
      </Card>

      {/* Assignees */}
      <Card className="p-4">
        <div className="grid gap-4">
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right mt-1">Assignees</Label>
            <div className="col-span-3">
              <Input
                value={assigneeSearch}
                onChange={(e) => setAssigneeSearch(e.target.value)}
                placeholder="Search people by name or email…"
                className="h-9 mb-2"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto">
                {filteredUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 rounded-md border p-2">
                    <Checkbox checked={assigneeIds.includes(u.id)} onCheckedChange={() => toggleMultiAssignee(u.id)} />
                    <span className="text-sm">
                      {u.name} {u.email ? <span className="text-xs text-gray-500"> — {u.email}</span> : null}
                    </span>
                  </label>
                ))}
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
                  <SelectItem value="target">Target (goal/current)</SelectItem>
                  <SelectItem value="steps">Steps</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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
                    placeholder="Step title"
                    onKeyDown={(e) => e.key === 'Enter' && addSeedStep()}
                  />
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    value={newStepWeight}
                    onChange={(e) => setNewStepWeight(Number(e.target.value))}
                    placeholder="Weight"
                  />
                  <Button onClick={addSeedStep} variant="secondary">+</Button>
                </div>
                {seedSteps.length ? (
                  <ul className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {seedSteps.map((s, i) => (
                      <li key={s.id} className="flex items-center justify-between rounded bg-gray-50 p-2">
                        <span className="text-sm">
                          {i + 1}. {s.title} <span className="text-xs text-gray-500">(weight: {s.weight})</span>
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => removeSeedStep(i)}>Remove</Button>
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
      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-white/80 py-2 backdrop-blur">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={!canSave || isSaving}>
          {isSaving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />{task?.id ? 'Saving…' : 'Creating…'}</>) 
            : (task?.id ? 'Save changes' : 'Create task')}
        </Button>
      </div>
    </div>
  );
}
