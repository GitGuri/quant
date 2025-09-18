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
} from "@/components/ui/collapsible";
import { DialogFooter } from '@/components/ui/dialog';
import { ChevronRight, Plus, Minus } from 'lucide-react';

// --- Types ---
interface Project {
  id: string;
  name: string;
}
interface User {
  id: string;
  name: string;
  email?: string | null;
}

export interface TaskStepFormData {
  id?: string;
  title: string;
  weight: number;
  is_done: boolean;
  position: number;
}

export type TaskFormData = {
  title: string;
  description?: string;
  priority: 'Low' | 'Medium' | 'High';
  assignee_id?: string | null;
  due_date?: string;
  progress_percentage: number;
  project_id?: string | null;

  progress_mode: 'manual' | 'target' | 'steps';
  progress_goal?: number | null;
  progress_current?: number | null;
};

export type TaskFormProps = {
  task?: TaskFormData;
  onSave: (data: TaskFormData, initialStepsToAdd?: TaskStepFormData[]) => void | Promise<void>;
  onCancel: () => void;
  projects?: Project[];  // ← made optional
  users?: User[];        // ← made optional
};

const assigneePlaceholderValue = 'unassigned';
const projectPlaceholderValue = 'unassigned';

export function TaskForm({
  task,
  onSave,
  onCancel,
  projects = [],   // ← safe defaults
  users = [],      // ← safe defaults
}: TaskFormProps) {
  const [formData, setFormData] = useState<TaskFormData>({
    title: task?.title || '',
    description: task?.description || '',
    priority: task?.priority || 'Medium',
    assignee_id: task?.assignee_id ?? null,
    due_date: task?.due_date || '',
    progress_percentage: task?.progress_percentage ?? 0,
    project_id: task?.project_id ?? null,
    progress_mode: task?.progress_mode || 'manual',
    progress_goal: task?.progress_goal ?? null,
    progress_current: task?.progress_current ?? 0,
  });

  const [initialSteps, setInitialSteps] = useState<TaskStepFormData[]>([]);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepWeight, setNewStepWeight] = useState(1);

  useEffect(() => {
    setFormData({
      title: task?.title || '',
      description: task?.description || '',
      priority: task?.priority || 'Medium',
      assignee_id: task?.assignee_id ?? null,
      due_date: task?.due_date || '',
      progress_percentage: task?.progress_percentage ?? 0,
      project_id: task?.project_id ?? null,
      progress_mode: task?.progress_mode || 'manual',
      progress_goal: task?.progress_goal ?? null,
      progress_current: task?.progress_current ?? 0,
    });

    if (task?.progress_mode === 'steps') {
      setInitialSteps([]); // if you later pass existing steps, hydrate here
    } else {
      setInitialSteps([]);
    }
  }, [task]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSave: TaskFormData = {
      ...formData,
      assignee_id: formData.assignee_id || null,
      project_id: formData.project_id || null,
      progress_goal: formData.progress_mode === 'target' ? (formData.progress_goal ?? null) : null,
      progress_current: formData.progress_mode === 'target' ? (formData.progress_current ?? 0) : 0,
    };
    onSave(dataToSave, formData.progress_mode === 'steps' ? initialSteps : undefined);
  };

  const handleAddStep = () => {
    if (!newStepTitle.trim()) return;
    const newStep: TaskStepFormData = {
      title: newStepTitle.trim(),
      weight: newStepWeight,
      is_done: false,
      position: initialSteps.length,
    };
    setInitialSteps((prev) => [...prev, newStep]);
    setNewStepTitle('');
    setNewStepWeight(1);
  };

  const handleRemoveStep = (index: number) => {
    setInitialSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, position: i })));
  };

  const handleModeChange = (value: string) => {
    const mode = value as 'manual' | 'target' | 'steps';
    setFormData((prev) => ({
      ...prev,
      progress_mode: mode,
      ...(mode !== 'target' ? { progress_goal: null, progress_current: 0 } : {}),
    }));
    if (mode !== 'steps') setInitialSteps([]);
  };

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

      <div>
        <Label htmlFor="progress_mode">Progress Tracking Mode</Label>
        <Select value={formData.progress_mode} onValueChange={handleModeChange}>
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
              onChange={(e) =>
                setFormData({
                  ...formData,
                  progress_goal: e.target.value ? Number(e.target.value) : null,
                })
              }
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
              onChange={(e) => setFormData({ ...formData, progress_current: Number(e.target.value || '0') })}
            />
            {formData.progress_goal !== null && formData.progress_goal > 0 && (
              <p className="text-xs text-gray-500">
                {formData.progress_current} / {formData.progress_goal} (
                {Math.min(
                  100,
                  Math.round(((formData.progress_current ?? 0) / (formData.progress_goal ?? 1)) * 100)
                )}
                %)
              </p>
            )}
          </div>
        </div>
      )}

      {formData.progress_mode === 'steps' && (
        <Collapsible className="space-y-2 p-3 bg-green-50 rounded-md">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="p-0 h-auto font-medium text-sm text-green-800 flex items-center gap-1"
              type="button"
            >
              <span>Initial Steps ({initialSteps.length})</span>
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
                onChange={(e) => setNewStepWeight(Number(e.target.value || '0'))}
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
                  <div key={`${step.title}-${index}`} className="flex items-center gap-2 p-2 bg-white border rounded">
                    <span className="text-sm flex-1">
                      {step.title} (Weight: {step.weight})
                    </span>
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
            {(users ?? []).map((u) => (
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
            {(projects ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="opacity-70">
        <Label htmlFor="progress_percentage">Progress Percentage (Auto-Calculated/Manual)</Label>
        <Input
          id="progress_percentage"
          type="number"
          min={0}
          max={100}
          value={formData.progress_percentage}
          readOnly={formData.progress_mode !== 'manual'}
          className={formData.progress_mode !== 'manual' ? 'bg-gray-100 cursor-not-allowed' : ''}
          onChange={(e) =>
            formData.progress_mode === 'manual'
              ? setFormData({ ...formData, progress_percentage: Number(e.target.value || '0') })
              : undefined
          }
        />
        {formData.progress_mode !== 'manual' && (
          <p className="text-xs text-gray-500 mt-1">This value is managed by the selected progress mode.</p>
        )}
      </div>

      <DialogFooter>
        <Button type="submit">Save And Update</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </DialogFooter>
    </form>
  );
}
