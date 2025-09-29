// TasksTable.tsx
import React, { useEffect, useMemo, useState, useCallback, useRef, memo } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, Edit3, Archive, Save, ListChecks, Gauge, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { TaskForm, type TaskFormData, type TaskStepFormData } from './TaskForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const API_BASE = 'https://quantnow-sa1e.onrender.com';

/* ---------- Types ---------- */
type BaseTask = {
  id: string;
  title: string;
  status: 'To Do' | 'In Progress' | 'Review' | 'Done' | 'Archived' | 'Overdue';
  progress_percentage: number;
  due_date?: string | null;
  assignee_name?: string | null; // legacy single
  assignee_id?: string | null;   // legacy single
  project_id?: string | null;
  project_name?: string | null;
  priority: 'Low' | 'Medium' | 'High';
};

type TaskStep = {
  id: string;
  task_id: string;
  title: string;
  weight: number | null;
  is_done: boolean;
  position: number;
};

type AssigneeLite = { id: string; name: string; email?: string | null };

type FullTask = BaseTask & {
  progress_mode: 'manual' | 'target' | 'steps';
  progress_goal: number | null;
  progress_current: number | null;
  steps: TaskStep[];
  assignees?: AssigneeLite[]; // multi-assignees (optional)
};

type Filters = {
  search?: string;
  projectId?: string;
  tab?: 'all' | 'inprogress' | 'completed' | 'overdue' | 'archived';
};

/* ---------- Helpers & API ---------- */
const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const computeStatusFromPct = (pct: number): FullTask['status'] => {
  if (pct >= 100) return 'Done';
  if (pct >= 1) return 'In Progress';
  return 'To Do';
};

async function putStatusForPct(task: FullTask, pctVal: number) {
  const nextStatus = computeStatusFromPct(pctVal);
  if (nextStatus === task.status || task.status === 'Archived') return;
  await fetch(`${API_BASE}/api/tasks/${task.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status: nextStatus }),
  });
}

const useIncrementProgress = () =>
  useCallback(async (taskId: string, incrementValue: number) => {
    const response = await fetch(`${API_BASE}/api/tasks/${taskId}/progress/increment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ increment: incrementValue }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, []);

const useUpdateTaskProgress = () =>
  useCallback(
    async (
      taskId: string,
      progressData: Partial<
        Pick<FullTask, 'progress_mode' | 'progress_goal' | 'progress_current' | 'steps' | 'progress_percentage'>
      >
    ) => {
      const response = await fetch(`${API_BASE}/api/tasks/${taskId}/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(progressData),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    []
  );

/* ---------- Local utils ---------- */
const useStableFormatDate = () => {
  return useCallback((dateString: string | null | undefined): string => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }, []);
};

const isOverdue = (t: Pick<FullTask, 'due_date' | 'status' | 'progress_percentage'>) => {
  if (!t.due_date) return false;
  if (t.status === 'Done' || t.status === 'Archived') return false;
  if ((t.progress_percentage ?? 0) >= 100) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(t.due_date);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
};

/** When unarchiving, restore to a sensible status based on % and overdue-ness */
const deriveUnarchivedStatus = (t: FullTask): FullTask['status'] => {
  const pct = Math.round(t.progress_percentage ?? 0);
  const base = computeStatusFromPct(pct);
  if (base === 'Done') return 'Done';
  const overdue = isOverdue({ due_date: t.due_date!, status: base, progress_percentage: pct });
  return overdue ? 'Overdue' : base;
};

/* ---------- Priority UI ---------- */
const PRIORITY_META = {
  High:   { short: 'H', label: 'High',   dot: 'bg-red-500',    ring: 'ring-red-200' },
  Medium: { short: 'M', label: 'Medium', dot: 'bg-yellow-500', ring: 'ring-yellow-200' },
  Low:    { short: 'L', label: 'Low',    dot: 'bg-green-500',  ring: 'ring-green-200' },
} as const;

type Priority = keyof typeof PRIORITY_META;

function PriorityBadge({ value }: { value: Priority }) {
  const meta = PRIORITY_META[value];
  return (
    <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-md ring-1 ${meta.ring} bg-white`}>
      <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
      <span className="text-xs font-medium">{meta.label}</span>
      <span className="text-[10px] text-gray-500">{meta.short}</span>
    </span>
  );
}

function PrioritySelect({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (val: Priority) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Priority)}>
      <SelectTrigger className="h-8 w-[70px]">
        <SelectValue placeholder="Select priority">
          <div className="flex items-center gap-2">
            <PriorityBadge value={value} />
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
          <SelectItem key={p} value={p}>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${PRIORITY_META[p].dot}`} />
              <span className="text-sm">{PRIORITY_META[p].label}</span>
              <span className="ml-1 text-[10px] text-gray-500">{PRIORITY_META[p].short}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ---------- Progress dialogs (return patches to avoid full refetch) ---------- */
function TargetDialog({
  task,
  open,
  onClose,
  onSaved,
}: {
  task: FullTask;
  open: boolean;
  onClose: () => void;
  onSaved: (patch: Partial<FullTask>) => void;
}) {
  const updateTaskProgress = useUpdateTaskProgress();
  const [goal, setGoal] = useState<number | ''>(task.progress_goal ?? '');
  const [current, setCurrent] = useState<number>(task.progress_current ?? 0);
  const [isSaving, setIsSaving] = useState(false);

  const pct =
    goal === '' || goal === 0 ? 0 : Math.max(0, Math.min(100, Math.round(((current ?? 0) / Number(goal)) * 100)));

  const save = async () => {
    setIsSaving(true);
    try {
      await updateTaskProgress(task.id, {
        progress_mode: 'target',
        progress_goal: goal === '' ? null : goal,
        progress_current: current,
      });
      await putStatusForPct(task, pct);
      const nextStatus = computeStatusFromPct(pct);
      onSaved({
        id: task.id,
        progress_mode: 'target',
        progress_goal: goal === '' ? null : goal,
        progress_current: current,
        progress_percentage: pct,
        status: task.status === 'Archived' ? task.status : nextStatus,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save target progress:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" /> Set Target for "{task.title}"
          </DialogTitle>
          <DialogDescription>Define your goal and track your current progress.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Goal</Label>
            <Input
              type="number"
              value={goal}
              onChange={(e) => setGoal(e.target.value === '' ? '' : Number(e.target.value))}
              className="col-span-3"
              placeholder="e.g., 100"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Current</Label>
            <Input
              type="number"
              value={current}
              onChange={(e) => setCurrent(Number(e.target.value))}
              className="col-span-3"
              placeholder="e.g., 25"
            />
          </div>
          {goal !== '' && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Progress</Label>
              <div className="col-span-3">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(to right, #4ade80, #22d3ee, #3b82f6)`,
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {current} / {goal} ({pct}%)
                </p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isSaving || (goal !== '' && current > Number(goal))}>
            {isSaving ? 'Saving…' : 'Save Target'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepsDialog({
  task,
  open,
  onClose,
  onSaved,
}: {
  task: FullTask;
  open: boolean;
  onClose: () => void;
  onSaved: (patch: Partial<FullTask>) => void;
}) {
  const updateTaskProgress = useUpdateTaskProgress();
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setSteps([...(task.steps ?? [])]);
      setNewStepTitle('');
    }
  }, [task]);

  const add = () => {
    if (!newStepTitle.trim()) return;
    const s: TaskStep = {
      id: `new-${Date.now()}`,
      task_id: task.id,
      title: newStepTitle.trim(),
      weight: 1,
      is_done: false,
      position: steps.length,
    };
    setSteps((prev) => [...prev, s]);
    setNewStepTitle('');
  };

  const toggle = (i: number) =>
    setSteps((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], is_done: !copy[i].is_done };
      return copy;
    });

  const remove = (i: number) =>
    setSteps((prev) => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, position: idx })));

  const totalW = steps.reduce((sum, s) => sum + (s.weight ?? 0), 0);
  const doneW = steps.filter((s) => s.is_done).reduce((sum, s) => sum + (s.weight ?? 0), 0);
  const stepPct = totalW > 0 ? Math.round((doneW / totalW) * 100) : 0;

  const save = async () => {
    setIsSaving(true);
    try {
      const stepsToSend = steps.map((s) => ({ ...s, id: s.id.startsWith('new-') ? undefined : s.id }));
      await updateTaskProgress(task.id, {
        progress_mode: 'steps',
        steps: stepsToSend,
        progress_percentage: stepPct,
      });
      await putStatusForPct(task, stepPct);

      const nextStatus = computeStatusFromPct(stepPct);
      onSaved({
        id: task.id,
        progress_mode: 'steps',
        steps: stepsToSend,
        progress_percentage: stepPct,
        status: task.status === 'Archived' ? task.status : nextStatus,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save steps progress:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" /> Steps for "{task.title}"
          </DialogTitle>
          <DialogDescription>Break down your task into smaller steps. Progress: {stepPct}%</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex gap-2">
            <Input
              value={newStepTitle}
              onChange={(e) => setNewStepTitle(e.target.value)}
              placeholder="Add a new step..."
              onKeyDown={(e) => e.key === 'Enter' && add()}
            />
            <Button onClick={add} size="sm">+</Button>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {steps.length ? (
              steps.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <Checkbox checked={s.is_done} onCheckedChange={() => toggle(i)} />
                  <span className={`flex-1 text-sm ${s.is_done ? 'line-through text-gray-500' : ''}`}>{s.title}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => remove(i)}>
                    –
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-2">No steps yet.</p>
            )}
          </div>
          {steps.length > 0 && (
            <div className="pt-2 border-t">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Overall Progress</span>
                <span className="font-medium">{stepPct}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${stepPct}%`,
                    background: `linear-gradient(to right, #4ade80, #22d3ee, #3b82f6)`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save Steps'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- ProgressOptionsDialog ---
function ProgressOptionsDialog({
  task,
  open,
  onClose,
  onSaved,
  openTarget,
  openSteps,
}: {
  task: FullTask;
  open: boolean;
  onClose: () => void;
  onSaved: (patch: Partial<FullTask>) => void;
  openTarget: () => void;
  openSteps: () => void;
}) {
  const updateTaskProgress = useUpdateTaskProgress();
  const incrementProgress = useIncrementProgress();
  const [manualProgress, setManualProgress] = useState<number>(task.progress_percentage || 0);
  const [isSaving, setIsSaving] = useState(false);

  const manualSave = async () => {
    setIsSaving(true);
    try {
      const pct = Math.max(0, Math.min(100, Math.round(manualProgress)));
      await updateTaskProgress(task.id, { progress_mode: 'manual', progress_percentage: pct });
      await putStatusForPct(task, pct);

      const nextStatus = computeStatusFromPct(pct);
      onSaved({
        id: task.id,
        progress_mode: 'manual',
        progress_percentage: pct,
        status: task.status === 'Archived' ? task.status : nextStatus,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save manual progress:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const inc = async (n: number) => {
    setIsSaving(true);
    try {
      let newPct: number | null = null;
      if (task.progress_mode === 'target' && task.progress_goal && task.progress_goal > 0) {
        const newCurrent = Math.min((task.progress_current ?? 0) + n, task.progress_goal);
        newPct = Math.round((newCurrent / task.progress_goal) * 100);
        newPct = Math.max(0, Math.min(100, newPct));
      }
      await incrementProgress(task.id, n);
      if (newPct !== null) await putStatusForPct(task, newPct);

      onSaved({
        id: task.id,
        progress_current: (task.progress_current ?? 0) + n,
        progress_percentage: newPct ?? task.progress_percentage,
        status: task.status === 'Archived' ? task.status : newPct !== null ? computeStatusFromPct(newPct) : task.status,
      });
      onClose();
    } catch (error) {
      console.error('Failed to increment progress:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="h-5 w-5" /> Edit Progress — "{task.title}"
          </DialogTitle>
          <DialogDescription>Choose how you want to update the progress.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {task.progress_mode === 'manual' && (
            <div className="space-y-2">
              <Label>Manual Progress (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={manualProgress}
                  onChange={(e) => setManualProgress(Number(e.target.value))}
                  className="flex-1"
                />
                <Button onClick={manualSave} disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Update'}
                </Button>
              </div>
              <p className="text-xs text-gray-500">Current: {Math.round(task.progress_percentage || 0)}%</p>
            </div>
          )}
          {task.progress_mode === 'target' && (
            <div className="space-y-2">
              <Label>Target-Based</Label>
              <div className="flex gap-2">
                <Button variant="outline" onClick={openTarget} disabled={isSaving}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Adjust Target
                </Button>
                <Button onClick={() => inc(1)} disabled={isSaving}>
                  +1 current
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Current: {task.progress_current ?? 0} / {task.progress_goal ?? '—'}
              </p>
            </div>
          )}
          {task.progress_mode === 'steps' && (
            <div className="space-y-2">
              <Label>Step-Based</Label>
              <Button variant="outline" onClick={openSteps} disabled={isSaving}>
                <ListChecks className="h-4 w-4 mr-2" />
                Manage Steps
              </Button>
              <p className="text-xs text-gray-500">
                Completed {task.steps.filter((s) => s.is_done).length} of {task.steps.length} steps.
              </p>
            </div>
          )}
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Progress</span>
              <span>{Math.round(task.progress_percentage || 0)}%</span>
            </div>
            <div
              className="w-full bg-gray-200 rounded-full h-1.5 mt-1"
              role="progressbar"
              aria-valuenow={Math.round(task.progress_percentage || 0)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-1.5 rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, Math.round(task.progress_percentage || 0)))}%`,
                  background: `linear-gradient(to right, #4ade80, #22d3ee, #3b82f6)`,
                }}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Memoized row ---------- */
type RowProps = {
  task: FullTask;
  savingId: string | null;
  onRangeChange: (id: string, value: number) => void;
  onSaveProgress: (id: string, pct: number) => void;
  onEdit: (task: FullTask) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onOpenProgress: (task: FullTask) => void;
  formatDate: (d?: string | null) => string;
  onChangePriority: (id: string, p: Priority) => void;
};

const TaskRow = memo(function TaskRow({
  task: t,
  onEdit,
  onArchive,
  onUnarchive,
  onOpenProgress,
  formatDate,
  onChangePriority,
}: RowProps) {
  return (
    <TableRow className={t.status === 'Overdue' ? 'bg-red-50' : ''}>
      <TableCell className="font-medium">{t.title}</TableCell>
      <TableCell>{t.project_name || '—'}</TableCell>
      <TableCell>
        {Array.isArray(t.assignees) && t.assignees.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {t.assignees.map((u) => (
              <span
                key={u.id}
                className="inline-block text-xs bg-gray-100 rounded-full px-2 py-0.5"
                title={u.email || undefined}
              >
                {u.name}
              </span>
            ))}
          </div>
        ) : (
          t.assignee_name || '—'
        )}
      </TableCell>
      <TableCell>
        <PrioritySelect value={t.priority as Priority} onChange={(p) => onChangePriority(t.id, p)} />
      </TableCell>
      <TableCell>{formatDate(t.due_date)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2 w-48">
          <div
            className="w-full bg-gray-200 rounded-full h-1.5"
            role="progressbar"
            aria-valuenow={Math.round(t.progress_percentage || 0)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: `${Math.max(0, Math.min(100, Math.round(t.progress_percentage || 0)))}%`,
                background: `linear-gradient(to right, #4ade80, #22d3ee, #3b82f6)`,
              }}
            />
          </div>
          <span className="w-10 text-right tabular-nums">{Math.round(t.progress_percentage ?? 0)}%</span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onEdit(t)} title="Edit">
            <Edit3 className="h-4 w-4" />
          </Button>

          {t.status === 'Archived' ? (
            <Button variant="ghost" size="sm" onClick={() => onUnarchive(t.id)} title="Unarchive">
              <Save className="h-4 w-4 text-emerald-600" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => onArchive(t.id)} title="Archive">
              <Archive className="h-4 w-4 text-orange-600" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenProgress(t)}
            title="Update progress (manual/target/steps)"
          >
            <Gauge className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}, (prev, next) => {
  const a = prev.task, b = next.task;
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.project_name === b.project_name &&
    a.assignee_name === b.assignee_name &&
    JSON.stringify(a.assignees || []) === JSON.stringify(b.assignees || []) &&
    a.priority === b.priority &&
    a.due_date === b.due_date &&
    a.progress_percentage === b.progress_percentage &&
    a.status === b.status
  );
});

/* ---------- Main table ---------- */

// helpers to keep payloads clean for your backend
const UUIDish = (v?: string | null) => !!v && /^[0-9a-fA-F-]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(v);
const pickValidIds = (ids?: string[]) => (Array.isArray(ids) ? ids.filter((v) => UUIDish(v)) : []);

const buildCreatePayload = (d: TaskFormData) => {
  const isTarget = d.progress_mode === 'target';
  const due = d.due_date && String(d.due_date).trim() !== '' ? d.due_date : null;

  const payload: any = {
    title: d.title,
    description: d.description ?? null,
    priority: d.priority ?? 'Medium',
    due_date: due,
    project_id: d.project_id ?? null,
    progress_mode: d.progress_mode ?? 'manual',
    assignee_ids: pickValidIds(d.assignee_ids), // multi-assignees
  };

  if (d.progress_mode === 'manual') {
    payload.progress_percentage = Math.max(0, Math.min(100, Math.round(d.progress_percentage ?? 0)));
  }
  if (isTarget) {
    payload.progress_goal = d.progress_goal ?? null;
    payload.progress_current = d.progress_current ?? 0;
  }

  // legacy single (optional)
  if (UUIDish(d.assignee_id)) {
    payload.assignee_id = d.assignee_id!;
  }
  return payload;
};

const buildUpdatePayload = (d: TaskFormData) => {
  const isTarget = d.progress_mode === 'target';
  const due = d.due_date && String(d.due_date).trim() !== '' ? d.due_date : null;

  const payload: any = {
    title: d.title,
    description: d.description ?? null,
    priority: d.priority ?? 'Medium',
    due_date: due,
    project_id: d.project_id ?? null,
    progress_mode: d.progress_mode ?? 'manual',
    assignee_ids: pickValidIds(d.assignee_ids),
  };

  if (d.progress_mode === 'manual') {
    payload.progress_percentage = Math.max(0, Math.min(100, Math.round(d.progress_percentage ?? 0)));
  } else if (isTarget) {
    payload.progress_goal = d.progress_goal ?? null;
    payload.progress_current = d.progress_current ?? 0;
  }

  payload.assignee_id = UUIDish(d.assignee_id) ? d.assignee_id! : null;
  return payload;
};

export function TasksTable({
  mode,
  filters,
  projects,
  users,
  onChanged,
}: {
  mode: 'all' | 'inprogress' | 'completed' | 'overdue' | 'archived';
  filters?: Filters;
  projects: { id: string; name: string }[];
  users: { id: string; name: string; email?: string | null }[];
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<FullTask[]>([]);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef<AbortController | null>(null);

  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<FullTask | null>(null);

  const [progressTask, setProgressTask] = useState<FullTask | null>(null);
  const [showProgressOptions, setShowProgressOptions] = useState(false);
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [showStepsDialog, setShowStepsDialog] = useState(false);

  const formatDate = useStableFormatDate();

  const normalize = (t: any): FullTask => ({
    ...t,
    progress_mode: t.progress_mode ?? 'manual',
    progress_goal: t.progress_goal ?? null,
    progress_current: t.progress_current ?? 0,
    steps: Array.isArray(t.steps) ? t.steps : [],
    assignees: Array.isArray(t.assignees) ? t.assignees : [],
    priority: (t.priority ?? 'Medium') as FullTask['priority'],
  });

  const fetchTasks = useCallback(async () => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;

    setLoading(true);
    try {
      // cache-busting to avoid stale reads
      const r = await fetch(`${API_BASE}/api/tasks?ts=${Date.now()}`, {
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        signal: ctrl.signal,
        cache: 'no-store',
      });
      if (!r.ok) throw new Error('Failed to load tasks');
      const data = await r.json();
      const normalized: FullTask[] = (Array.isArray(data) ? data : []).map(normalize);

      const withOverdueUI = normalized.map((t) =>
        isOverdue(t) && t.status !== 'Overdue' ? ({ ...t, status: 'Overdue' as const }) : t
      );

      setTasks(withOverdueUI);

      const toMark = normalized.filter((t) => isOverdue(t) && t.status !== 'Overdue');
      if (toMark.length) {
        Promise.all(
          toMark.map((t) =>
            fetch(`${API_BASE}/api/tasks/${t.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', ...authHeaders() },
              body: JSON.stringify({ status: 'Overdue' }),
            })
          )
        ).catch(() => {});
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        toast({ title: 'Error', description: e.message || 'Failed to load tasks', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Global "Add Task" button event
  useEffect(() => {
    const handler = () => {
      setTaskToEdit(null);
      setShowTaskForm(true);
    };
    window.addEventListener('tasks:add' as any, handler);
    return () => window.removeEventListener('tasks:add' as any, handler);
  }, []);

  useEffect(() => {
    fetchTasks();
    return () => inFlight.current?.abort();
  }, [fetchTasks]);

  /** ---------- Handle demo imports (e.g., Read.ai) ---------- */
  useEffect(() => {
    type ImportDetail = { source?: string; tasks?: any[] };

    const onImport = (e: Event) => {
      const detail = (e as CustomEvent<ImportDetail>).detail || {};
      if (!detail?.tasks?.length) return;
      if (detail.source && detail.source !== 'readai') return;

      const incoming = (detail.tasks || []).map(normalize);

      setTasks((prev) => {
        const map = new Map<string, FullTask>();
        [...prev, ...incoming].forEach((t) => {
          const enriched = isOverdue(t) && t.status !== 'Overdue' ? ({ ...t, status: 'Overdue' as const }) : t;
          map.set(enriched.id, enriched);
        });
        return Array.from(map.values());
      });
    };

    window.addEventListener('tasks:import', onImport as EventListener);
    return () => window.removeEventListener('tasks:import', onImport as EventListener);
  }, []);
  /** -------------------------------------------------------- */

  /* ---------- helpers ---------- */
  const patchTask = useCallback((id: string, patch: Partial<FullTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const onRangeChange = useCallback(
    (id: string, value: number) => {
      patchTask(id, { progress_percentage: value });
    },
    [patchTask]
  );

  const [savingId, setSavingId] = useState<string | null>(null);
  const onSaveProgress = useCallback(
    async (id: string, pct: number) => {
      setSavingId(id);
      const t = tasks.find((x) => x.id === id);
      if (!t) {
        setSavingId(null);
        return;
      }
      try {
        const nextStatus = t.status === 'Archived' ? t.status : computeStatusFromPct(pct);
        const maybeOverdue = isOverdue({ due_date: t.due_date!, status: nextStatus, progress_percentage: pct });
        const finalStatus = nextStatus === 'Done' ? 'Done' : maybeOverdue ? 'Overdue' : nextStatus;

        patchTask(id, { progress_percentage: pct, status: finalStatus });

        const r = await fetch(`${API_BASE}/api/tasks/${id}/progress`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ progress_percentage: pct }),
        });
        if (!r.ok) throw new Error('Failed to update progress');

        await putStatusForPct({ ...t, status: finalStatus }, pct);

        onChanged?.();
      } catch (e: any) {
        toast({ title: 'Error', description: e.message || 'Failed to update progress', variant: 'destructive' });
      } finally {
        setSavingId(null);
      }
    },
    [tasks, patchTask, toast, onChanged]
  );

  // update priority (optimistic)
  const onChangePriority = useCallback(
    async (id: string, p: Priority) => {
      const prev = tasks.find((t) => t.id === id)?.priority as Priority | undefined;
      patchTask(id, { priority: p as FullTask['priority'] });

      try {
        const res = await fetch(`${API_BASE}/api/tasks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ priority: p }),
        });
        if (!res.ok) throw new Error('Failed to update priority');
        toast({ title: 'Priority updated', description: `Set to ${PRIORITY_META[p].label}` });
        onChanged?.();
      } catch (e: any) {
        if (prev) patchTask(id, { priority: prev as FullTask['priority'] });
        toast({ title: 'Error', description: e?.message || 'Failed to update priority', variant: 'destructive' });
      }
    },
    [patchTask, tasks, toast, onChanged]
  );

  const onEdit = useCallback((task: FullTask) => {
    setTaskToEdit(task);
    setShowTaskForm(true);
  }, []);

  const onArchive = useCallback(
    async (id: string) => {
      try {
        patchTask(id, { status: 'Archived' }); // optimistic
        const updateResponse = await fetch(`${API_BASE}/api/tasks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ status: 'Archived' }),
        });
        if (!updateResponse.ok) throw new Error('Failed to archive task');
        toast({ title: 'Task archived' });
        onChanged?.();
      } catch (e: any) {
        toast({ title: 'Error', description: e.message || 'Failed to archive task', variant: 'destructive' });
        fetchTasks(); // revert
      }
    },
    [toast, patchTask, onChanged, fetchTasks]
  );

  const onUnarchive = useCallback(
    async (id: string) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      const restored = deriveUnarchivedStatus(t);
      try {
        patchTask(id, { status: restored }); // optimistic
        const updateResponse = await fetch(`${API_BASE}/api/tasks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ status: restored }),
        });
        if (!updateResponse.ok) throw new Error('Failed to unarchive task');
        toast({ title: 'Task unarchived' });
        onChanged?.();
      } catch (e: any) {
        toast({ title: 'Error', description: e.message || 'Failed to unarchive task', variant: 'destructive' });
        fetchTasks(); // revert
      }
    },
    [tasks, patchTask, toast, onChanged, fetchTasks]
  );

  // CREATE/UPDATE (with optimistic add for create)
  const submitTask = useCallback(
    async (data: TaskFormData, initialSteps?: TaskStepFormData[]) => {
      try {
        if (taskToEdit) {
          // UPDATE
          const r = await fetch(`${API_BASE}/api/tasks/${taskToEdit.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(buildUpdatePayload(data)),
          });

          if (r.status === 403) {
            toast({
              title: 'Not allowed',
              description: 'Only the creator or company owner can edit this task.',
              variant: 'destructive',
            });
            return;
          }

          if (!r.ok) throw new Error('Failed to update task');

          // If switched to steps on edit and we have steps to seed, push them now
          if (data.progress_mode === 'steps' && initialSteps?.length) {
            const stepsToSend = initialSteps.map(s => ({ ...s, id: undefined }));
            const r2 = await fetch(`${API_BASE}/api/tasks/${taskToEdit.id}/progress`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', ...authHeaders() },
              body: JSON.stringify({ progress_mode: 'steps', steps: stepsToSend }),
            });

            if (r2.status === 403) {
              toast({
                title: 'Not allowed',
                description: 'You cannot update steps for a task you are not assigned to.',
                variant: 'destructive',
              });
              return;
            }

            if (!r2.ok) throw new Error('Failed to seed steps');
          }
        } else {
          // CREATE
          const createRes = await fetch(`${API_BASE}/api/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(buildCreatePayload(data)),
          });
          if (!createRes.ok) throw new Error('Failed to create task');

          const created = await createRes.json();

          // Show immediately (optimistic insert)
          const normalized = normalize(created);
          const withOverdueUI =
            isOverdue(normalized) && normalized.status !== 'Overdue'
              ? ({ ...normalized, status: 'Overdue' as const })
              : normalized;
          setTasks((prev) => [withOverdueUI, ...prev]);

          // Seed steps immediately if step-based
          if (data.progress_mode === 'steps' && initialSteps?.length) {
            const stepsToSend = initialSteps.map(s => ({ ...s, id: undefined, task_id: created.id }));
            const r2 = await fetch(`${API_BASE}/api/tasks/${created.id}/progress`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', ...authHeaders() },
              body: JSON.stringify({ progress_mode: 'steps', steps: stepsToSend }),
            });

            if (r2.status === 403) {
              toast({
                title: 'Not allowed',
                description: 'You cannot update steps for a task you are not assigned to.',
                variant: 'destructive',
              });
              return;
            }
            if (!r2.ok) throw new Error('Failed to seed steps for new task');
          }
        }

        setShowTaskForm(false);
        setTaskToEdit(null);

        // Fresh read (cache-busting) so server-enriched fields show up
        await fetchTasks();
        onChanged?.();
      } catch (e: any) {
        toast({
          title: 'Error',
          description: e.message || 'Failed to save task',
          variant: 'destructive',
        });
      }
    },
    [taskToEdit, fetchTasks, onChanged, toast]
  );

  /* ---------- fetch full task (with steps) before opening progress ---------- */
  const fetchTaskById = useCallback(async (id: string): Promise<FullTask | null> => {
    try {
      const r = await fetch(`${API_BASE}/api/tasks/${id}?ts=${Date.now()}`, {
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        cache: 'no-store',
      });
      if (!r.ok) return null;
      const t = await r.json();
      return normalize(t);
    } catch {
      return null;
    }
  }, []);

  const onOpenProgress = useCallback(
    async (t: FullTask) => {
      let base: FullTask = { ...t, steps: Array.isArray(t.steps) ? t.steps : [] };
      setProgressTask(base);
      setShowProgressOptions(true);

      if (t.progress_mode === 'steps' && (!t.steps || t.steps.length === 0)) {
        const full = await fetchTaskById(t.id);
        if (full) {
          setProgressTask(full);
        }
      }
    },
    [fetchTaskById]
  );

  const applyPatchFromDialog = useCallback(
    (patch: Partial<FullTask>) => {
      if (!patch?.id) return;

      setTasks((prevTasks) => {
        const idx = prevTasks.findIndex((t) => t.id === patch.id);
        if (idx !== -1) {
          const updated = [...prevTasks];
          updated[idx] = { ...updated[idx], ...patch };
          return updated;
        }
        return prevTasks;
      });

      setProgressTask((prev) => {
        if (prev && prev.id === patch.id) {
          return { ...prev, ...patch };
        }
        return prev;
      });

      onChanged?.();
    },
    [onChanged]
  );

  const filtered = useMemo(() => {
    let rows = tasks;

    if (mode !== 'all') {
      if (mode === 'inprogress') {
        rows = rows.filter(
          (t) => t.status !== 'Archived' && (t.progress_percentage ?? 0) >= 1 && (t.progress_percentage ?? 0) < 100
        );
      } else if (mode === 'completed') {
        rows = rows.filter((t) => t.status !== 'Archived' && (t.progress_percentage ?? 0) >= 100);
      } else if (mode === 'overdue') {
        rows = rows.filter((t) => t.status === 'Overdue');
      } else if (mode === 'archived') {
        rows = rows.filter((t) => t.status === 'Archived');
      }
    }

    if (filters?.projectId) rows = rows.filter((t) => t.project_id === filters.projectId);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter((t) => {
        const names = Array.isArray(t.assignees)
          ? t.assignees.map((u) => (u.name || '').toLowerCase()).join(' ')
          : (t.assignee_name || '').toLowerCase();

        return (
          t.title.toLowerCase().includes(q) ||
          (t.project_name || '').toLowerCase().includes(q) ||
          names.includes(q)
        );
      });
    }
    rows = [...rows].sort((a, b) => {
      const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      if (ad !== bd) return ad - bd;
      const pOrder: Record<FullTask['priority'], number> = { High: 0, Medium: 1, Low: 2 };
      return pOrder[a.priority] - pOrder[b.priority];
    });
    return rows;
  }, [tasks, mode, filters?.projectId, filters?.search]);

  return (
    <Card className="p-0 overflow-hidden">
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading tasks…
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Assignees</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead className="w-[220px]">Progress</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    No tasks found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    savingId={savingId}
                    onRangeChange={() => {}}
                    onSaveProgress={onSaveProgress}
                    onEdit={onEdit}
                    onArchive={onArchive}
                    onUnarchive={onUnarchive}
                    onOpenProgress={onOpenProgress}
                    formatDate={formatDate}
                    onChangePriority={onChangePriority}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add/Edit Task Dialog */}
      <Dialog
        open={showTaskForm}
        onOpenChange={(o) => {
          if (!o) {
            setShowTaskForm(false);
            setTaskToEdit(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{taskToEdit ? 'Edit Task' : 'New Task'}</DialogTitle>
          </DialogHeader>
          <TaskForm
            task={taskToEdit as any}
            onCancel={() => {
              setShowTaskForm(false);
              setTaskToEdit(null);
            }}
            onSave={submitTask}
            projects={projects}
            users={users}
          />
        </DialogContent>
      </Dialog>

      {/* Progress Modals */}
      {progressTask && (
        <>
          <ProgressOptionsDialog
            task={progressTask}
            open={showProgressOptions}
            onClose={() => setShowProgressOptions(false)}
            onSaved={(patch) => {
              applyPatchFromDialog(patch);
            }}
            openTarget={() => {
              setShowProgressOptions(false);
              setShowTargetDialog(true);
            }}
            openSteps={() => {
              setShowProgressOptions(false);
              setShowStepsDialog(true);
            }}
          />
          <TargetDialog
            task={progressTask}
            open={showTargetDialog}
            onClose={() => {
              setShowTargetDialog(false);
              setShowProgressOptions(true);
            }}
            onSaved={(patch) => {
              applyPatchFromDialog(patch);
            }}
          />
          <StepsDialog
            task={progressTask}
            open={showStepsDialog}
            onClose={() => {
              setShowStepsDialog(false);
              setShowProgressOptions(true);
            }}
            onSaved={(patch) => {
              applyPatchFromDialog(patch);
            }}
          />
        </>
      )}
    </Card>
  );
}
