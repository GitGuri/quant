// TaskCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { MoreHorizontal, Edit, Trash2, Calendar, User, Folder, Target, ListChecks, Plus, Minus, Percent } from 'lucide-react';
import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TaskForm, type TaskFormData } from './TaskForm';

// --- NEW: Define interfaces for steps and extended task ---
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
  status: 'To Do' | 'In Progress' | 'Review' | 'Done'; // Added 'Review'
  priority: 'Low' | 'Medium' | 'High';
  due_date?: string;
  progress_percentage: number;
  created_at: string;
  updated_at: string;
  assignee_id?: string | null;
  assignee_name?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  // --- NEW FIELDS FOR PROGRESS TRACKING ---
  progress_mode: 'manual' | 'target' | 'steps'; // Matches backend enum
  progress_goal: number | null;
  progress_current: number | null;
  steps: TaskStep[]; // Array of steps
}
// --- END NEW ---

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
  projects: { id: string; name: string; }[];
  users?: { id: string; name: string; }[];
  onTaskUpdate?: () => void; }

// --- NEW: Placeholder hooks for API calls ---
const useIncrementProgress = () => {
  return useCallback(async (taskId: string, incrementValue: number) => { // Added incrementValue
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`https://quantnow-cu1v.onrender.com/api/tasks/${taskId}/progress/increment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ increment: incrementValue }) // Send increment value
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      console.log(`Progress incremented for task ${taskId} by ${incrementValue}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to increment progress:', error);
      throw error;
    }
  }, []);
};

const useUpdateTaskProgress = () => {
  return useCallback(async (taskId: string, progressData: Partial<Pick<Task, 'progress_mode' | 'progress_goal' | 'progress_current' | 'steps' | 'progress_percentage'>>) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`https://quantnow-cu1v.onrender.com/api/tasks/${taskId}/progress`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(progressData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      console.log(`Progress updated for task ${taskId}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to update task progress:', error);
      throw error;
    }
  }, []);
};
// --- END NEW HOOKS ---

// --- NEW: Target Dialog Component ---
const TargetDialog = ({ task, isOpen, onClose, onUpdateProgress, onTaskUpdate }: {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onUpdateProgress: ReturnType<typeof useUpdateTaskProgress>;
  onTaskUpdate?: () => void;
}) => {
  const [goal, setGoal] = useState<number | ''>(task.progress_goal ?? '');
  const [current, setCurrent] = useState<number>(task.progress_current ?? 0);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateProgress(task.id, {
        progress_mode: 'target',
        progress_goal: goal === '' ? null : goal,
        progress_current: current,
      });
      onTaskUpdate?.(); // Trigger parent refresh
      onClose();
    } catch (error) {
      // Error handling already in hook, maybe show UI feedback here
      console.error("Error saving target:", error);
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
          <DialogDescription>
            Define your goal and track your current progress.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="target-goal" className="text-right">
              Goal
            </Label>
            <Input
              id="target-goal"
              type="number"
              value={goal}
              onChange={(e) => setGoal(e.target.value === '' ? '' : Number(e.target.value))}
              className="col-span-3"
              placeholder="e.g., 100"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="target-current" className="text-right">
              Current
            </Label>
            <Input
              id="target-current"
              type="number"
              value={current}
              onChange={(e) => setCurrent(Number(e.target.value))}
              className="col-span-3"
              placeholder="e.g., 25"
            />
          </div>
          {goal !== '' && goal !== null && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Progress</Label>
              <div className="col-span-3">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${Math.min(100, Math.round(((current ?? 0) / (goal ?? 1)) * 100))}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {current} / {goal} ({Math.min(100, Math.round(((current ?? 0) / (goal ?? 1)) * 100))}%)
                </p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || (goal !== '' && goal !== null && current > goal)}>
            {isSaving ? 'Saving...' : 'Save Target'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
// --- END NEW: Target Dialog ---

// --- NEW: Steps Dialog Component ---
// Steps Dialog Component (from TaskCard.tsx)
const StepsDialog = ({ task, isOpen, onClose, onUpdateProgress, onTaskUpdate }: {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onUpdateProgress: ReturnType<typeof useUpdateTaskProgress>;
  onTaskUpdate?: () => void;
}) => {
  const [steps, setSteps] = useState<TaskStep[]>([...task.steps]); // Local copy for editing
  const [newStepTitle, setNewStepTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddStep = () => {
    if (newStepTitle.trim()) {
      const newStep: TaskStep = {
        id: `new-${Date.now()}`, // Temporary ID for new steps
        task_id: task.id,
        title: newStepTitle.trim(),
        weight: 1,
        is_done: false,
        position: steps.length,
      };
      setSteps([...steps, newStep]);
      setNewStepTitle('');
    }
  };

  const handleToggleStep = (index: number) => {
    const updatedSteps = [...steps];
    updatedSteps[index] = { ...updatedSteps[index], is_done: !updatedSteps[index].is_done };
    setSteps(updatedSteps);
  };

  const handleDeleteStep = (index: number) => {
    const updatedSteps = steps.filter((_, i) => i !== index);
    // Re-index positions
    const reindexedSteps = updatedSteps.map((step, idx) => ({ ...step, position: idx }));
    setSteps(reindexedSteps);
  };

  // --- MODIFIED: Include progress_percentage in the save payload ---
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Calculate progress before saving
      const totalWeight = steps.reduce((sum, step) => sum + (step.weight ?? 0), 0);
      const completedWeight = steps.filter(step => step.is_done).reduce((sum, step) => sum + (step.weight ?? 0), 0);
      const newPercentage = totalWeight > 0 ? (completedWeight / totalWeight) * 100 : 0;

      // Filter out temporary IDs before sending
      const stepsToSend = steps.map(step => ({
        ...step,
        id: step.id.startsWith('new-') ? undefined : step.id // Remove temp ID
      }));

      await onUpdateProgress(task.id, {
        progress_mode: 'steps',
        steps: stepsToSend,
        progress_percentage: newPercentage, // <-- This is the key fix
      });
      
      onTaskUpdate?.(); 
      onClose();
    } catch (error) {
      console.error("Error saving steps:", error);
    } finally {
      setIsSaving(false);
    }
  };
  // --- END MODIFIED ---

  // Calculate step-based progress for local display
  const totalWeight = steps.reduce((sum, step) => sum + (step.weight ?? 0), 0);
  const completedWeight = steps
    .filter(step => step.is_done)
    .reduce((sum, step) => sum + (step.weight ?? 0), 0);
  const stepProgress = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" /> Steps for "{task.title}"
          </DialogTitle>
          <DialogDescription>
            Break down your task into smaller steps. Progress: {stepProgress}%
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex gap-2">
            <Input
              value={newStepTitle}
              onChange={(e) => setNewStepTitle(e.target.value)}
              placeholder="Add a new step..."
              onKeyPress={(e) => e.key === 'Enter' && handleAddStep()}
            />
            <Button onClick={handleAddStep} size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {steps.length > 0 ? (
              steps.map((step, index) => (
                <div key={step.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <Checkbox
                    checked={step.is_done}
                    onCheckedChange={() => handleToggleStep(index)}
                  />
                  <span className={`flex-1 text-sm ${step.is_done ? 'line-through text-gray-500' : ''}`}>
                    {step.title}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDeleteStep(index)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center py-2">No steps added yet.</p>
            )}
          </div>

          {steps.length > 0 && (
            <div className="pt-2 border-t">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Overall Progress</span>
                <span className="font-medium">{stepProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${stepProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Steps'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
// --- END NEW: Steps Dialog ---

// --- NEW: Progress Options Dialog Component ---
const ProgressOptionsDialog = ({ task, isOpen, onClose, onUpdateProgress, onIncrementProgress, onTaskUpdate, setShowTargetDialog, setShowStepsDialog }: {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onUpdateProgress: ReturnType<typeof useUpdateTaskProgress>;
  onIncrementProgress: ReturnType<typeof useIncrementProgress>;
  onTaskUpdate?: () => void;
  setShowTargetDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setShowStepsDialog: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
  const [manualProgress, setManualProgress] = useState<number>(task.progress_percentage);
  const [isSaving, setIsSaving] = useState(false);

  const handleManualSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateProgress(task.id, {
        progress_mode: 'manual',
        progress_percentage: manualProgress,
      });
      onTaskUpdate?.();
      onClose();
    } catch (error) {
      console.error("Error saving manual progress:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleIncrement = async (incrementValue: number) => {
    setIsSaving(true); // Indicate saving
    try {
      await onIncrementProgress(task.id, incrementValue); // Use the increment hook
      onTaskUpdate?.();
      onClose();
    } catch (error) {
      console.error("Error incrementing progress:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" /> Edit Progress for "{task.title}"
          </DialogTitle>
          <DialogDescription>
            Choose how you want to update the progress for this task.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {task.progress_mode === 'manual' && (
            <div className="space-y-2">
              <Label htmlFor="manual-progress">Manual Progress Percentage</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="manual-progress"
                  type="number"
                  min={0}
                  max={100}
                  value={manualProgress}
                  onChange={(e) => setManualProgress(Number(e.target.value))}
                  className="flex-1"
                />
                <Button onClick={handleManualSave} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Update'}
                </Button>
              </div>
              <p className="text-xs text-gray-500">Current: {task.progress_percentage}%</p>
            </div>
          )}

          {task.progress_mode === 'target' && (
            <div className="space-y-2">
              <Label>Target-Based Progress</Label>
              <div className="flex flex-col gap-2">
                <Button variant="outline" onClick={() => setShowTargetDialog(true)} disabled={isSaving}>
                  <Target className="h-4 w-4 mr-2" /> Adjust Target/Current
                </Button>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={1} // Default increment value
                    onChange={() => {}} // Not directly editable here, just displays increment
                    className="w-20"
                    readOnly
                  />
                  <Button onClick={() => handleIncrement(1)} disabled={isSaving}>
                    Increment Current
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Current: {task.progress_current ?? 0} / {task.progress_goal ?? 'Not Set'}
                </p>
              </div>
            </div>
          )}

          {task.progress_mode === 'steps' && (
            <div className="space-y-2">
              <Label>Step-Based Progress</Label>
              <Button variant="outline" onClick={() => setShowStepsDialog(true)} disabled={isSaving}>
                <ListChecks className="h-4 w-4 mr-2" /> Manage Steps
              </Button>
              <p className="text-xs text-gray-500">
                Completed {task.steps.filter(s => s.is_done).length} of {task.steps.length} steps.
              </p>
            </div>
          )}


          {/* --- NEW: Progress Display --- */}
          {task.progress_percentage !== null && task.progress_percentage !== undefined && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Progress</span>
                <span>{Math.round(task.progress_percentage)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                <div
                  className="bg-blue-600 h-1.5 rounded-full"
                  style={{ width: `${task.progress_percentage}%` }}
                />
              </div>
            </div>
          )}
          {/* --- END NEW --- */}
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
// --- END NEW: Progress Options Dialog ---

export function TaskCard({
  task,
  onEdit, // This will now be used by KanbanBoard for a *separate* full edit button if desired
  onDelete,
  priority,
  progressPercentage,
  project_name,
  projects,
  users, // Pass users if needed by TaskCard directly
  onTaskUpdate // Receive the refresh function
}: TaskCardProps) {
  const [showEditForm, setShowEditForm] = useState(false); // This will no longer be used by the main edit button
  const [alertOpen, setAlertOpen] = useState(false);
  const [showOverviewDialog, setShowOverviewDialog] = useState(false);
  // --- NEW: State for progress specific dialogs ---
  const [showTargetDialog, setShowTargetDialog] = useState(false);
  const [showStepsDialog, setShowStepsDialog] = useState(false);
  const [showProgressOptionsDialog, setShowProgressOptionsDialog] = useState(false); // New state for progress options dialog
  // --- END NEW ---

  // --- NEW: Initialize hooks ---
  const incrementProgress = useIncrementProgress();
  const updateTaskProgress = useUpdateTaskProgress();
  // --- END NEW ---

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 0,
    opacity: isDragging ? 0.8 : 1,
  };

  const handleEditSave = (updatedFormTask: TaskFormData) => {
    // This function will still be called by the TaskForm if used elsewhere
    // but the main "Edit" button on TaskCard will no longer directly trigger the TaskForm.
    onEdit({
      ...task,
      title: updatedFormTask.title,
      description: updatedFormTask.description,
      priority: updatedFormTask.priority,
      assignee_id: updatedFormTask.assignee_id ?? null,
      due_date: updatedFormTask.due_date,
      progress_percentage: updatedFormTask.progress_percentage,
      project_id: updatedFormTask.project_id ?? null,
      progress_mode: updatedFormTask.progress_mode, // Make sure these are updated if TaskForm ever handles them
      progress_goal: updatedFormTask.progress_goal,
      progress_current: updatedFormTask.progress_current,
    });
    setShowEditForm(false); // Ensure this is closed if still relevant
  };

  const handleDeleteConfirm = () => {
    onDelete(task.id);
    setAlertOpen(false);
  };

  const handleDragHandleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // --- MODIFIED: handleEditButtonClick to open ProgressOptionsDialog ---
  const handleEditButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowProgressOptionsDialog(true); // Open the new dialog
  };

  const handleOverviewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowOverviewDialog(true);
  };

  // --- NEW: Handlers for new features (now mostly called from ProgressOptionsDialog) ---
  // Keeping these here as they are passed to the new dialog
  const handleIncrementProgress = async (incrementValue: number) => { // Updated to accept increment value
    if (task.progress_mode === 'target' || task.progress_mode === 'manual') { // Allow increment for manual too if desired
      try {
        await incrementProgress(task.id, incrementValue);
        onTaskUpdate?.(); // Refresh task list
      } catch (error) {
        // Error handled in hook, maybe show UI feedback
      }
    }
  };
  // --- END NEW HANDLERS ---

  // "Done" compact card
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
            <span className="font-medium text-sm text-gray-800 line-clamp-1">
              {task.title}
            </span>
          </CardContent>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 cursor-grab"
              {...listeners}
              {...attributes}
              onClick={handleDragHandleClick}
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
                  <AlertDialogDescription>
                    Are you sure you want to delete "{task.title}"? This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Card>

        {/* Overview Dialog */}
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
                <Input defaultValue={`${task.progress_percentage}%`} readOnly className="col-span-3" />
              </div>
              {/* --- NEW: Show Progress Mode Details in Overview --- */}
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
                    {task.steps.length > 0 ? (
                      <ul className="list-disc pl-5 space-y-1">
                        {task.steps.map((step, index) => (
                          <li key={step.id} className={step.is_done ? "line-through text-gray-500" : ""}>
                            {step.title} {step.is_done ? '(Done)' : '(Pending)'}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-gray-500">No steps defined.</span>
                    )}
                  </div>
                </div>
              )}
              {/* --- END NEW --- */}
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

  // Default detailed card
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
            <h4 className="font-semibold text-sm text-gray-900 line-clamp-2 leading-5 flex-1">
              {task.title}
            </h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 cursor-grab"
              {...listeners}
              {...attributes}
              onClick={handleDragHandleClick}
              aria-label="Drag task"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>

          {task.description && (
            <p className="text-xs text-gray-600 line-clamp-2 leading-4">{task.description}</p>
          )}

          <div className="flex flex-wrap gap-1">
            <Badge variant="outline" className={`text-xs font-medium border ${priorityColors[priority]}`}>
              {priority}
            </Badge>
            {project_name && (
              <Badge variant="outline" className="text-xs font-medium border bg-purple-50 text-purple-700 border-purple-200 flex items-center gap-1">
                <Folder className="h-3 w-3" />
                {project_name}
              </Badge>
            )}
            {/* --- NEW: Show Progress Mode Badge --- */}
            <Badge variant="outline" className="text-xs font-medium border bg-blue-50 text-blue-700 border-blue-200">
              {task.progress_mode === 'manual' && 'Manual'}
              {task.progress_mode === 'target' && 'Target'}
              {task.progress_mode === 'steps' && 'Steps'}
            </Badge>
            {/* --- END NEW --- */}
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

          {/* --- UPDATED: Progress Section with Mode Logic --- */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Progress</span>
              <span className="font-medium text-gray-700">{Math.round(task.progress_percentage)}%</span>

            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${task.progress_percentage}%` }} />
            </div>

            {/* --- NEW: Mode-Specific Progress Actions --- */}
            {task.progress_mode === 'target' && task.progress_goal !== null && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-500">
                  {task.progress_current} / {task.progress_goal}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => { e.stopPropagation(); handleIncrementProgress(1); }} // Increment by 1
                  disabled={task.progress_current !== null && task.progress_current >= task.progress_goal}
                >
                  +1
                </Button>
              </div>
            )}

            {task.progress_mode === 'steps' && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-500">
                  {task.steps.filter(s => s.is_done).length} / {task.steps.length} steps
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => { e.stopPropagation(); setShowStepsDialog(true); }}
                >
                  Manage
                </Button>
              </div>
            )}

            {task.progress_mode === 'manual' && (
              <div className="flex justify-end pt-1">
                {/* No direct action here, handled by ProgressOptionsDialog */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => { e.stopPropagation(); setShowProgressOptionsDialog(true); }}
                >
                  Update Progress
                </Button>
              </div>
            )}
            {/* --- END NEW --- */}
          </div>
          {/* --- END UPDATED --- */}

          <div className="flex items-center justify-end gap-1 pt-1 border-t border-gray-100">
            {/* This button now opens the ProgressOptionsDialog */}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-blue-50 hover:text-blue-600" onClick={handleEditButtonClick}>
              <Edit className="h-3 w-3" />
            </Button>

            {/* The TaskForm Dialog is removed from here as it's not the primary "Edit Progress" flow */}
            {/* If you need a full edit, it should be triggered from KanbanBoard's taskToEdit dialog */}

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
                  <AlertDialogDescription>
                    Are you sure you want to delete "{task.title}"? This cannot be undone.
                  </AlertDialogDescription>
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

      {/* --- NEW: Render Dialogs --- */}
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
      {/* New Progress Options Dialog */}
      <ProgressOptionsDialog
        task={task}
        isOpen={showProgressOptionsDialog}
        onClose={() => setShowProgressOptionsDialog(false)}
        onUpdateProgress={updateTaskProgress}
        onIncrementProgress={incrementProgress}
        onTaskUpdate={onTaskUpdate}
        setShowTargetDialog={setShowTargetDialog}
        setShowStepsDialog={setShowStepsDialog}
      />
      {/* --- END NEW --- */}
    </motion.div>
  );
}