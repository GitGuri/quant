// TaskCard.tsx
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Calendar,
  User,
  Folder,
  Target,
  ListChecks,
  Plus,
  Minus,
} from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TaskFormData } from './TaskForm';


// ---------- Config ----------
const API_BASE = 'https://quantnow-sa1e.onrender.com';

// ---------- Types ----------
interface TaskStep {
  id: string;
  task_id: string;
  title: string;
  weight: number | null;
  is_done: boolean;
  position: number;
}

interface Task {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: 'To Do' | 'In Progress' | 'Review' | 'Done';
  priority: 'Low' | 'Medium' | 'High';
  due_date?: string;
  progress_percentage: number;
  created_at: string;
  updated_at: string;
  assignee_id?: string | null;
  assignee_name?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  progress_mode: 'manual' | 'target' | 'steps';
  progress_goal: number | null;
  progress_current: number | null;
  steps: TaskStep[];
}

const priorityColors = {
  Low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  High: 'bg-red-50 text-red-700 border-red-200',
};

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  priority: Task['priority'];
  project_name?: string | null;
  projects: { id: string; name: string }[];
  users?: { id: string; name: string }[];
  onTaskUpdate?: () => void;
}

// ---------- Helpers ----------
const computeStatusFromPct = (pct: number): Task['status'] => {
  if (pct >= 100) return 'Done';
  if (pct >= 75) return 'Review';
  if (pct >= 25) return 'In Progress';
  return 'To Do';
};

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ---------- API hooks ----------
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
        Pick<Task, 'progress_mode' | 'progress_goal' | 'progress_current' | 'steps' | 'progress_percentage'>
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

// ---------- Target Dialog ----------
const TargetDialog = ({
  task,
  isOpen,
  onClose,
  onUpdateProgress,
  onTaskUpdate,
}: {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onUpdateProgress: ReturnType<typeof useUpdateTaskProgress>;
  onTaskUpdate?: () => void;
}) => {
  const [goal, setGoal] = useState<number | ''>(task.progress_goal ?? '');
  const [current, setCurrent] = useState<number>(task.progress_current ?? 0);
  const [isSaving, setIsSaving] = useState(false);

  const pct =
    goal === '' || goal === 0
      ? 0
      : Math.max(0, Math.min(100, Math.round(((current ?? 0) / Number(goal)) * 100)));

  const putStatusForPct = async (pctVal: number) => {
    const nextStatus = computeStatusFromPct(pctVal);
    if (nextStatus === task.status) return;
    await fetch(`${API_BASE}/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ...task, status: nextStatus }),
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateProgress(task.id, {
        progress_mode: 'target',
        progress_goal: goal === '' ? null : goal,
        progress_current: current,
      });
      await putStatusForPct(pct);
      onTaskUpdate?.();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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
          <Button onClick={handleSave} disabled={isSaving || (goal !== '' && current > Number(goal))}>
            {isSaving ? 'Saving...' : 'Save Target'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Steps Dialog ----------
const StepsDialog = ({
  task,
  isOpen,
  onClose,
  onUpdateProgress,
  onTaskUpdate,
}: {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onUpdateProgress: ReturnType<typeof useUpdateTaskProgress>;
  onTaskUpdate?: () => void;
}) => {
  const [steps, setSteps] = useState<TaskStep[]>([...task.steps]);
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

  // derive progress live
  const totalW = steps.reduce((sum, s) => sum + (s.weight ?? 0), 0);
  const doneW = steps.filter((s) => s.is_done).reduce((sum, s) => sum + (s.weight ?? 0), 0);
  const stepPct = totalW > 0 ? Math.round((doneW / totalW) * 100) : 0;

  const putStatusForPct = async (pctVal: number) => {
    const nextStatus = computeStatusFromPct(pctVal);
    if (nextStatus === task.status) return;
    await fetch(`${API_BASE}/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ...task, status: nextStatus }),
    });
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const stepsToSend = steps.map((s) => ({ ...s, id: s.id.startsWith('new-') ? undefined : s.id }));
      await onUpdateProgress(task.id, {
        progress_mode: 'steps',
        steps: stepsToSend,
        progress_percentage: stepPct,
      });
      await putStatusForPct(stepPct);
      onTaskUpdate?.();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {steps.length ? (
              steps.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <Checkbox checked={s.is_done} onCheckedChange={() => toggle(i)} />
                  <span className={`flex-1 text-sm ${s.is_done ? 'line-through text-gray-500' : ''}`}>{s.title}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => remove(i)}>
                    <Minus className="h-4 w-4" />
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
};

// ---------- Progress Options Dialog ----------
const ProgressOptionsDialog = ({
  task,
  isOpen,
  onClose,
  onUpdateProgress,
  onIncrementProgress,
  onTaskUpdate,
  openTarget,
  openSteps,
}: {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onUpdateProgress: ReturnType<typeof useUpdateTaskProgress>;
  onIncrementProgress: ReturnType<typeof useIncrementProgress>;
  onTaskUpdate?: () => void;
  openTarget: () => void;
  openSteps: () => void;
}) => {
  const [manualProgress, setManualProgress] = useState<number>(task.progress_percentage || 0);
  const [isSaving, setIsSaving] = useState(false);

  const putStatusForPct = async (pctVal: number) => {
    const nextStatus = computeStatusFromPct(pctVal);
    if (nextStatus === task.status) return;
    await fetch(`${API_BASE}/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ...task, status: nextStatus }),
    });
  };

  const manualSave = async () => {
    setIsSaving(true);
    try {
      const pct = Math.max(0, Math.min(100, Math.round(manualProgress)));
      await onUpdateProgress(task.id, { progress_mode: 'manual', progress_percentage: pct });
      await putStatusForPct(pct);
      onTaskUpdate?.();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const inc = async (n: number) => {
    setIsSaving(true);
    try {
      // optimistic new % if we're in target mode and have goal/current
      let newPct: number | null = null;
      if (task.progress_mode === 'target' && task.progress_goal) {
        const newCurrent = Math.min((task.progress_current ?? 0) + n, task.progress_goal);
        newPct = Math.round((newCurrent / task.progress_goal) * 100);
      }
      await onIncrementProgress(task.id, n);
      if (newPct !== null) {
        await putStatusForPct(newPct);
      }
      onTaskUpdate?.();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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
              <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${Math.max(0, Math.min(100, Math.round(task.progress_percentage || 0)))}%` }} />
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
};

// ---------- Component ----------
export function TaskCard({
  task,
  onEdit,
  onDelete,
  priority,
  project_name,
  projects,
  users,
  onTaskUpdate,
}: TaskCardProps) {
  const [alertOpen, setAlertOpen] = useState(false);
  const [showOverviewDialog, setShowOverviewDialog] = useState(false);
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [showStepsDialog, setShowStepsDialog] = useState(false);
  const [showProgressOptionsDialog, setShowProgressOptionsDialog] = useState(false);

  const incrementProgress = useIncrementProgress();
  const updateTaskProgress = useUpdateTaskProgress();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 0,
    opacity: isDragging ? 0.8 : 1,
  } as const;

  // derive step-based percentage for display if steps mode
  const derivedFromSteps = useMemo(() => {
    if (task.progress_mode !== 'steps' || !task.steps?.length) return null;
    const total = task.steps.reduce((s, st) => s + (st.weight ?? 0), 0);
    if (total <= 0) return 0;
    const done = task.steps.filter((s) => s.is_done).reduce((s, st) => s + (st.weight ?? 0), 0);
    return Math.round((done / total) * 100);
  }, [task.progress_mode, task.steps]);

  // final % we render on the card
  const displayPct = Math.max(
    0,
    Math.min(100, Math.round(derivedFromSteps ?? task.progress_percentage ?? 0))
  );

  const handleEditSave = (updatedFormTask: TaskFormData) => {
    onEdit({
      ...task,
      title: updatedFormTask.title,
      description: updatedFormTask.description,
      priority: updatedFormTask.priority,
      assignee_id: updatedFormTask.assignee_id ?? null,
      due_date: updatedFormTask.due_date,
      progress_percentage: updatedFormTask.progress_percentage,
      project_id: updatedFormTask.project_id ?? null,
      progress_mode: updatedFormTask.progress_mode,
      progress_goal: updatedFormTask.progress_goal,
      progress_current: updatedFormTask.progress_current,
    });
  };

  const handleDeleteConfirm = () => {
    onDelete(task.id);
    setAlertOpen(false);
  };

  const handleEditButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowProgressOptionsDialog(true);
  };

  const handleOverviewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowOverviewDialog(true);
  };

  // Compact card for Done
  if (task.status === 'Done') {
    return (
      <motion.div
        ref={setNodeRef}
        style={style}
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        whileHover={{ scale: 1.02 }}
        className="cursor-default"
      >
        <Card className="hover:shadow-lg transition-all duration-200 bg-white border border-gray-200 flex items-center justify-between p-2">
          <CardContent className="flex-1 p-0 flex items-center gap-2 cursor-pointer" onClick={handleOverviewClick}>
            <span className="font-medium text-sm text-gray-800 line-clamp-1">{task.title}</span>
          </CardContent>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 cursor-grab"
              {...listeners}
              {...attributes}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              aria-label="Drag task"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>

            <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 hover:bg-red-50 hover:text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAlertOpen(true);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Task</AlertDialogTitle>
                  <AlertDialogDescription>Are you sure you want to delete "{task.title}"?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Card>

        {/* Overview */}
        <Dialog open={showOverviewDialog} onOpenChange={setShowOverviewDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Task Overview: {task.title}</DialogTitle>
              <DialogDescription>Detailed information about this task.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Title</Label>
                <Input defaultValue={task.title} readOnly className="col-span-3" />
              </div>
              {task.description && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Description</Label>
                  <Textarea defaultValue={task.description} readOnly className="col-span-3" />
                </div>
              )}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Status</Label>
                <Input defaultValue={task.status} readOnly className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Priority</Label>
                <Input defaultValue={task.priority} readOnly className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Progress</Label>
                <Input defaultValue={`${displayPct}%`} readOnly className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Mode</Label>
                <Input defaultValue={task.progress_mode} readOnly className="col-span-3" />
              </div>
              {task.progress_mode === 'target' && (
                <>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Goal</Label>
                    <Input defaultValue={task.progress_goal ?? 'Not set'} readOnly className="col-span-3" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Current</Label>
                    <Input defaultValue={task.progress_current ?? 0} readOnly className="col-span-3" />
                  </div>
                </>
              )}
              {task.progress_mode === 'steps' && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Steps</Label>
                  <div className="col-span-3 text-sm">
                    {task.steps.length ? (
                      <ul className="list-disc pl-5 space-y-1">
                        {task.steps.map((s) => (
                          <li key={s.id} className={s.is_done ? 'line-through text-gray-500' : ''}>
                            {s.title} {s.is_done ? '(Done)' : '(Pending)'}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-500">No steps defined.</span>
                    )}
                  </div>
                </div>
              )}
              {task.assignee_name && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Assignee</Label>
                  <Input defaultValue={task.assignee_name} readOnly className="col-span-3" />
                </div>
              )}
              {task.due_date && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Due Date</Label>
                  <Input defaultValue={new Date(task.due_date).toLocaleDateString()} readOnly className="col-span-3" />
                </div>
              )}
              {task.project_name && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">Project</Label>
                  <Input defaultValue={task.project_name} readOnly className="col-span-3" />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setShowOverviewDialog(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    );
  }

  // Default (not Done) card
  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ scale: 1.02 }}
      className="cursor-default"
    >
      <Card className="hover:shadow-lg transition-all duration-200 bg-white border border-gray-200 flex flex-col h-fit">
        <CardContent className="p-3 space-y-3 flex-1 flex-col">
          <div className="flex justify-between items-center gap-2">
            <h4 className="font-semibold text-sm text-gray-900 line-clamp-2 leading-5 flex-1">{task.title}</h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 cursor-grab"
              {...listeners}
              {...attributes}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              aria-label="Drag task"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>

          {task.description && <p className="text-xs text-gray-600 line-clamp-2 leading-4">{task.description}</p>}

          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className={`text-xs font-medium border ${priorityColors[priority]}`}>
              {priority}
            </Badge>
            {project_name && (
              <Badge
                variant="outline"
                className="text-xs font-medium border bg-purple-50 text-purple-700 border-purple-200 flex items-center gap-1"
              >
                <Folder className="h-3 w-3" />
                {project_name}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
              {task.progress_mode === 'manual' ? 'Manual' : task.progress_mode === 'target' ? 'Target' : 'Steps'}
            </Badge>
          </div>

          <div className="space-y-1">
            {task.due_date && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Calendar className="h-3 w-3" />
                <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
              </div>
            )}
            {task.assignee_name && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <User className="h-3 w-3" />
                <span>{task.assignee_name}</span>
              </div>
            )}
          </div>

          {/* Progress */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Progress</span>
              <span className="font-medium text-gray-700">{displayPct}%</span>
            </div>
            <div
              className="w-full bg-gray-200 rounded-full h-1.5"
              role="progressbar"
              aria-valuenow={displayPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${displayPct}%` }} />
            </div>

            {task.progress_mode === 'target' && task.progress_goal !== null && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-500">
                  {task.progress_current ?? 0} / {task.progress_goal}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    // use hook instance defined at top (fixed)
                    incrementProgress(task.id, 1).then(() => onTaskUpdate?.());
                  }}
                  disabled={
                    task.progress_current !== null &&
                    task.progress_goal !== null &&
                    task.progress_current >= task.progress_goal
                  }
                >
                  +1
                </Button>
              </div>
            )}

            {task.progress_mode === 'steps' && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-500">
                  {task.steps.filter((s) => s.is_done).length} / {task.steps.length} steps
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowStepsDialog(true);
                  }}
                >
                  Manage
                </Button>
              </div>
            )}

            {task.progress_mode === 'manual' && (
              <div className="flex justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowProgressOptionsDialog(true);
                  }}
                >
                  Update Progress
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-1 pt-1 border-top border-gray-100">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:bg-blue-50 hover:text-blue-600"
              onClick={handleEditButtonClick}
            >
              <Edit className="h-3 w-3" />
            </Button>

            <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 hover:bg-red-50 hover:text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAlertOpen(true);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Task</AlertDialogTitle>
                  <AlertDialogDescription>Are you sure you want to delete "{task.title}"?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* dialogs */}
      <TargetDialog
        task={task}
        isOpen={showTargetDialog}
        onClose={() => setShowTargetDialog(false)}
        onUpdateProgress={updateTaskProgress}
        onTaskUpdate={onTaskUpdate}
      />
      <StepsDialog
        task={task}
        isOpen={showStepsDialog}
        onClose={() => setShowStepsDialog(false)}
        onUpdateProgress={updateTaskProgress}
        onTaskUpdate={onTaskUpdate}
      />
      <ProgressOptionsDialog
        task={task}
        isOpen={showProgressOptionsDialog}
        onClose={() => setShowProgressOptionsDialog(false)}
        onUpdateProgress={updateTaskProgress}
        onIncrementProgress={incrementProgress}
        onTaskUpdate={onTaskUpdate}
        openTarget={() => setShowTargetDialog(true)}
        openSteps={() => setShowStepsDialog(true)}
      />
    </motion.div>
  );
}
