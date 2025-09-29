// TaskForm.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';

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
  onSave: (data: TaskFormData, initialSteps?: TaskStepFormData[]) => void;
  onCancel: () => void;
};

const PRIORITIES: Array<TaskFormData['priority']> = ['High', 'Medium', 'Low'];

const toYYYYMMDD = (d?: string | null) => {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d; // assume already yyyy-mm-dd
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

  // step seeding (only used when creating or switching to steps)
  const [newStepTitle, setNewStepTitle] = useState('');
  const [seedSteps, setSeedSteps] = useState<TaskStepFormData[]>([]);

  // Define a unique value to represent "No project"
  const NO_PROJECT_VALUE = "__no_project__";

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

  const handleSave = () => {
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

    // note: if mode === 'steps' we just pass seedSteps back; server will insert on create/update (your table code already does this)
    onSave(payload, mode === 'steps' ? seedSteps : undefined);
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

  const usersSorted = useMemo(
    () => [...users].sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  return (
    <div className="space-y-6">
      {/* Top section: Title + Project (moved up) */}
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

          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Project</Label>
            <div className="col-span-3">
              {/* Updated Select for Project */}
              <Select
                value={projectId ?? NO_PROJECT_VALUE} // Use the unique value when projectId is null
                onValueChange={(v) => setProjectId(v === NO_PROJECT_VALUE ? null : v)} // Map the unique value back to null
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {/* Changed the value prop here */}
                  <SelectItem value={NO_PROJECT_VALUE}>No project</SelectItem>
                  {projects.map((p) => (
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
              <Select
                value={priority ?? 'Medium'}
                onValueChange={(v) => setPriority(v as any)}
              >
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

      {/* Assignees */}
      <Card className="p-4">
        <div className="grid gap-4">
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right mt-1">Assignees</Label>
            <div className="col-span-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                {usersSorted.map((u) => (
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
                    placeholder="Add a step and press +"
                    onKeyDown={(e) => e.key === 'Enter' && addSeedStep()}
                  />
                  <Button onClick={addSeedStep}>+</Button>
                </div>
                {seedSteps.length ? (
                  <ul className="space-y-2">
                    {seedSteps.map((s, i) => (
                      <li key={s.id} className="flex items-center justify-between rounded bg-gray-50 p-2">
                        <span className="text-sm">{i + 1}. {s.title}</span>
                        <Button variant="ghost" size="sm" onClick={() => removeSeedStep(i)}>
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
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSave} disabled={!canSave}>
          {task?.id ? 'Save changes' : 'Create task'}
        </Button>
      </div>
    </div>
  );
}