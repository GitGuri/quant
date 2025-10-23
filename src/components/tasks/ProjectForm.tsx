import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DialogFooter } from '@/components/ui/dialog';

export type ProjectFormData = {
  name: string;
  description?: string;
  deadline?: string;
  status: 'Not Started' | 'In Progress' | 'Completed' | 'On Hold' | 'Cancelled';
  assignee_id?: string | null; // <-- store user id
};

export type ProjectFormProps = {
  project?: ProjectFormData;
  onSave: (data: ProjectFormData) => void;
  onCancel: () => void;
  users: { id: string; name: string; email?: string | null }[]; // <-- pass users
};

const projectStatusOptions = [
  'Not Started',
  'In Progress',
  'Completed',
  'On Hold',
  'Cancelled',
];

const assigneePlaceholderValue = 'unassigned';

export function ProjectForm({ project, onSave, onCancel, users }: ProjectFormProps) {
  const [formData, setFormData] = useState<ProjectFormData>({
    name: project?.name || '',
    description: project?.description || '',
    deadline: project?.deadline || '',
    status: project?.status || 'Not Started',
    assignee_id: project?.assignee_id ?? null,
  });
 const [isSaving, setIsSaving] = useState(false)
  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || '',
        description: project.description || '',
        deadline: project.deadline || '',
        status: project.status || 'Not Started',
        assignee_id: project.assignee_id ?? null,
      });
    }
  }, [project]);

// Add 'async' here because onSave is likely an async operation in the parent
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // 1. Start saving process / show spinner
  setIsSaving(true); 

  try {
    // OPTIONAL: Add a brief delay to ensure the user sees the spinner for feedback
    await new Promise(resolve => setTimeout(resolve, 500)); 
    
    // 2. Call the save function (assuming the parent component handles success/failure and closing the dialog)
    // We don't await onSave because we rely on the parent to handle the API call and close the dialog
    onSave({
      ...formData,
      assignee_id: formData.assignee_id || null,
    });
    
    // Note: If onSave is truly synchronous and doesn't close the dialog, you'd move setIsSaving(false) here.
    // For a typical form submission, the parent component handles API call and state change/dialog close.

  } catch (error) {
    // 3. Stop saving on failure if the error doesn't close the dialog
    console.error("Project save failed:", error);
    setIsSaving(false); 
  }
};
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="projectName">Project Name *</Label>
        <Input
          id="projectName"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="projectDescription">Description</Label>
        <Textarea
          id="projectDescription"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="projectDeadline">Deadline</Label>
        <Input
          id="projectDeadline"
          type="date"
          value={formData.deadline || ''}
          onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="projectStatus">Status</Label>
        <Select
          value={formData.status}
          onValueChange={(value) => setFormData({ ...formData, status: value as ProjectFormData['status'] })}
        >
          <SelectTrigger id="projectStatus">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {projectStatusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Project Lead (assignee_id) */}
      <div>
        <Label htmlFor="projectAssignee">Project Lead</Label>
        <Select
          value={formData.assignee_id ?? assigneePlaceholderValue}
          onValueChange={(value) =>
            setFormData({
              ...formData,
              assignee_id: value === assigneePlaceholderValue ? null : value,
            })
          }
        >
          <SelectTrigger id="projectAssignee">
            <SelectValue placeholder="Select project lead" />
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


<DialogFooter>
  <Button type="submit" disabled={isSaving}>
    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
    {project ? 'Update Project' : 'Create Project'}
  </Button>
  <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
    Cancel
  </Button>
</DialogFooter>
    </form>
  );
}
