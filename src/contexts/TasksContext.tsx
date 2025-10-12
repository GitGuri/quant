// src/contexts/TasksContext.tsx
import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';

type Task = any;     // your real types
type Project = any;

type Ctx = {
  tasks: Task[];
  projects: Project[];
  isLoading: boolean;
  refreshAll: () => Promise<void>;
  createProject: (input: Partial<Project>) => Promise<Project | null>;
  createTask: (input: Partial<Task>) => Promise<Task | null>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
};

const TasksCtx = createContext<Ctx | null>(null);
export const useTasks = () => useContext(TasksCtx)!;

const API = 'https://quantnow-sa1e.onrender.com';
const noStore: RequestInit = { cache: 'no-store' };

export function TasksProvider({children}:{children: React.ReactNode}) {
  const token = localStorage.getItem('token');
  const headers = useMemo(()=>({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }),[token]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshAll = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [pRes, tRes] = await Promise.all([
        fetch(`${API}/api/projects?_=${Date.now()}`, { headers, ...noStore }),
        fetch(`${API}/api/tasks?_=${Date.now()}`,    { headers, ...noStore }),
      ]);
      setProjects(await pRes.json());
      setTasks(await tRes.json());
    } finally { setIsLoading(false); }
  }, [headers, token]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const createProject = useCallback(async (input: Partial<Project>) => {
    const res = await fetch(`${API}/api/projects`, { method:'POST', headers, body: JSON.stringify(input) });
    if (!res.ok) return null;
    const created = await res.json();
    // optimistic add
    setProjects(prev => [...prev, created]);
    // background re-sync (keeps everyone consistent)
    refreshAll();
    return created;
  }, [headers, refreshAll]);

  const createTask = useCallback(async (input: Partial<Task>) => {
    const res = await fetch(`${API}/api/tasks`, { method:'POST', headers, body: JSON.stringify(input) });
    if (!res.ok) return null;
    const created = await res.json();
    setTasks(prev => [...prev, created]); // optimistic
    refreshAll();
    return created;
  }, [headers, refreshAll]);

  const updateTask = useCallback(async (id: string, patch: Partial<Task>) => {
    // optimistic local update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    // server
    await fetch(`${API}/api/tasks/${id}`, { method:'PUT', headers, body: JSON.stringify(patch) });
    refreshAll();
  }, [headers, refreshAll]);

  const value = useMemo(()=>({ tasks, projects, isLoading, refreshAll, createProject, createTask, updateTask }), [tasks, projects, isLoading, refreshAll, createProject, createTask, updateTask]);

  return <TasksCtx.Provider value={value}>{children}</TasksCtx.Provider>;
}
