// KanbanBoard.tsx
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Search, X, Edit3, Trash2, CheckCircle, PieChart, LayoutDashboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  closestCorners,
  useDroppable
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TaskCard } from './TaskCard';
// --- UPDATED: Import TaskStepFormData from TaskForm ---
import { TaskForm, type TaskFormData, type TaskStepFormData } from './TaskForm'; // Assuming TaskStepFormData is exported
import { ProjectForm, type ProjectFormData } from './ProjectForm';
import { useToast } from '@/hooks/use-toast';
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
import { KpiCard } from './KpiCard';
import { useAuth } from '../../AuthPage';

// ---- New: User type ----
interface User {
  id: string;
  name: string;
  email?: string | null;
  avatar_url?: string | null;
}

// Define Project interface with new fields
interface Project {
  id: string;
  name: string;
  description?: string;
  deadline?: string;
  status: 'Not Started' | 'In Progress' | 'Completed' | 'On Hold' | 'Cancelled';
  assignee_id?: string | null;     // <-- store user id
  assignee_name?: string | null;   // <-- server can denormalize to name
  progress_percentage: number;
}

// ---- UPDATED: Extend Task interface to include project information + assignee fields + NEW progress fields ----
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
  assignee_id?: string | null;     // <-- store user id
  assignee_name?: string | null;   // <-- backend-provided name
  project_id?: string | null;
  project_name?: string | null;
  // --- NEW FIELDS FOR PROGRESS TRACKING ---
  progress_mode: 'manual' | 'target' | 'steps'; // Matches backend enum
  progress_goal: number | null;
  progress_current: number | null;
  steps: TaskStep[]; // Array of steps
}
// ---- END UPDATED ----

interface Column {
  id: string;
  title: string;
  tasks: Task[]; // Updated type
  color: string;
}

const staticColumns: Column[] = [
  { id: 'todo', title: 'To Do', color: 'bg-gray-50', tasks: [] },
  { id: 'inprogress', title: 'In Progress', color: 'bg-blue-50', tasks: [] },
  { id: 'done', title: 'Done', color: 'bg-green-50', tasks: [] },
];

export function KanbanBoard() {
  const [columns, setColumns] = useState<Column[]>(staticColumns);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [showDeleteProjectAlert, setShowDeleteProjectAlert] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]); // <-- New: users list
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true); // Add loading state for task creation

  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');

  const getAuthHeaders = useCallback(() => {
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, [token]);

  const droppableRefs = useRef<{ [key: string]: { setNodeRef: (node: HTMLElement | null) => void; isOver: boolean } }>({});
  staticColumns.forEach(column => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { setNodeRef, isOver } = useDroppable({ id: column.id });
    droppableRefs.current[column.id] = { setNodeRef, isOver };
  });

  const getStatusFromProgress = (progress: number): Task['status'] => {
    if (progress === 100) return 'Done';
    if (progress >= 75) return 'Review'; // Added 'Review' status
    if (progress >= 25) return 'In Progress';
    return 'To Do';
  };

  const getColumnIdFromStatus = (status: Task['status']): string => {
    switch (status) {
      case 'To Do': return 'todo';
      case 'In Progress': return 'inprogress';
      case 'Review': return 'inprogress'; // Map 'Review' to 'In Progress' column
      case 'Done': return 'done';
      default: return 'todo';
    }
  };

  const calculateProjectProgress = useCallback((projectId: string) => {
    const projectTasks = columns.flatMap(column => column.tasks).filter(task => task.project_id === projectId);
    if (projectTasks.length === 0) return 0;
    const total = projectTasks.reduce((sum, t) => sum + t.progress_percentage, 0);
    return Math.round(total / projectTasks.length);
  }, [columns]);

  useEffect(() => {
    setProjects(prev =>
      prev.map(p => ({
        ...p,
        progress_percentage: calculateProjectProgress(p.id),
      }))
    );
  }, [columns, calculateProjectProgress]);

  // ---- New: fetch users ----
  const fetchUsers = useCallback(async () => {
    // --- FIXED: Removed extra space in URL ---
    const resp = await fetch('https://quantnow-cu1v.onrender.com/api/users', {
      headers: getAuthHeaders(),
    });
    if (!resp.ok) throw new Error(`Users fetch failed: ${resp.status}`);
    const data: User[] = await resp.json();
    setUsers(data);
  }, [getAuthHeaders]);

  const fetchTasksAndProjects = useCallback(async () => {
    if (!isAuthenticated || !token) {
      console.warn('KanbanBoard: Not authenticated. Skipping data fetch.');
      setIsLoading(false);
      setColumns(staticColumns.map(col => ({ ...col, tasks: [] })));
      setProjects([]);
      toast({
        title: 'Authentication Required',
        description: 'Please log in to view and manage tasks and projects.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await fetchUsers(); // <-- ensure users are loaded

      // --- FIXED: Removed extra space in URL ---
      const projectsResponse = await fetch('https://quantnow-cu1v.onrender.com/api/projects', {
        headers: getAuthHeaders(),
      });
      if (!projectsResponse.ok) throw new Error(`HTTP error! status: ${projectsResponse.status}`);
      const projectsData: Project[] = await projectsResponse.json();
      setProjects(projectsData);

      // --- FIXED: Removed extra space in URL ---
      const tasksResponse = await fetch('https://quantnow-cu1v.onrender.com/api/tasks', {
        headers: getAuthHeaders(),
      });
      if (!tasksResponse.ok) throw new Error(`HTTP error! status: ${tasksResponse.status}`);
      // --- CRITICAL FIX: Use tasksResponse.json(), not tasksData.json() ---
      const tasksData: Task[] = await tasksResponse.json(); // Corrected line

      const newColumns = staticColumns.map(column => ({
        ...column,
        tasks: tasksData.filter(task => getColumnIdFromStatus(task.status) === column.id)
      }));
      setColumns(newColumns);

    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load tasks or projects. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast, isAuthenticated, token, getAuthHeaders, fetchUsers]);

  useEffect(() => {
    fetchTasksAndProjects();
  }, [fetchTasksAndProjects]);

  const filteredColumns = useMemo(() => {
    return columns.map((column) => ({
      ...column,
      tasks: column.tasks.filter((task) => {
        const matchesProject =
          selectedProjectId === 'all' ||
          (selectedProjectId === 'unassigned' && !task.project_id) ||
          (task.project_id && task.project_id === selectedProjectId);

        const q = searchQuery.trim().toLowerCase();
        const matchesSearch = q
          ? (task.title?.toLowerCase().includes(q) ||
             task.description?.toLowerCase().includes(q) ||
             task.assignee_name?.toLowerCase().includes(q) ||
             task.project_name?.toLowerCase().includes(q))
          : true;

        return matchesProject && matchesSearch;
      }),
    }));
  }, [columns, searchQuery, selectedProjectId]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = findTaskById(active.id as string);
    setDraggedTask(task);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedTask(null);
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    const activeTask = findTaskById(activeId);
    const activeColumn = findColumnByTaskId(activeId);
    let overColumn: Column | null = findColumnById(overId) || findColumnByTaskId(overId);
    if (!activeTask || !activeColumn || !overColumn) return;

    if (activeColumn.id !== overColumn.id) {
      const statusMap: Record<string, Task['status']> = {
        todo: 'To Do',
        inprogress: 'In Progress',
        done: 'Done',
        // Note: 'Review' status is usually set by progress logic, not direct drag
      };
      const newStatus = statusMap[overColumn.id] || activeTask.status;

      // --- IMPROVED: Optimistic UI - Update local state with full task object ---
      setColumns(prevColumns =>
        prevColumns.map(column => {
          if (column.id === activeColumn.id) {
            return {
              ...column,
              tasks: column.tasks.filter(t => t.id !== activeId)
            };
          }
          if (column.id === overColumn.id) {
            return {
              ...column,
              tasks: [...column.tasks, { ...activeTask, status: newStatus }]
            };
          }
          return column;
        })
      );

      try {
        // --- FIXED: Removed extra space in URL ---
        const response = await fetch(`https://quantnow-cu1v.onrender.com/api/tasks/${activeTask.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          // --- IMPROVED: Send the potentially updated task object, not just status ---
          body: JSON.stringify({ ...activeTask, status: newStatus }),
        });
        if (!response.ok) throw new Error('Failed to update task status on backend.');
        toast({ title: 'Task moved', description: `Task moved from ${activeColumn.title} to ${overColumn.title}` });
        // Refresh data from backend to ensure consistency
        fetchTasksAndProjects();
      } catch (error) {
        console.error('Error updating task status:', error);
        toast({ title: 'Error', description: 'Failed to move task. Please try again.', variant: 'destructive' });
        // Revert optimistic update on error
        fetchTasksAndProjects();
      }
    }
  };

  const findTaskById = (id: string): Task | null => {
    for (const column of columns) {
      const task = column.tasks.find((t) => t.id === id);
      if (task) return task;
    }
    return null;
  };

  const findColumnById = (id: string): Column | null =>
    columns.find((c) => c.id === id) || null;

  const findColumnByTaskId = (taskId: string): Column | null =>
    columns.find((c) => c.tasks.some((t) => t.id === taskId)) || null;

  const clearSearch = () => setSearchQuery('');

  const handleAddTask = () => setShowNewTaskForm(true);

  // --- UPDATED: handleSaveNewTask with robust step creation ---
  const handleSaveNewTask = async (taskData: TaskFormData, initialStepsToAdd?: TaskStepFormData[]) => {
    if (!isAuthenticated || !token) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to create tasks.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true); // Show loading state during task creation
    let createdTaskId: string | null = null;

    try {
      // --- 1. Create the Task ---
      console.log("[handleSaveNewTask] Creating task with data:", taskData);
      const response = await fetch('https://quantnow-cu1v.onrender.com/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          ...taskData,
          status: getStatusFromProgress(taskData.progress_percentage), // Derive status
          user_id: 'frontend-user-123', // This should ideally come from auth context
          assignee_id: taskData.assignee_id ?? null,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[handleSaveNewTask] Failed to create task. Status:", response.status, "Body:", errorText);
        throw new Error(`Failed to create task on backend. Status: ${response.status}. Details: ${errorText}`);
      }

      const newTask = await response.json();
      createdTaskId = newTask?.id;
      console.log("[handleSaveNewTask] New task created with ID:", createdTaskId);

      if (!createdTaskId) {
        throw new Error("Task creation succeeded, but the response did not contain a valid task ID.");
      }

      // --- 2. Handle Initial Steps (if applicable and task created successfully) ---
      if (taskData.progress_mode === 'steps' && initialStepsToAdd && initialStepsToAdd.length > 0) {
        console.log(`[handleSaveNewTask] Attempting to add ${initialStepsToAdd.length} initial steps to task ${createdTaskId}`);
        const addStepPromises = initialStepsToAdd.map((step, index) =>
          // Use a more robust async/await inside the map for better error handling per step
          (async () => {
            try {
              const stepResponse = await fetch(`https://quantnow-cu1v.onrender.com/api/tasks/${createdTaskId}/steps`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                  title: step.title,
                  weight: step.weight,
                  is_done: step.is_done,
                  position: step.position,
                }),
              });

              if (!stepResponse.ok) {
                const stepErrorText = await stepResponse.text();
                console.error(`[handleSaveNewTask] Failed to add step '${step.title}' (index ${index}) to task ${createdTaskId}:`, stepResponse.status, stepErrorText);
                // Throw an error to be caught by Promise.allSettled
                throw new Error(`HTTP ${stepResponse.status}: ${stepErrorText}`);
              }

              const createdStep = await stepResponse.json();
              console.log(`[handleSaveNewTask] Successfully added step '${step.title}' (ID: ${createdStep?.id}) to task ${createdTaskId}`);
              return { status: 'fulfilled' as const, value: createdStep, stepTitle: step.title };
            } catch (stepError: any) {
              console.error(`[handleSaveNewTask] Error (network or otherwise) adding step '${step.title}' (index ${index}) to task ${createdTaskId}:`, stepError);
              // Return a rejected status for Promise.allSettled
              return { status: 'rejected' as const, reason: stepError, stepTitle: step.title };
            }
          })()
        );

        // Wait for all step creation attempts to settle (fulfill or reject)
        const results = await Promise.allSettled(addStepPromises);

        // Check for any failures
        const failedSteps = results.filter(result => result.status === 'rejected');
        if (failedSteps.length > 0) {
          console.warn(`[handleSaveNewTask] Some initial steps failed to create for task ${createdTaskId}:`, failedSteps);
          // Show a warning toast to the user
          toast({
            title: 'Task created, but some steps failed',
            description: `The task was created, but ${failedSteps.length} out of ${initialStepsToAdd.length} initial steps could not be added. You can add them later via the task card.`,
            variant: 'destructive', // Consider using 'warning' if available
          });
          // Note: The task itself is still created successfully.
        } else {
          console.log(`[handleSaveNewTask] All ${initialStepsToAdd.length} initial steps successfully added to task ${createdTaskId}`);
        }
      } else {
        console.log("[handleSaveNewTask] No initial steps to add or not in 'steps' mode.");
      }

      // --- 3. Finalize: Refresh the task list and close the form ---
      await fetchTasksAndProjects(); // Refresh list to show the new task (and ideally its steps if they were created)
      setShowNewTaskForm(false);
      toast({ title: 'Task created successfully' });

    } catch (error) {
      console.error('[handleSaveNewTask] Error during task creation or step addition:', error);
      // Provide a user-friendly error message
      toast({
        title: 'Error',
        description: `Failed to create task${createdTaskId ? ` or add steps to task ${createdTaskId}` : ''}. Please try again. Details: ${error instanceof Error ? error.message : String(error)}`,
        variant: 'destructive',
      });
      // Even if step creation failed, if the task was created, it's good to refresh the list
      // to show the user the task exists (even if steps are missing).
      if (createdTaskId) {
         fetchTasksAndProjects();
      }
    } finally {
       setIsLoading(false); // Ensure loading state is turned off
    }
  };
  // --- END UPDATED ---

  const handleOpenEdit = (task: Task) => setTaskToEdit(task);

  // --- UPDATED: handleSubmitEdit to pass new fields ---
  const handleSubmitEdit = async (taskData: TaskFormData) => {
    if (!taskToEdit) return;
    if (!isAuthenticated || !token) {
      toast({ title: 'Authentication Required', description: 'Please log in to edit tasks.', variant: 'destructive' });
      return;
    }
    const statusFromProgress = getStatusFromProgress(taskData.progress_percentage);
    try {
      // --- FIXED: Removed extra space in URL ---
      const response = await fetch(`https://quantnow-cu1v.onrender.com/api/tasks/${taskToEdit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          ...taskData,
          // --- NEW: Include new progress fields ---
          progress_mode: taskData.progress_mode,
          progress_goal: taskData.progress_mode === 'target' ? taskData.progress_goal : null,
          progress_current: taskData.progress_mode === 'target' ? taskData.progress_current : 0,
          // steps are managed separately via their own endpoint
          status: statusFromProgress,
          user_id: 'frontend-user-123', // This should ideally come from auth context
          assignee_id: taskData.assignee_id ?? null,
        }),
      });
      if (!response.ok) throw new Error('Failed to update task on backend.');
      fetchTasksAndProjects(); // Refresh list
      setTaskToEdit(null);
      toast({ title: 'Task updated successfully' });
    } catch (error) {
      console.error('Error updating task:', error);
      toast({ title: 'Error', description: 'Failed to update task. Please try again.', variant: 'destructive' });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!isAuthenticated || !token) {
      toast({ title: 'Authentication Required', description: 'Please log in to delete tasks.', variant: 'destructive' });
      return;
    }
    try {
      // --- FIXED: Removed extra space in URL ---
      const response = await fetch(`https://quantnow-cu1v.onrender.com/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to delete task on backend.');
      fetchTasksAndProjects(); // Refresh list
      toast({ title: 'Task deleted successfully' });
    } catch (error) {
      console.error('Error deleting task:', error);
      toast({ title: 'Error', description: 'Failed to delete task. Please try again.', variant: 'destructive' });
    }
  };

  const handleSaveNewProject = async (projectData: ProjectFormData) => {
    if (!isAuthenticated || !token) {
      toast({ title: 'Authentication Required', description: 'Please log in to create projects.', variant: 'destructive' });
      return;
    }
    try {
      // --- FIXED: Removed extra space in URL ---
      const response = await fetch('https://quantnow-cu1v.onrender.com/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          ...projectData,
          assignee_id: projectData.assignee_id ?? null,
        }),
      });
      if (!response.ok) throw new Error('Failed to create project on backend.');
      fetchTasksAndProjects(); // Refresh list
      setShowNewProjectForm(false);
      toast({ title: `Project "${projectData.name}" created successfully!` });
    } catch (error) {
      console.error('Error creating project:', error);
      toast({ title: 'Error', description: 'Failed to create project. Please try again.', variant: 'destructive' });
    }
  };

  const handleEditProject = async (projectData: ProjectFormData) => {
    if (!activeProject) return;
    if (!isAuthenticated || !token) {
      toast({ title: 'Authentication Required', description: 'Please log in to edit projects.', variant: 'destructive' });
      return;
    }
    try {
      // --- FIXED: Removed extra space in URL ---
      const response = await fetch(`https://quantnow-cu1v.onrender.com/api/projects/${activeProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          ...projectData,
          assignee_id: projectData.assignee_id ?? null,
        }),
      });
      if (!response.ok) throw new Error('Failed to update project on backend.');
      fetchTasksAndProjects(); // Refresh list
      setActiveProject(null);
      toast({ title: `Project "${projectData.name}" updated successfully!` });
    } catch (error) {
      console.error('Error updating project:', error);
      toast({ title: 'Error', description: 'Failed to update project. Please try again.', variant: 'destructive' });
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    if (!isAuthenticated || !token) {
      toast({ title: 'Authentication Required', description: 'Please log in to delete projects.', variant: 'destructive' });
      return;
    }
    try {
      // --- FIXED: Removed extra space in URL ---
      const response = await fetch(`https://quantnow-cu1v.onrender.com/api/projects/${projectToDelete.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!response.ok) throw new Error('Failed to delete project on backend.');
      fetchTasksAndProjects(); // Refresh list
      toast({ title: `Project "${projectToDelete.name}" and its tasks deleted.` });
      setProjectToDelete(null);
      setShowDeleteProjectAlert(false);
    } catch (error) {
      console.error('Error deleting project:', error);
      toast({ title: 'Error', description: 'Failed to delete project. Please try again.', variant: 'destructive' });
    }
  };

  const allTasks = useMemo(() => columns.flatMap(column => column.tasks), [columns]);

  const completedTasksCount = useMemo(() =>
    allTasks.filter(task => task.status === 'Done').length
  , [allTasks]);

  const inProgressTasksCount = useMemo(() =>
    allTasks.filter(task => task.status === 'In Progress' || task.status === 'Review').length
  , [allTasks]);

  const completedProjectsCount = useMemo(() =>
    projects.filter(project => project.status === 'Completed').length
  , [projects]);

  const inProgressProjectsCount = useMemo(() =>
    projects.filter(project => project.status === 'In Progress' || project.status === 'On Hold').length
  , [projects]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Tasks</h1>
        <p className="text-gray-600 mb-4">Manage your tasks efficiently</p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <KpiCard title="Completed Tasks" value={completedTasksCount} icon={CheckCircle} description="Tasks marked as done" />
          <KpiCard title="In Progress Tasks" value={inProgressTasksCount} icon={PieChart} description="Tasks currently being worked on" />
          <KpiCard title="Completed Projects" value={completedProjectsCount} icon={CheckCircle} description="Projects that are finished" />
          <KpiCard title="In Progress Projects" value={inProgressProjectsCount} icon={LayoutDashboard} description="Projects currently active" />
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search tasks, descriptions, assignees, or projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 bg-white border-gray-200"
            />
            {searchQuery && (
              <Button variant="ghost" size="sm" onClick={clearSearch} className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-gray-100">
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-[220px] bg-white border-gray-200">
                <SelectValue placeholder="Filter by Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                <SelectItem value="unassigned">Unassigned Tasks</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <div className="flex justify-between items-center w-full">
                      <span>{project.name}</span>
                      {project.progress_percentage !== undefined && (
                        <span className="text-xs text-gray-500">
                          {project.progress_percentage}%
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedProjectId !== 'all' && selectedProjectId !== 'unassigned' && (
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setActiveProject(projects.find(p => p.id === selectedProjectId) || null)}
                  aria-label="Edit Project"
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 text-red-500 hover:bg-red-50 hover:text-red-600"
                  onClick={() => {
                    setProjectToDelete(projects.find(p => p.id === selectedProjectId) || null);
                    setShowDeleteProjectAlert(true);
                  }}
                  aria-label="Delete Project"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <Button onClick={handleAddTask} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" /> Add New Task
          </Button>

          <Button onClick={() => setShowNewProjectForm(true)} className="bg-purple-600 hover:bg-purple-700 text-white">
            <Plus className="h-4 w-4 mr-2" /> Add New Project
          </Button>
        </div>

        {searchQuery && <p className="text-sm text-gray-500 mt-2">Showing results for "{searchQuery}"</p>}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading tasks and projects...</div>
      ) : (
        <DndContext collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredColumns.map((column, columnIndex) => {
              const { setNodeRef, isOver } = droppableRefs.current[column.id];
              const columnTasks = column.tasks;

              return (
                <motion.div key={column.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: columnIndex * 0.1 }}>
                  <Card className={`${column.color} border-0 shadow-sm`}>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text/base font-semibold text-gray-900">{column.title}</CardTitle>
                          <CardDescription className="text-gray-600">
                            {columnTasks.length} task{columnTasks.length !== 1 ? 's' : ''}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <SortableContext items={columnTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                        <div
                          ref={setNodeRef}
                          className={`space-y-3 min-h-[400px] max-h-[600px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 ${isOver ? 'border-2 border-blue-500 rounded-md' : ''}`}
                        >
                          <AnimatePresence>
                            {columnTasks.map((task) => (
                              // --- UPDATED: Pass onTaskUpdate prop ---
                              <TaskCard
                                key={task.id}
                                task={task}
                                onEdit={handleOpenEdit}
                                onDelete={handleDeleteTask}
                                priority={task.priority}
                                progressPercentage={task.progress_percentage}
                                project_name={task.project_name}
                                projects={projects}
                                users={users} // Pass users if needed by TaskCard directly
                                onTaskUpdate={fetchTasksAndProjects} // Pass refresh function
                              />
                            ))}
                          </AnimatePresence>
                          {columnTasks.length === 0 && !searchQuery && (
                            <div className="flex items-center justify-center h-full w-full py-8 text-gray-400 text-sm italic border-2 border-dashed border-gray-300 rounded-md" style={{ minHeight: '100px' }}>
                              Drag tasks here
                            </div>
                          )}
                          {columnTasks.length === 0 && searchQuery && (
                            <div className="text-center py-8 text-gray-500">
                              <p className="text-sm">No tasks found</p>
                            </div>
                          )}
                        </div>
                      </SortableContext>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          <DragOverlay>
            {draggedTask && (
              // --- UPDATED: Pass onTaskUpdate prop to DragOverlay TaskCard ---
              <TaskCard
                task={draggedTask}
                onEdit={() => {}}
                onDelete={() => {}}
                priority={draggedTask.priority}
                progressPercentage={draggedTask.progress_percentage}
                project_name={draggedTask.project_name}
                projects={projects}
                users={users}
                onTaskUpdate={fetchTasksAndProjects} // Pass refresh function
              />
            )}
          </DragOverlay>

          {/* New Task Dialog */}
          <Dialog open={showNewTaskForm} onOpenChange={setShowNewTaskForm}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Task</DialogTitle>
              </DialogHeader>
              <TaskForm
                onSave={handleSaveNewTask} // Updated to handle initial steps
                onCancel={() => setShowNewTaskForm(false)}
                projects={projects}
                users={users}
              />
            </DialogContent>
          </Dialog>

          {/* Edit Task Dialog */}
          <Dialog open={!!taskToEdit} onOpenChange={(open) => !open && setTaskToEdit(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Task</DialogTitle>
              </DialogHeader>
              {taskToEdit && (
                <TaskForm
                  task={{
                    title: taskToEdit.title,
                    description: taskToEdit.description || '',
                    priority: taskToEdit.priority,
                    assignee_id: taskToEdit.assignee_id ?? null,   // <-- prefill id
                    due_date: taskToEdit.due_date,
                    progress_percentage: taskToEdit.progress_percentage,
                    project_id: taskToEdit.project_id ?? null,
                    // --- NEW: Prefill progress fields for editing ---
                    progress_mode: taskToEdit.progress_mode,
                    progress_goal: taskToEdit.progress_goal,
                    progress_current: taskToEdit.progress_current,
                  }}
                  onSave={handleSubmitEdit}
                  onCancel={() => setTaskToEdit(null)}
                  projects={projects}
                  users={users}           // <-- pass users
                />
              )}
            </DialogContent>
          </Dialog>

          {/* New Project Dialog */}
          <Dialog open={showNewProjectForm} onOpenChange={setShowNewProjectForm}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>
              <ProjectForm
                onSave={handleSaveNewProject}
                onCancel={() => setShowNewProjectForm(false)}
                users={users}           // <-- pass users
              />
            </DialogContent>
          </Dialog>

          {/* Edit Project Dialog */}
          <Dialog open={!!activeProject} onOpenChange={(open) => !open && setActiveProject(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Project</DialogTitle>
              </DialogHeader>
              {activeProject && (
                <ProjectForm
                  project={{
                    name: activeProject.name,
                    description: activeProject.description,
                    deadline: activeProject.deadline,
                    status: activeProject.status,
                    assignee_id: activeProject.assignee_id ?? null, // <-- prefill id
                  }}
                  onSave={handleEditProject}
                  onCancel={() => setActiveProject(null)}
                  users={users}         // <-- pass users
                />
              )}
            </DialogContent>
          </Dialog>

          {/* Delete Project Confirmation Dialog */}
          <AlertDialog open={showDeleteProjectAlert} onOpenChange={setShowDeleteProjectAlert}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="hidden">Delete Project</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Project</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete project "{projectToDelete?.name}"?
                  This will also delete all associated tasks. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteProject}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

        </DndContext>
      )}
    </div>
  );
}