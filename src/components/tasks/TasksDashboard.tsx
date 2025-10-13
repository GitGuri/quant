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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { IntegrationsDialog } from './IntegrationsDialog';

const API_BASE = 'https://quantnow-sa1e.onrender.com';
const NONE_VALUE = '__none__';

/* ---------- Types ---------- */
type Project = {
  id: string;
  name: string;
  progress_percentage?: number;
};

type Task = {
  id: string;
  title: string;
  status: 'To Do' | 'In Progress' | 'Review' | 'Done' | 'Archived' | 'Overdue';
  progress_percentage: number;
  due_date?: string | null;
  assignee_id?: string | null;
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

// Guard for SelectItem: Radix requires value !== ''
const isValidId = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export default function TasksDashboard() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] =
    useState<'all' | 'inprogress' | 'completed' | 'overdue' | 'archived'>('all');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<string | 'all'>('all');

  // Add Project dialog
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string; email?: string | null }[]>([]);

  // Projects Progress UX state
  const [projQuery, setProjQuery] = useState('');
  const [projSort, setProjSort] =
    useState<'name' | 'progress_desc' | 'progress_asc'>('progress_desc');
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [condensed, setCondensed] = useState(true);

  // Refresh state
  const [refreshing, setRefreshing] = useState(false);

  // Import dialog state
  const [importOpen, setImportOpen] = useState(false);
  const [importProvider, setImportProvider] = useState<'fireflies' | 'readai'>('fireflies');
  const [meetingInput, setMeetingInput] = useState(''); // URL or ID
  const [importProjectId, setImportProjectId] = useState<string>(NONE_VALUE);
  const [defaultAssigneeEmails, setDefaultAssigneeEmails] = useState('');
  const [importing, setImporting] = useState(false);

  // Integrations dialog state
  const [integrationsOpen, setIntegrationsOpen] = useState(false);

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
      toast({ title: 'Error', description: e.message || 'Failed to load tasks', variant: 'destructive' });
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
      toast({ title: 'Error', description: e.message || 'Failed to load projects', variant: 'destructive' });
    }
  }, [toast]);

  const fetchUsers = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/users`, { headers: { ...authHeaders() } });
      if (!r.ok) return setUsers([]);
      const data = await r.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setUsers([]);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchTasks();
    fetchProjects();
    fetchUsers();
  }, [fetchTasks, fetchProjects, fetchUsers]);

  /* ======================================================
     LIVE RELOAD: listen for app-wide custom events
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
      events.forEach((e) => window.removeEventListener(e, handler as EventListener));
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
      toast({ title: 'Refresh failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  }, [fetchTasks, fetchProjects, fetchUsers, toast]);

  /* ===========================
     Helpers / KPIs
     =========================== */
  const pctNum = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v ?? 0))));
  const isOverdue = (t: { due_date?: string | null; status: Task['status']; progress_percentage: number | string }) => {
    if (!t.due_date) return false;
    if (t.status === 'Done' || t.status === 'Archived') return false;
    if (pctNum(t.progress_percentage) >= 100) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(t.due_date as string); due.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
  };

  const kpis = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status !== 'Archived' && pctNum(t.progress_percentage) >= 100).length;
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
      const progress = agg && agg.count > 0 ? Math.round(agg.total / agg.count) : 0;
      return { ...p, progress_percentage: progress };
    });
  }, [projects, tasks]);

  // Filter/sort for Projects Progress card
  const filteredSortedProjects = useMemo(() => {
    let rows = projectsWithProgress;
    if (projQuery.trim()) {
      const q = projQuery.toLowerCase();
      rows = rows.filter((p) => p.name.toLowerCase().includes(q));
    }
    rows = [...rows].sort((a, b) => {
      const pa = a.progress_percentage ?? 0;
      const pb = b.progress_percentage ?? 0;
      if (projSort === 'name') return a.name.localeCompare(b.name);
      if (projSort === 'progress_desc') return pb - pa;
      return pa - pb; // progress_asc
    });
    return rows;
  }, [projectsWithProgress, projQuery, projSort]);

  // Create project
  const onProjectSaved = async (data: ProjectFormData) => {
    try {
      const r = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: data.name,
          description: data.description || '',
          deadline: data.deadline || null,
          status: data.status,
          assignee_id: data.assignee_id ?? null,
        }),
      });
      if (!r.ok) throw new Error('Failed to create project');
      toast({ title: `Project "${data.name}" created` });
      setProjectDialogOpen(false);
      await fetchProjects();
      window.dispatchEvent(new Event('projects:created'));
      window.dispatchEvent(new Event('projects:refresh'));
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to create project', variant: 'destructive' });
    }
  };

  const currentFilters = { search, projectId: projectFilter === 'all' ? undefined : projectFilter, tab: activeTab };

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
        toast({ title: 'Meeting required', description: 'Paste a meeting URL or ID.', variant: 'destructive' });
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
        new CustomEvent('tasks:import', { detail: { source: importProvider, tasks: j.created || [] } })
      );
      window.dispatchEvent(new Event('tasks:refresh'));
      toast({ title: 'Imported', description: `${(j.created || []).length} task(s) added` });
      setImportOpen(false);
    } catch (e: any) {
      toast({ title: 'Import failed', description: e?.message ?? 'Error', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  }, [meetingInput, importProvider, importProjectId, defaultAssigneeEmails, toast]);

  /* ---------- Sanitized lists for Selects ---------- */
  const sanitizedProjects = useMemo(
    () => (projects || []).filter((p) => isValidId(p.id)),
    [projects]
  );

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Tasks" value={kpis.total} description="All tasks" icon={BarChart3} />
        <KpiCard title="In Progress" value={kpis.inProgress} description="Working & in review" icon={Clock3} />
        <KpiCard title="Completed" value={kpis.completed} description="Done" icon={CheckCircle2} />
        <KpiCard title="Overdue" value={kpis.overdue} description="Needs attention" icon={AlertTriangle} />
      </div>

      {/* Projects Progress */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
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

            <Select value={projSort} onValueChange={(v) => setProjSort(v as 'name' | 'progress_desc' | 'progress_asc')}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="progress_desc">Top progress</SelectItem>
                <SelectItem value="progress_asc">Lowest progress</SelectItem>
                <SelectItem value="name">Name (A–Z)</SelectItem>
              </SelectContent>
            </Select>

            <div className="w-[220px]">
              <Input placeholder="Search projects…" value={projQuery} onChange={(e) => setProjQuery(e.target.value)} />
            </div>

            <Button variant="outline" size="sm" onClick={() => setShowAllProjects((s) => !s)}>
              {showAllProjects ? 'Show top 5' : 'Show all'}
            </Button>
          </div>
        </div>

        {filteredSortedProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">No projects.</p>
        ) : (
          <div className="mt-4 pr-1" style={{ maxHeight: 280, overflowY: 'auto' }}>
            {(showAllProjects ? filteredSortedProjects : filteredSortedProjects.slice(0, 5)).map((p) => (
              <div key={p.id} className={condensed ? 'mb-2' : 'mb-3'}>
                <div className={`flex justify-between ${condensed ? 'mb-0.5' : 'mb-1'}`}>
                  <span className={`text-sm ${condensed ? 'leading-tight' : ''}`}>{p.name}</span>
                  <span className="text-xs text-gray-500">{p.progress_percentage ?? 0}%</span>
                </div>
                <div className={condensed ? 'h-2 bg-gray-200 rounded-full' : 'h-2.5 bg-gray-200 rounded-full'}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${p.progress_percentage ?? 0}%`,
                      background: 'linear-gradient(to right, #4ade80, #22d3ee, #3b82f6)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex gap-2">
            <Button onClick={() => window.dispatchEvent(new CustomEvent('tasks:add'))}>
              <Plus className="h-4 w-4 mr-2" /> Add Task
            </Button>

            <Button variant="outline" onClick={() => setProjectDialogOpen(true)}>
              <FolderPlus className="h-4 w-4 mr-2" /> Add Project
            </Button>

            {/* Import from Notetaker (Fireflies / Read.ai) */}
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
              <Input placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <Select value={projectFilter} onValueChange={(v) => setProjectFilter(v as any)}>
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
                      <span className="text-xs text-gray-500">{p.progress_percentage ?? 0}%</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Tabs + Table */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="inprogress">In Progress</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <TasksTable
            mode="all"
            filters={currentFilters}
            onChanged={async () => {
              await fetchTasks();
              await fetchProjects();
              window.dispatchEvent(new Event('tasks:refresh'));
              window.dispatchEvent(new Event('projects:refresh'));
            }}
            projects={projects}
            users={users}
          />
        </TabsContent>

        <TabsContent value="inprogress" className="mt-4">
          <TasksTable
            mode="inprogress"
            filters={currentFilters}
            onChanged={async () => {
              await fetchTasks();
              await fetchProjects();
              window.dispatchEvent(new Event('tasks:refresh'));
              window.dispatchEvent(new Event('projects:refresh'));
            }}
            projects={projects}
            users={users}
          />
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          <TasksTable
            mode="completed"
            filters={currentFilters}
            onChanged={async () => {
              await fetchTasks();
              await fetchProjects();
              window.dispatchEvent(new Event('tasks:refresh'));
              window.dispatchEvent(new Event('projects:refresh'));
            }}
            projects={projects}
            users={users}
          />
        </TabsContent>

        <TabsContent value="overdue" className="mt-4">
          <TasksTable
            mode="overdue"
            filters={currentFilters}
            onChanged={async () => {
              await fetchTasks();
              await fetchProjects();
              window.dispatchEvent(new Event('tasks:refresh'));
              window.dispatchEvent(new Event('projects:refresh'));
            }}
            projects={projects}
            users={users}
          />
        </TabsContent>

        <TabsContent value="archived" className="mt-4">
          <TasksTable
            mode="archived"
            filters={currentFilters}
            onChanged={async () => {
              await fetchTasks();
              await fetchProjects();
              window.dispatchEvent(new Event('tasks:refresh'));
              window.dispatchEvent(new Event('projects:refresh'));
            }}
            projects={projects}
            users={users}
          />
        </TabsContent>
      </Tabs>

      {/* Add Project Dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription className="sr-only">Create a new project</DialogDescription>
          </DialogHeader>
          <ProjectForm
            users={users}
            onSave={onProjectSaved}
            onCancel={() => setProjectDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Import from Notetaker Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Import from AI Notetaker</DialogTitle>
            <DialogDescription>Pull action items from a Fireflies or Read.ai meeting.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-4 items-center gap-3">
              <label className="text-sm text-right">Provider</label>
              <div className="col-span-3">
                <Select value={importProvider} onValueChange={(v) => setImportProvider(v as any)}>
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
                <Select value={importProjectId} onValueChange={(v) => setImportProjectId(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="— none —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>— none —</SelectItem>
                    {sanitizedProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
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
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
              Cancel
            </Button>
            <Button onClick={submitImport} disabled={importing}>
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Integrations Dialog (mounted at root, not nested) */}
      <IntegrationsDialog open={integrationsOpen} onOpenChange={setIntegrationsOpen} scope="user" />
    </div>
  );
}
