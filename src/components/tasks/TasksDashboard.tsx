import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Plus,
  BarChart3,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  FolderPlus,
  Filter,
  DownloadCloud,
  RefreshCw,
} from 'lucide-react';
import { KpiCard } from './KpiCard';
import { TasksTable } from './TasksTable';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ProjectForm, type ProjectFormData } from './ProjectForm';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { IntegrationsDialog } from './IntegrationsDialog';

const API_BASE = 'https://quantnow-sa1e.onrender.com';
const NONE_VALUE = '__none__';

/* ---------- Types ---------- */
type Project = {
  id: string;
  name: string;
  description?: string | null;
  deadline?: string | null;
  status?: string | null;
  progress_percentage?: number;
};

type Task = {
  id: string;
  title: string;
  status:
    | 'To Do'
    | 'In Progress'
    | 'Review'
    | 'Done'
    | 'Archived'
    | 'Overdue';
  progress_percentage: number;
  due_date?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  priority: 'Low' | 'Medium' | 'High';
};

/* ---------- Utils ---------- */
function debounce<T extends (...args: any[]) => void>(fn: T, ms = 250) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const isValidId = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

export default function TasksDashboard() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<
    'all' | 'inprogress' | 'completed' | 'overdue' | 'archived'
  >('all');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<string | 'all'>('all');

  // Project form dialog (create/edit)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [users, setUsers] = useState<
    { id: string; name: string; email?: string | null }[]
  >([]);

  // Projects Progress UX state
  const [projQuery, setProjQuery] = useState('');
  const [projSort, setProjSort] = useState<
    'name' | 'progress_desc' | 'progress_asc'
  >('progress_desc');
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [condensed, setCondensed] = useState(true);

  // NEW: status filter for Projects Progress
  const [projStatusFilter, setProjStatusFilter] =
    useState<'all' | 'inprogress' | 'completed'>('all');

  // Integrations dialog state
  const [integrationsOpen, setIntegrationsOpen] = useState(false);

  // 🔹 Project Info popup (keep from your version)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [loadingProjTasks, setLoadingProjTasks] = useState(false);

  // 🔄 Refresh state
  const [refreshing, setRefreshing] = useState(false);

  // 📥 Import from AI Notetaker dialog state (Fireflies / Read.ai)
  const [importOpen, setImportOpen] = useState(false);
  const [importProvider, setImportProvider] =
    useState<'fireflies' | 'readai'>('fireflies');
  const [meetingInput, setMeetingInput] = useState(''); // URL or ID
  const [importProjectId, setImportProjectId] =
    useState<string>(NONE_VALUE);
  const [defaultAssigneeEmails, setDefaultAssigneeEmails] = useState('');
  const [importing, setImporting] = useState(false);

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  /* ===========================
     FETCHERS (cache-busting)
     =========================== */
  const fetchTasks = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/tasks?ts=${Date.now()}`, {
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        cache: 'no-store',
      });
      if (!r.ok) throw new Error('Failed to load tasks');
      const data = await r.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e.message || 'Failed to load tasks',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const fetchProjects = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/projects?ts=${Date.now()}`, {
        headers: { ...authHeaders() },
        cache: 'no-store',
      });
      if (!r.ok) throw new Error('Failed to load projects');
      const data = await r.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e.message || 'Failed to load projects',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const fetchUsers = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/users`, {
        headers: { ...authHeaders() },
      });
      if (!r.ok) return setUsers([]);
      const data = await r.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setUsers([]);
    }
  }, []);

  // 🔹 Fetch tasks for a specific project (keep)
  const fetchProjectTasks = useCallback(
    async (projectId: string) => {
      setLoadingProjTasks(true);
      try {
        const r = await fetch(`${API_BASE}/api/tasks?project_id=${projectId}`, {
          headers: { ...authHeaders() },
        });
        if (!r.ok) throw new Error('Failed to load project tasks');
        const data = await r.json();
        setProjectTasks(Array.isArray(data) ? data : []);
      } catch (e: any) {
        toast({
          title: 'Error',
          description: e.message || 'Failed to fetch tasks',
          variant: 'destructive',
        });
      } finally {
        setLoadingProjTasks(false);
      }
    },
    [toast]
  );

  // Initial load
  useEffect(() => {
    fetchTasks();
    fetchProjects();
    fetchUsers();
  }, [fetchTasks, fetchProjects, fetchUsers]);

  /* ======================================================
     LIVE RELOAD: app-wide custom events (from copied snippet)
     ====================================================== */
  useEffect(() => {
    const refreshDebounced = debounce(async () => {
      await Promise.all([fetchTasks(), fetchProjects()]);
    }, 250);

    const handler = () => refreshDebounced();

    const events = [
      'tasks:refresh',
      'tasks:created',
      'tasks:updated',
      'tasks:deleted',
      'tasks:import',
      'projects:refresh',
      'projects:created',
      'projects:updated',
      'projects:deleted',
    ];

    events.forEach((e) => window.addEventListener(e, handler as EventListener));
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshDebounced();
    });
    window.addEventListener('focus', handler as EventListener);

    return () => {
      events.forEach((e) =>
        window.removeEventListener(e, handler as EventListener)
      );
      window.removeEventListener('focus', handler as EventListener);
    };
  }, [fetchTasks, fetchProjects]);

  // Manual refresh button
  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await Promise.all([fetchTasks(), fetchProjects(), fetchUsers()]);
      toast({ title: 'Data refreshed' });
    } catch (e: any) {
      toast({
        title: 'Refresh failed',
        description: e?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  }, [fetchTasks, fetchProjects, fetchUsers, toast]);

  /* ===========================
     Helpers / KPIs
     =========================== */
  const pctNum = (v: unknown) =>
    Math.max(0, Math.min(100, Math.round(Number(v ?? 0))));
  const isOverdue = (t: {
    due_date?: string | null;
    status: Task['status'];
    progress_percentage: number | string;
  }) => {
    if (!t.due_date) return false;
    if (t.status === 'Done' || t.status === 'Archived') return false;
    if (pctNum(t.progress_percentage) >= 100) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(t.due_date as string);
    due.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
  };

  const kpis = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(
      (t) => t.status !== 'Archived' && pctNum(t.progress_percentage) >= 100
    ).length;
    const inProgress = tasks.filter((t) => {
      const p = pctNum(t.progress_percentage);
      return t.status !== 'Archived' && p >= 1 && p < 100;
    }).length;
    const overdue = tasks.filter((t) => isOverdue(t)).length;
    return { total, completed, inProgress, overdue };
  }, [tasks]);

  // Per-project progress (average of task %s)
  const projectsWithProgress = useMemo<Project[]>(() => {
    if (!projects.length) return projects;
    const sums = new Map<string, { total: number; count: number }>();
    tasks.forEach((t) => {
      const pid = t.project_id || '';
      if (!isValidId(pid)) return;
      const entry = sums.get(pid) || { total: 0, count: 0 };
      entry.total += pctNum(t.progress_percentage);
      entry.count += 1;
      sums.set(pid, entry);
    });
    return projects.map((p) => {
      const agg = sums.get(p.id);
      const progress =
        agg && agg.count > 0 ? Math.round(agg.total / agg.count) : 0;
      return { ...p, progress_percentage: progress };
    });
  }, [projects, tasks]);

  // helper to decide if a project is completed
  const isProjectCompleted = (p: Project) =>
    (p.status?.toLowerCase() === 'completed') || (p.progress_percentage ?? 0) >= 100;

  // Filter/sort for Projects Progress card
  const filteredSortedProjects = useMemo(() => {
    let rows = projectsWithProgress;

    if (projQuery.trim()) {
      const q = projQuery.toLowerCase();
      rows = rows.filter((p) => p.name.toLowerCase().includes(q));
    }

    // apply status filter
    if (projStatusFilter === 'inprogress') {
      rows = rows.filter((p) => !isProjectCompleted(p));
    } else if (projStatusFilter === 'completed') {
      rows = rows.filter((p) => isProjectCompleted(p));
    }

    // preserve user's chosen sort within groups
    rows = [...rows].sort((a, b) => {
      const pa = a.progress_percentage ?? 0;
      const pb = b.progress_percentage ?? 0;
      if (projSort === 'name') return a.name.localeCompare(b.name);
      if (projSort === 'progress_desc') return pb - pa;
      return pa - pb; // progress_asc
    });

    // force completed projects to the bottom
    const incomplete = rows.filter((p) => !isProjectCompleted(p));
    const complete = rows.filter((p) => isProjectCompleted(p));
    return [...incomplete, ...complete];
  }, [projectsWithProgress, projQuery, projSort, projStatusFilter]);

  // Create/update project (keep your edit flow)
  const onProjectSaved = async (data: ProjectFormData) => {
    const editing = localStorage.getItem('editingProject');
    const url = editing
      ? `${API_BASE}/api/projects/${JSON.parse(editing).id}`
      : `${API_BASE}/api/projects`;
    const method = editing ? 'PUT' : 'POST';

    try {
      const r = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error('Failed to save project');
      toast({
        title: editing ? 'Project updated' : 'Project created',
      });
      await Promise.all([fetchProjects(), fetchTasks()]);
      localStorage.removeItem('editingProject');
      setProjectDialogOpen(false);
      window.dispatchEvent(new Event('projects:refresh'));
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e.message,
        variant: 'destructive',
      });
    }
  };

  const currentFilters = {
    search,
    projectId: projectFilter === 'all' ? undefined : projectFilter,
    tab: activeTab,
  };

  /* ===========================
     Import from Notetaker
     =========================== */
  const openImportModal = useCallback(() => {
    setImportProvider('fireflies'); // default
    setMeetingInput('');
    setImportProjectId(NONE_VALUE);
    setDefaultAssigneeEmails('');
    setImportOpen(true);
  }, []);

  const submitImport = useCallback(async () => {
    try {
      if (!meetingInput.trim()) {
        toast({
          title: 'Meeting required',
          description: 'Paste a meeting URL or ID.',
          variant: 'destructive',
        });
        return;
      }
      setImporting(true);

      const emails = defaultAssigneeEmails
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const endpoint =
        importProvider === 'fireflies'
          ? `${API_BASE}/api/integrations/fireflies/import`
          : `${API_BASE}/api/integrations/readai/import`;

      const body = {
        meetingUrl: meetingInput,
        project_id: importProjectId === NONE_VALUE ? null : importProjectId,
        default_assignee_emails: emails,
      };

      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Import failed');

      window.dispatchEvent(
        new CustomEvent('tasks:import', {
          detail: { source: importProvider, tasks: j.created || [] },
        })
      );
      window.dispatchEvent(new Event('tasks:refresh'));
      toast({
        title: 'Imported',
        description: `${(j.created || []).length} task(s) added`,
      });
      setImportOpen(false);
    } catch (e: any) {
      toast({
        title: 'Import failed',
        description: e?.message ?? 'Error',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  }, [
    meetingInput,
    importProvider,
    importProjectId,
    defaultAssigneeEmails,
    toast,
  ]);

  /* ---------- Sanitized projects for selects ---------- */
  const sanitizedProjects = useMemo(
    () => (projects || []).filter((p) => isValidId(p.id)),
    [projects]
  );

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Tasks" value={kpis.total} icon={BarChart3} />
        <KpiCard title="In Progress" value={kpis.inProgress} icon={Clock3} />
        <KpiCard title="Completed" value={kpis.completed} icon={CheckCircle2} />
        <KpiCard title="Overdue" value={kpis.overdue} icon={AlertTriangle} />
      </div>

      {/* Projects Progress */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold">Projects Progress</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCondensed((v) => !v)}
              className="hidden sm:inline-flex"
              title="Toggle compact rows"
            >
              {condensed ? 'Comfortable' : 'Condensed'}
            </Button>

            <Select
              value={projSort}
              onValueChange={(v) =>
                setProjSort(v as 'name' | 'progress_desc' | 'progress_asc')
              }
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="progress_desc">Top progress</SelectItem>
                <SelectItem value="progress_asc">Lowest progress</SelectItem>
                <SelectItem value="name">Name (A–Z)</SelectItem>
              </SelectContent>
            </Select>

            {/* NEW: Status filter */}
            <Select
              value={projStatusFilter}
              onValueChange={(v) => setProjStatusFilter(v as any)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="inprogress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>

            <div className="w-[220px]">
              <Input
                placeholder="Search projects…"
                value={projQuery}
                onChange={(e) => setProjQuery(e.target.value)}
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllProjects((s) => !s)}
            >
              {showAllProjects ? 'Show top 5' : 'Show all'}
            </Button>
          </div>
        </div>

        {filteredSortedProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">No projects.</p>
        ) : (
          <div
            className="mt-4 pr-1"
            style={{ maxHeight: 280, overflowY: 'auto' }}
          >
            {(showAllProjects
              ? filteredSortedProjects
              : filteredSortedProjects.slice(0, 5)
            ).map((p) => (
              <div key={p.id} className={condensed ? 'mb-2' : 'mb-3'}>
                <div className="flex justify-between mb-1">
                  {/* Clickable opens Project Info + loads tasks */}
                  <button
                    onClick={() => {
                      setSelectedProject(p);
                      setProjectInfoOpen(true);
                      fetchProjectTasks(p.id);
                    }}
                    className="text-sm font-medium text-blue-600 hover:underline text-left"
                  >
                    {p.name}
                  </button>
                  <span className="text-xs text-gray-500">
                    {p.progress_percentage ?? 0}%
                  </span>
                </div>
                <div
                  className={
                    condensed
                      ? 'h-2 bg-gray-200 rounded-full'
                      : 'h-2.5 bg-gray-200 rounded-full'
                  }
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${p.progress_percentage ?? 0}%`,
                      background:
                        'linear-gradient(to right, #4ade80, #22d3ee, #3b82f6)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Toolbar (Add Task / Add Project / Import / Integrations / Refresh) */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex gap-2">
            <Button onClick={() => window.dispatchEvent(new CustomEvent('tasks:add'))}>
              <Plus className="h-4 w-4 mr-2" /> Add Task
            </Button>

            <Button variant="outline" onClick={() => setProjectDialogOpen(true)}>
              <FolderPlus className="h-4 w-4 mr-2" /> Add Project
            </Button>

            {/* Import from Notetaker */}
            <Button onClick={openImportModal} disabled={importing}>
              <DownloadCloud className="h-4 w-4 mr-2" />
              Import from AI Notetaker
            </Button>

            {/* Integrations */}
            <Button variant="outline" onClick={() => setIntegrationsOpen(true)}>
              Integrations
            </Button>

            {/* Refresh */}
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>

          <div className="flex flex-1 gap-2 md:justify-end">
            <div className="w-full max-w-[420px] relative">
              <Input
                placeholder="Search tasks…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Select
              value={projectFilter}
              onValueChange={(v) => setProjectFilter(v as any)}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Filter by project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="inline-flex items-center">
                    <Filter className="h-4 w-4 mr-2" />
                    All projects
                  </span>
                </SelectItem>
                {sanitizedProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex justify-between items-center w-full">
                      <span>{p.name}</span>
                      <span className="text-xs text-gray-500">
                        {p.progress_percentage ?? 0}%
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Tasks Table */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as any)}
        className="w-full"
      >
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="inprogress">In Progress</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>

        {(
          ['all', 'inprogress', 'completed', 'overdue', 'archived'] as const
        ).map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <TasksTable
              mode={tab}
              filters={currentFilters}
              projects={projects}
              users={users}
              onChanged={async () => {
                await fetchTasks();
                await fetchProjects();
                window.dispatchEvent(new Event('tasks:refresh'));
                window.dispatchEvent(new Event('projects:refresh'));
              }}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Project Form Dialog (create/edit) */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              {localStorage.getItem('editingProject')
                ? 'Edit Project'
                : 'New Project'}
            </DialogTitle>
          </DialogHeader>
          <ProjectForm
            users={users}
            defaultValues={
              localStorage.getItem('editingProject')
                ? JSON.parse(localStorage.getItem('editingProject') as string)
                : undefined
            }
            onSave={onProjectSaved}
            onCancel={() => {
              localStorage.removeItem('editingProject');
              setProjectDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Project Info Popup (kept) */}
      <Dialog open={projectInfoOpen} onOpenChange={setProjectInfoOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedProject?.name || 'Project Details'}
            </DialogTitle>
            <DialogDescription>
              {selectedProject?.description || 'No description provided.'}
            </DialogDescription>
          </DialogHeader>

          {selectedProject && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Deadline</p>
                  <p>
                    {selectedProject.deadline
                      ? new Date(selectedProject.deadline).toLocaleDateString()
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Status</p>
                  <p>{selectedProject.status || 'Not Started'}</p>
                </div>
              </div>

              <div>
                <p className="font-medium mb-2">Tasks</p>
                {loadingProjTasks ? (
                  <p className="text-gray-500 text-sm">Loading tasks…</p>
                ) : projectTasks.length === 0 ? (
                  <p className="text-gray-500 text-sm">
                    No tasks under this project.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {projectTasks.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between border rounded-md px-3 py-2 hover:bg-gray-50"
                      >
                        <span className="text-sm font-medium">{t.title}</span>
                        <span className="text-xs text-gray-500">
                          {t.progress_percentage ?? 0}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            {selectedProject && (
              <>
                <Button
                  onClick={() => {
                    localStorage.setItem(
                      'editingProject',
                      JSON.stringify(selectedProject)
                    );
                    setProjectInfoOpen(false);
                    setTimeout(() => setProjectDialogOpen(true), 150);
                  }}
                >
                  Edit Project
                </Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (
                      !confirm('Are you sure you want to delete this project?')
                    )
                      return;
                    try {
                      const r = await fetch(
                        `${API_BASE}/api/projects/${selectedProject.id}`,
                        { method: 'DELETE', headers: { ...authHeaders() } }
                      );
                      if (!r.ok) throw new Error('Failed to delete project');
                      toast({ title: 'Project deleted successfully' });
                      await Promise.all([fetchProjects(), fetchTasks()]);
                      setProjectInfoOpen(false);
                      window.dispatchEvent(new Event('projects:refresh'));
                    } catch (e: any) {
                      toast({
                        title: 'Error deleting project',
                        description: e.message,
                        variant: 'destructive',
                      });
                    }
                  }}
                >
                  Delete
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setProjectInfoOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from Notetaker Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Import from AI Notetaker</DialogTitle>
            <DialogDescription>
              Pull action items from a Fireflies or Read.ai meeting.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-4 items-center gap-3">
              <label className="text-sm text-right">Provider</label>
              <div className="col-span-3">
                <Select
                  value={importProvider}
                  onValueChange={(v) => setImportProvider(v as any)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fireflies">Fireflies</SelectItem>
                    <SelectItem value="readai">Read.ai</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-3">
              <label className="text-sm text-right">Meeting URL or ID</label>
              <Input
                className="col-span-3"
                placeholder="https://app.fireflies.ai/meetings/abc123 or abc123"
                value={meetingInput}
                onChange={(e) => setMeetingInput(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-3">
              <label className="text-sm text-right">Project (optional)</label>
              <div className="col-span-3">
                <Select
                  value={importProjectId}
                  onValueChange={(v) => setImportProjectId(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="— none —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>— none —</SelectItem>
                    {sanitizedProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-3">
              <label className="text-sm text-right">Default assignees</label>
              <Input
                className="col-span-3"
                placeholder="comma-separated emails (optional)"
                value={defaultAssigneeEmails}
                onChange={(e) => setDefaultAssigneeEmails(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportOpen(false)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button onClick={submitImport} disabled={importing}>
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Integrations */}
      <IntegrationsDialog
        open={integrationsOpen}
        onOpenChange={setIntegrationsOpen}
        scope="user"
      />
    </div>
  );
}
