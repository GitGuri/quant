import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, BarChart3, CheckCircle2, Clock3, AlertTriangle, FolderPlus, Filter } from 'lucide-react';
import { KpiCard } from './KpiCard';
import { TasksTable } from './TasksTable';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProjectForm, type ProjectFormData } from './ProjectForm';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

const API_BASE = 'https://quantnow.onrender.com';

type Project = { id: string; name: string };
type Task = {
  id: string;
  title: string;
  status: 'To Do' | 'In Progress' | 'Review' | 'Done' | 'Archived' | 'Overdue';
  progress_percentage: number;
  due_date?: string | null;
  assignee_id?: string | null;
  project_id?: string | null;
  priority: 'Low' | 'Medium' | 'High';
};

export default function TasksDashboard() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'inprogress' | 'completed' | 'overdue' | 'archived'>('all');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<string | 'all'>('all');

  // Add Project dialog
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string; email?: string | null }[]>([]);

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchTasks = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/tasks`, { headers: { 'Content-Type': 'application/json', ...authHeaders() } });
      if (!r.ok) throw new Error('Failed to load tasks');
      const data = await r.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to load tasks', variant: 'destructive' });
    }
  }, [toast]);

  const fetchProjects = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/projects`, { headers: { ...authHeaders() } });
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

  useEffect(() => {
    fetchTasks();
    fetchProjects();
    fetchUsers();
  }, [fetchTasks, fetchProjects, fetchUsers]);

  // KPIs
  const kpis = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'Done').length;
    const inProgress = tasks.filter(t => t.status === 'In Progress' || t.status === 'Review').length;
    const overdue = tasks.filter(t => t.status === 'Overdue').length;
    return { total, completed, inProgress, overdue };
  }, [tasks]);

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
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to create project', variant: 'destructive' });
    }
  };

  // filtered params to pass to table
  const currentFilters = { search, projectId: projectFilter === 'all' ? undefined : projectFilter, tab: activeTab };

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Tasks" value={kpis.total} description="All tasks" icon={BarChart3} /> {/* :contentReference[oaicite:4]{index=4} */}
        <KpiCard title="In Progress" value={kpis.inProgress} description="Working & in review" icon={Clock3} /> {/* :contentReference[oaicite:5]{index=5} */}
        <KpiCard title="Completed" value={kpis.completed} description="Done" icon={CheckCircle2} />
        <KpiCard title="Overdue" value={kpis.overdue} description="Needs attention" icon={AlertTriangle} />
      </div>

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
          </div>

          <div className="flex flex-1 gap-2 md:justify-end">
            <div className="w-full max-w-[420px] relative">
              <Input
                placeholder="Search tasks…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={projectFilter} onValueChange={(v) => setProjectFilter(v as any)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Filter by project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><span className="inline-flex items-center"><Filter className="h-4 w-4 mr-2" />All projects</span></SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Tabs + Table (full width) */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="inprogress">In Progress</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <TasksTable mode="all" filters={currentFilters} onChanged={fetchTasks} />
        </TabsContent>
        <TabsContent value="inprogress" className="mt-4">
          <TasksTable mode="inprogress" filters={currentFilters} onChanged={fetchTasks} />
        </TabsContent>
        <TabsContent value="completed" className="mt-4">
          <TasksTable mode="completed" filters={currentFilters} onChanged={fetchTasks} />
        </TabsContent>
        <TabsContent value="overdue" className="mt-4">
          <TasksTable mode="overdue" filters={currentFilters} onChanged={fetchTasks} />
        </TabsContent>
        <TabsContent value="archived" className="mt-4">
          <TasksTable mode="archived" filters={currentFilters} onChanged={fetchTasks} />
        </TabsContent>
      </Tabs>

      {/* Add Project Dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>
          <ProjectForm users={users} onSave={onProjectSaved} onCancel={() => setProjectDialogOpen(false)} /> {/* :contentReference[oaicite:6]{index=6} */}
        </DialogContent>
      </Dialog>
    </div>
  );
}
