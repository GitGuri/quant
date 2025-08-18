// TaskForm.tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible" // Assuming you have this component or use Radix UI directly
import { DialogFooter } from '@/components/ui/dialog';
import { ChevronDown, ChevronRight, Plus, Minus } from 'lucide-react'; // For collapsible icons and step buttons

// --- UPDATED: Extend interfaces to include new fields ---
interface Project {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
  email?: string | null;
}

// --- NEW: Define Step interface for form ---
// Export this interface so KanbanBoard can use it
export interface TaskStepFormData {
  id?: string; // Optional for new steps
  title: string;
  weight: number;
  is_done: boolean;
  position: number;
}
// --- END NEW ---

export type TaskFormData = {
  title: string;
  description?: string;
  priority: 'Low' | 'Medium' | 'High';
  assignee_id?: string | null;
  due_date?: string;
  progress_percentage: number;
  project_id?: string | null;
  // --- NEW: Add progress tracking fields ---
  progress_mode: 'manual' | 'target' | 'steps';
  progress_goal?: number | null;
  progress_current?: number | null;
  // steps?: TaskStepFormData[]; // Handled separately for initial creation/editing
};

// --- UPDATED: Modified onSave prop type to accept initial steps ---
export type TaskFormProps = {
  task?: TaskFormData; // This now includes the new fields
  // onSave: (data: TaskFormData) => void | Promise<void>; // OLD
  onSave: (data: TaskFormData, initialStepsToAdd?: TaskStepFormData[]) => void | Promise<void>; // NEW
  onCancel: () => void;
  projects: Project[];
  users: User[];
};
// --- END UPDATED ---

const assigneePlaceholderValue = 'unassigned';
const projectPlaceholderValue = 'unassigned';

export function TaskForm({ task, onSave, onCancel, projects, users }: TaskFormProps) {
  const [formData, setFormData] = useState<TaskFormData>({
    title: task?.title || '',
    description: task?.description || '',
    priority: task?.priority || 'Medium',
    assignee_id: task?.assignee_id ?? null,
    due_date: task?.due_date || '',
    progress_percentage: task?.progress_percentage ?? 0,
    project_id: task?.project_id ?? null,
    // --- NEW: Initialize progress tracking fields ---
    progress_mode: task?.progress_mode || 'manual',
    progress_goal: task?.progress_goal ?? null,
    progress_current: task?.progress_current ?? 0,
    // steps are handled in a separate state array
  });

  // --- NEW: State for initial steps ---
  const [initialSteps, setInitialSteps] = useState<TaskStepFormData[]>(() => {
    // If editing and task has steps, initialize them
    // Note: This assumes steps are passed if editing an existing task with steps
    // In practice, you might need to fetch steps separately or pass them in task prop
    // For this form, we'll manage initial steps for 'steps' mode here.
    if (task && task.progress_mode === 'steps') {
        // If task object hypothetically contained steps, they would be used here.
        // Since it doesn't in the current prop, we initialize empty.
        // The form is primarily for *setting* initial steps, not editing existing ones in detail here.
        return []; // Start empty for editing, user can add
    }
    return []; // Start empty for new tasks
  });
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepWeight, setNewStepWeight] = useState(1);
  // --- END NEW ---

  useEffect(() => {
    setFormData({
      title: task?.title || '',
      description: task?.description || '',
      priority: task?.priority || 'Medium',
      assignee_id: task?.assignee_id ?? null,
      due_date: task?.due_date || '',
      progress_percentage: task?.progress_percentage ?? 0,
      project_id: task?.project_id ?? null,
      // --- NEW: Sync progress tracking fields on task change ---
      progress_mode: task?.progress_mode || 'manual',
      progress_goal: task?.progress_goal ?? null,
      progress_current: task?.progress_current ?? 0,
    });
    // --- NEW: Reset or initialize steps when task changes ---
    // This logic depends on how steps are managed for existing tasks.
    // For a creation form, this is fine. For editing, you might want to load existing steps.
    if (task?.progress_mode === 'steps') {
        // If editing a task with steps, ideally steps would be loaded here.
        // As this form doesn't deeply edit steps, we'll leave it empty for editing too.
        setInitialSteps([]);
    } else {
        setInitialSteps([]); // Clear steps if mode changes
    }
    // --- END NEW ---
  }, [task]);

  // --- UPDATED: handleSubmit to pass initialSteps ---
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Prepare data to send back
    const dataToSave: TaskFormData = {
      ...formData,
      assignee_id: formData.assignee_id || null,
      project_id: formData.project_id || null,
      // --- NEW: Include progress fields in save data ---
      progress_goal: formData.progress_mode === 'target' ? (formData.progress_goal ?? null) : null,
      progress_current: formData.progress_mode === 'target' ? (formData.progress_current ?? 0) : 0,
      // steps are not sent directly in this form's save for simplicity of initial setup
      // The parent component or a dedicated steps editor would handle detailed step management
    };
    // onSave(dataToSave); // OLD
    onSave(dataToSave, formData.progress_mode === 'steps' ? initialSteps : undefined); // NEW
  };
  // --- END UPDATED ---

  // --- NEW: Handlers for steps management ---
  const handleAddStep = () => {
    if (newStepTitle.trim()) {
      const newStep: TaskStepFormData = {
        title: newStepTitle.trim(),
        weight: newStepWeight,
        is_done: false,
        position: initialSteps.length, // Simple position assignment
      };
      setInitialSteps([...initialSteps, newStep]);
      setNewStepTitle('');
      setNewStepWeight(1);
    }
  };

  const handleRemoveStep = (index: number) => {
    setInitialSteps(initialSteps.filter((_, i) => i !== index));
  };

  const handleModeChange = (value: string) => {
    const mode = value as 'manual' | 'target' | 'steps';
    setFormData({ ...formData, progress_mode: mode });
    // Clear goal/current if switching away from target
    if (mode !== 'target') {
      setFormData(prev => ({ ...prev, progress_goal: null, progress_current: 0 }));
    }
    // Clear steps if switching away from steps (or initialize if switching to)
    if (mode !== 'steps') {
        setInitialSteps([]);
    }
    // If switching to 'steps', you might want to prompt for initial steps,
    // but the form handles adding them dynamically.
  };
  // --- END NEW ---

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="priority">Priority</Label>
        <Select
          value={formData.priority}
          onValueChange={(value) => setFormData({ ...formData, priority: value as 'Low' | 'Medium' | 'High' })}
        >
          <SelectTrigger id="priority">
            <SelectValue placeholder="Select priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Low">Low</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="High">High</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* --- NEW: Progress Mode Selection --- */}
      <div>
        <Label htmlFor="progress_mode">Progress Tracking Mode</Label>
        <Select
          value={formData.progress_mode}
          onValueChange={handleModeChange}
        >
          <SelectTrigger id="progress_mode">
            <SelectValue placeholder="Select progress mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="target">Target-Based</SelectItem>
            <SelectItem value="steps">Step-Based</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* --- END NEW --- */}

      {/* --- NEW: Conditional Fields based on Mode --- */}
      {formData.progress_mode === 'target' && (
        <div className="space-y-2 p-3 bg-blue-50 rounded-md">
          <h4 className="font-medium text-sm text-blue-800">Target Settings</h4>
          <div>
            <Label htmlFor="progress_goal">Goal *</Label>
            <Input
              id="progress_goal"
              type="number"
              min={0}
              value={formData.progress_goal ?? ''}
              onChange={(e) => setFormData({ ...formData, progress_goal: e.target.value ? Number(e.target.value) : null })}
              required
            />
          </div>
          <div>
            <Label htmlFor="progress_current">Current</Label>
            <Input
              id="progress_current"
              type="number"
              min={0}
              value={formData.progress_current ?? 0}
              onChange={(e) => setFormData({ ...formData, progress_current: Number(e.target.value) })}
              // Add validation to ensure current <= goal if goal is set
            />
            {formData.progress_goal !== null && formData.progress_goal > 0 && (
                 <p className="text-xs text-gray-500">
                    {formData.progress_current} / {formData.progress_goal} ({Math.min(100, Math.round(((formData.progress_current ?? 0) / (formData.progress_goal ?? 1)) * 100))}%)
                 </p>
            )}
          </div>
        </div>
      )}

      {formData.progress_mode === 'steps' && (
        <Collapsible className="space-y-2 p-3 bg-green-50 rounded-md">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="p-0 h-auto font-medium text-sm text-green-800 flex items-center gap-1">
              <span>Initial Steps ({initialSteps.length})</span>
              {/* Simple icon toggle */}
              <ChevronRight className="h-4 w-4 collapsible-icon" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 data-[state=open]:pt-2">
            <div className="flex gap-2">
              <Input
                value={newStepTitle}
                onChange={(e) => setNewStepTitle(e.target.value)}
                placeholder="New step title..."
                onKeyDown={(e) => e.key === 'Enter' && handleAddStep()}
              />
              <Input
                type="number"
                min={0}
                value={newStepWeight}
                onChange={(e) => setNewStepWeight(Number(e.target.value))}
                className="w-20"
                placeholder="Weight"
              />
              <Button type="button" onClick={handleAddStep} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {initialSteps.length > 0 ? (
                initialSteps.map((step, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-white border rounded">
                    <span className="text-sm flex-1">{step.title} (Weight: {step.weight})</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                      onClick={() => handleRemoveStep(index)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-500 italic">No initial steps added.</p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      {/* --- END NEW --- */}

      <div>
        <Label htmlFor="assignee">Assignee</Label>
        <Select
          value={formData.assignee_id ?? assigneePlaceholderValue}
          onValueChange={(value) =>
            setFormData({
              ...formData,
              assignee_id: value === assigneePlaceholderValue ? null : value,
            })
          }
        >
          <SelectTrigger id="assignee">
            <SelectValue placeholder="Select assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={assigneePlaceholderValue}>Unassigned</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name} {u.email ? `— ${u.email}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="project">Project</Label>
        <Select
          value={formData.project_id ?? projectPlaceholderValue}
          onValueChange={(value) =>
            setFormData({
              ...formData,
              project_id: value === projectPlaceholderValue ? null : value,
            })
          }
        >
          <SelectTrigger id="project">
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={projectPlaceholderValue}>Unassigned</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="due_date">Due Date</Label>
        <Input
          id="due_date"
          type="date"
          value={formData.due_date || ''}
          onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
        />
      </div>

      {/* --- UPDATED: Progress Percentage (always shown, but meaning changes with mode) --- */}
      <div className="opacity-70"> {/* Visual cue that it's less directly editable now */}
        <Label htmlFor="progress_percentage">Progress Percentage (Auto-Calculated/Manual)</Label>
        <Input
          id="progress_percentage"
          type="number"
          min={0}
          max={100}
          value={formData.progress_percentage}
          // onChange is removed or disabled as it's now managed by mode
          // You could keep it if 'manual' mode allows direct editing
          // For now, make it read-only or remove the input entirely if confusing
          readOnly={formData.progress_mode !== 'manual'} // Only editable in manual mode
          className={formData.progress_mode !== 'manual' ? 'bg-gray-100 cursor-not-allowed' : ''}
        />
         {formData.progress_mode !== 'manual' && (
             <p className="text-xs text-gray-500 mt-1">
                 This value is managed by the selected progress mode.
             </p>
         )}
      </div>
      {/* --- END UPDATED --- */}

      <DialogFooter>
        <Button type="submit">Save And Update</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </DialogFooter>
    </form>
  );
}