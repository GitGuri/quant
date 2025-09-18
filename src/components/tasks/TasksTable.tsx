import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, Edit, Trash2, Target, Save, ListChecks } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { TaskForm, type TaskFormData } from './TaskForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

const API_BASE = 'https://quantnow.onrender.com';

/* ---------- Types ---------- */
type BaseTask = {
  id: string;
  title: string;
  status: 'To Do' | 'In Progress' | 'Review' | 'Done' | 'Archived' | 'Overdue';
  progress_percentage: number;
  due_date?: string | null;
  assignee_name?: string | null;
  assignee_id?: string | null;
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

type FullTask = BaseTask & {
  progress_mode: 'manual' | 'target' | 'steps';
  progress_goal: number | null;
  progress_current: number | null;
  steps: TaskStep[]; // always an array for the dialogs
};

type Filters = {
  search?: string;
  projectId?: string;
  tab?: 'all' | 'inprogress' | 'completed' | 'overdue' | 'archived';
};

/* ---------- Helpers & API hooks (same behavior as TaskCard) ---------- */
const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const computeStatusFromPct = (pct: number): FullTask['status'] => {
  if (pct >= 100) return 'Done';
  if (pct >= 75) return 'Review';
  if (pct >= 25) return 'In Progress';
  return 'To Do';
};

// Define putStatusForPct outside dialogs for consistency
async function putStatusForPct(task: FullTask, pctVal: number) {
  const nextStatus = computeStatusFromPct(pctVal);
  if (nextStatus === task.status) return;
  // Only send the status field to update
  const response = await fetch(`${API_BASE}/api/tasks/${task.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status: nextStatus }), // Send only status
  });
  if (!response.ok) {
    console.error(`Failed to update task status: ${response.status}`);
    // Optionally, throw an error or handle it based on your app's needs
    // throw new Error(`HTTP ${response.status} - Failed to update status`);
  }
}

const useIncrementProgress = () => {
  return useCallback(async (taskId: string, incrementValue: number) => {
    const response = await fetch(`${API_BASE}/api/tasks/${taskId}/progress/increment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ increment: incrementValue }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, []);
};

const useUpdateTaskProgress = () => {
  return useCallback(
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
};

/* ---------- Progress dialogs (lifted from TaskCard) ---------- */
function TargetDialog({
  task,
  open,
  onClose,
  onSaved,
}: {
  task: FullTask;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateTaskProgress = useUpdateTaskProgress();
  const [goal, setGoal] = useState<number | ''>(task.progress_goal ?? '');
  const [current, setCurrent] = useState<number>(task.progress_current ?? 0);
  const [isSaving, setIsSaving] = useState(false);

  const pct =
    goal === '' || goal === 0
      ? 0
      : Math.max(0, Math.min(100, Math.round(((current ?? 0) / Number(goal)) * 100)));

  const save = async () => {
    setIsSaving(true);
    try {
      await updateTaskProgress(task.id, {
        progress_mode: 'target',
        progress_goal: goal === '' ? null : goal,
        progress_current: current,
      });
      await putStatusForPct(task, pct);
      onSaved();
      onClose();
    } catch (error: any) {
       console.error("Failed to save target progress:", error);
       // Consider using toast here if not handled by onSaved/caller
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" /> Set Target for "{task.title}"
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
                  <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${pct}%` }} />
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
  onSaved: () => void;
}) {
  const updateTaskProgress = useUpdateTaskProgress();
  // Use the steps directly from the task prop, which comes from the table state
  const [steps, setSteps] = useState<TaskStep[]>([...(task.steps ?? [])]);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
      onSaved();
      onClose();
    } catch (error: any) {
       console.error("Failed to save steps progress:", error);
       // Consider using toast here if not handled by onSaved/caller
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
            <Button onClick={add} size="sm">
              +
            </Button>
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
                <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${stepPct}%` }} />
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
  onSaved: () => void;
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
      onSaved();
      onClose();
    } catch (error: any) {
       console.error("Failed to save manual progress:", error);
       // Consider using toast here if not handled by onSaved/caller
    } finally {
      setIsSaving(false);
    }
  };

  // --- FIXED INC FUNCTION ---
  const inc = async (n: number) => {
    setIsSaving(true);
    try {
      let newPct: number | null = null;

      // Optimistically calculate new percentage if in target mode and goal is valid
      if (task.progress_mode === 'target' && task.progress_goal && task.progress_goal > 0) {
        const newCurrent = Math.min((task.progress_current ?? 0) + n, task.progress_goal);
        newPct = Math.round((newCurrent / task.progress_goal) * 100);
        // Ensure percentage is within bounds
        newPct = Math.max(0, Math.min(100, newPct));
      }

      // 1. Call the API to increment progress on the backend
      await incrementProgress(task.id, n);

      // 2. If we have a calculated new percentage, update the task status
      if (newPct !== null) {
        await putStatusForPct(task, newPct);
      }
      // Note: If newPct is null (e.g., invalid goal), status update is skipped here.
      // The main refresh (onSaved) will fetch the latest data from the server,
      // which should have the correct new progress_current and potentially updated status.

      // 3. CRUCIALLY: Refresh the main task list to reflect the changes
      //    This is the key fix to ensure the table updates.
      onSaved(); // This calls refreshAfterProgressSave -> fetchTasks -> UI update

      // 4. Close the dialog
      onClose();

    } catch (error: any) {
      console.error("Failed to increment progress:", error);
      // Use toast to inform the user
      // Assuming 'toast' is available in scope or passed down (it's in TasksTable scope)
      // If not, you'd need to pass it down or handle error display differently.
      // For now, relying on TasksTable's error handling in refreshAfterProgressSave/fetchTasks is okay.
    } finally {
      // 5. Always reset saving state
      setIsSaving(false);
    }
  };
  // --- END FIXED INC FUNCTION ---

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" /> Edit Progress — "{task.title}"
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
                  <Target className="h-4 w-4 mr-2" />
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
                className="bg-blue-600 h-1.5 rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, Math.round(task.progress_percentage || 0)))}%` }}
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

/* ---------- Main table ---------- */
export function TasksTable({
  mode,
  filters,
  onChanged,
}: {
  mode: 'all' | 'inprogress' | 'completed' | 'overdue' | 'archived';
  filters?: Filters;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  // IMPORTANT: We keep full task info in the list so progress modals don't need GET /tasks/:id
  const [tasks, setTasks] = useState<FullTask[]>([]);
  const [loading, setLoading] = useState(true);
  // Add/Edit Task dialog
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<FullTask | null>(null);
  // Progress dialogs state
  const [progressTask, setProgressTask] = useState<FullTask | null>(null);
  const [showProgressOptions, setShowProgressOptions] = useState(false);
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [showStepsDialog, setShowStepsDialog] = useState(false);
  // global "add task"
  useEffect(() => {
    const handler = () => { setTaskToEdit(null); setShowTaskForm(true); };
    window.addEventListener('tasks:add' as any, handler);
    return () => window.removeEventListener('tasks:add' as any, handler);
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/tasks`, { headers: { 'Content-Type': 'application/json', ...authHeaders() } });
      if (!r.ok) throw new Error('Failed to load tasks');
      const data = await r.json();
      // Normalize: ensure progress fields & steps exist so dialogs work like TaskCard
      const normalized: FullTask[] = (Array.isArray(data) ? data : []).map((t: any) => ({
        ...t,
        progress_mode: t.progress_mode ?? 'manual',
        progress_goal: t.progress_goal ?? null,
        progress_current: t.progress_current ?? 0,
        steps: Array.isArray(t.steps) ? t.steps : [], // Ensure steps array exists
      }));
      setTasks(normalized);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to load tasks', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const filtered = useMemo(() => {
    let rows = tasks;
    if (mode !== 'all') {
      if (mode === 'inprogress') rows = rows.filter(t => t.status === 'In Progress' || t.status === 'Review' || t.status === 'To Do');
      if (mode === 'completed') rows = rows.filter(t => t.status === 'Done');
      if (mode === 'overdue') rows = rows.filter(t => t.status === 'Overdue');
      if (mode === 'archived') rows = rows.filter(t => t.status === 'Archived');
    }
    if (filters?.projectId) rows = rows.filter(t => t.project_id === filters.projectId);
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.assignee_name || '').toLowerCase().includes(q) ||
        (t.project_name || '').toLowerCase().includes(q)
      );
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

  // inline progress update (kept from your table)
  const [savingId, setSavingId] = useState<string | null>(null);
  const saveProgress = async (task: FullTask, pct: number) => {
    setSavingId(task.id);
    try {
      const r = await fetch(`${API_BASE}/api/tasks/${task.id}/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ progress_percentage: pct }),
      });
      if (!r.ok) throw new Error('Failed to update progress');
      // also drive status like TaskCard does
      await putStatusForPct(task, pct);
      toast({ title: 'Progress updated', description: `${pct}%` });
      await fetchTasks();
      onChanged?.();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to update progress', variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  // edit/delete
  const handleEdit = (t: FullTask) => { setTaskToEdit(t); setShowTaskForm(true); };
  const handleDelete = async (id: string) => {
    try {
      const r = await fetch(`${API_BASE}/api/tasks/${id}`, { method: 'DELETE', headers: { ...authHeaders() } });
      if (!r.ok) throw new Error('Failed to delete task');
      toast({ title: 'Task deleted' });
      await fetchTasks();
      onChanged?.();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to delete task', variant: 'destructive' });
    }
  };

  const submitTask = async (data: TaskFormData) => {
    try {
      if (taskToEdit) {
        const r = await fetch(`${API_BASE}/api/tasks/${taskToEdit.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            ...data,
            progress_mode: data.progress_mode,
            progress_goal: data.progress_mode === 'target' ? data.progress_goal : null,
            progress_current: data.progress_mode === 'target' ? data.progress_current : 0,
          }),
        });
        if (!r.ok) throw new Error('Failed to update task');
        toast({ title: 'Task updated' });
      } else {
        const r = await fetch(`${API_BASE}/api/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            ...data,
            assignee_id: data.assignee_id ?? null,
          }),
        });
        if (!r.ok) throw new Error('Failed to create task');
        toast({ title: 'Task created' });
      }
      setShowTaskForm(false);
      setTaskToEdit(null);
      await fetchTasks();
      onChanged?.();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to save task', variant: 'destructive' });
    }
  };

  // --- REVERTED TO ORIGINAL SIMPLER VERSION ---
  // open progress modals using the task data already loaded in the table state
  const openProgressFor = (t: FullTask) => {
    // Ensure steps array exists for steps dialog (this was the key part from the original)
    const full: FullTask = { ...t, steps: Array.isArray(t.steps) ? t.steps : [] };
    setProgressTask(full);
    setShowProgressOptions(true);
  };
  // --- END REVERTED ---

  const refreshAfterProgressSave = async () => {
    await fetchTasks();
    onChanged?.();
  };

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
                <TableHead>Assignee</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[220px]">Progress</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">No tasks found.</TableCell>
                </TableRow>
              ) : filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell>{t.project_name || '—'}</TableCell>
                  <TableCell>{t.assignee_name || '—'}</TableCell>
                  <TableCell>{t.priority}</TableCell>
                  <TableCell>{t.due_date ? new Date(t.due_date).toLocaleDateString('en-ZA') : '—'}</TableCell>
                  <TableCell>{t.status}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={t.progress_percentage ?? 0}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          setTasks(prev => prev.map(x => x.id === t.id ? { ...x, progress_percentage: next } : x));
                        }}
                        className="w-40"
                      />
                      <span className="w-10 text-right tabular-nums">{Math.round(t.progress_percentage ?? 0)}%</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveProgress(t, Math.round(t.progress_percentage ?? 0))}
                        disabled={savingId === t.id}
                        title="Save progress"
                      >
                        {savingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(t)} title="Edit">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)} title="Delete">
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                      {/* PROGRESS BUTTON — opens the same progress modals as TaskCard */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openProgressFor(t)}
                        title="Update progress (target/steps/manual)"
                      >
                        <Target className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {/* Add/Edit Task Dialog */}
      <Dialog open={showTaskForm} onOpenChange={(o) => { if (!o) { setShowTaskForm(false); setTaskToEdit(null); } }}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{taskToEdit ? 'Edit Task' : 'New Task'}</DialogTitle>
          </DialogHeader>
          <TaskForm
            task={taskToEdit as any}
            onCancel={() => { setShowTaskForm(false); setTaskToEdit(null); }}
            onSave={submitTask}
          />
        </DialogContent>
      </Dialog>
      {/* Progress Modals (exact behavior as TaskCard) */}
      {progressTask && (
        <>
          <ProgressOptionsDialog
            task={progressTask}
            open={showProgressOptions}
            onClose={() => setShowProgressOptions(false)}
            onSaved={refreshAfterProgressSave}
            openTarget={() => { setShowProgressOptions(false); setShowTargetDialog(true); }}
            openSteps={() => { setShowProgressOptions(false); setShowStepsDialog(true); }}
          />
          <TargetDialog
            task={progressTask}
            open={showTargetDialog}
            onClose={() => { setShowTargetDialog(false); setShowProgressOptions(true); }}
            onSaved={refreshAfterProgressSave}
          />
          <StepsDialog
            task={progressTask} // Pass the task with its steps array directly
            open={showStepsDialog}
            onClose={() => { setShowStepsDialog(false); setShowProgressOptions(true); }}
            onSaved={refreshAfterProgressSave}
          />
        </>
      )}
    </Card>
  );
}