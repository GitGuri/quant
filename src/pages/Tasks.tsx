import React, {
  useEffect,
  useState,
  Suspense,
  lazy,
  useCallback,
  useMemo,
} from 'react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import TasksDashboard from '../components/tasks/TasksDashboard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table as TableIcon, LayoutDashboard, FileText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const KanbanBoard = lazy(async () => {
  const mod = await import('../components/tasks/KanbanBoard');
  return { default: mod.KanbanBoard };
});

type ViewMode = 'table' | 'kanban';

type NoteVisibility = 'owner' | 'admin' | 'all';
type NoteKind = 'note' | 'progress' | 'status' | 'system';
type GroupByMode = 'none' | 'task' | 'assignee' | 'date';

type TaskNoteAssignee = {
  id: string;
  name: string | null;
  email: string | null;
};

type TaskNoteOverview = {
  id: string;
  task_id: string;
  task_title: string;
  author_user_id: string | null;
  author_name: string | null;
  visibility: NoteVisibility;
  kind: NoteKind;
  is_blocker: boolean;
  message: string;
  created_at: string;
  assignees?: TaskNoteAssignee[];
};

const API_BASE = 'https://quantnow-sa1e.onrender.com';

const Tasks = () => {
  const [view, setView] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('tasks:view') as ViewMode | null;
    return saved === 'kanban' ? 'kanban' : 'table';
  });

  useEffect(() => {
    localStorage.setItem('tasks:view', view);
  }, [view]);

  // ───────── Global notes overview state ─────────
  const [showNotesOverview, setShowNotesOverview] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notes, setNotes] = useState<TaskNoteOverview[]>([]);

  // Filters / grouping
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'any' | NoteVisibility>('any');
  const [kindFilter, setKindFilter] = useState<'any' | NoteKind>('any');
  const [groupBy, setGroupBy] = useState<GroupByMode>('none');

  const fetchOverview = useCallback(async () => {
    setNotesLoading(true);
    setNotesError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/tasks/notes/overview`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load notes');
      }

      setNotes(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setNotesError(e?.message || 'Failed to load notes');
    } finally {
      setNotesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showNotesOverview) {
      fetchOverview();
    }
  }, [showNotesOverview, fetchOverview]);

  const formatDateTime = (value: string) => {
    const d = new Date(value);
    return d.toLocaleString();
  };

  const formatDateOnly = (value: string) => {
    const d = new Date(value);
    return d.toLocaleDateString();
  };

  const filteredNotes = useMemo(() => {
    const term = search.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`) : null;

    return notes.filter((n) => {
      const created = new Date(n.created_at);

      if (from && created < from) return false;
      if (to && created > to) return false;

      if (visibilityFilter !== 'any' && n.visibility !== visibilityFilter) {
        return false;
      }

      if (kindFilter !== 'any' && n.kind !== kindFilter) {
        return false;
      }

      if (!term) return true;

      const assigneeNames = (n.assignees || [])
        .map((a) => a.name || a.email || '')
        .join(' ')
        .toLowerCase();

      return (
        n.task_title.toLowerCase().includes(term) ||
        (n.author_name || '').toLowerCase().includes(term) ||
        n.message.toLowerCase().includes(term) ||
        n.kind.toLowerCase().includes(term) ||
        n.visibility.toLowerCase().includes(term) ||
        assigneeNames.includes(term)
      );
    });
  }, [notes, search, fromDate, toDate, visibilityFilter, kindFilter]);

  const formatAssignees = (assignees?: TaskNoteAssignee[]) => {
    if (!assignees || !assignees.length) return 'Unassigned';
    const names = assignees.map((a) => a.name || a.email || 'Unknown');
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]}, ${names[1]}`;
    return `${names[0]}, ${names[1]} +${names.length - 2} more`;
  };

  type NoteGroup = {
    key: string;
    label: string;
    items: TaskNoteOverview[];
  };

  const groupedNotes: NoteGroup[] = useMemo(() => {
    if (!filteredNotes.length) return [];

    if (groupBy === 'none') {
      return [
        {
          key: 'all',
          label: 'All notes',
          items: filteredNotes,
        },
      ];
    }

    const map = new Map<string, NoteGroup>();

    filteredNotes.forEach((n) => {
      let key: string;
      let label: string;

      if (groupBy === 'task') {
        key = n.task_id;
        label = n.task_title || 'Untitled task';
      } else if (groupBy === 'assignee') {
        const first = n.assignees && n.assignees[0];
        if (!first) {
          key = '__unassigned';
          label = 'Unassigned';
        } else {
          key = first.id || first.email || first.name || 'unknown';
          label = first.name || first.email || 'Unknown';
        }
      } else {
        // date
        key = formatDateOnly(n.created_at);
        label = key;
      }

      if (!map.has(key)) {
        map.set(key, { key, label, items: [] });
      }
      map.get(key)!.items.push(n);
    });

    return Array.from(map.values());
  }, [filteredNotes, groupBy]);

  const totalNotes = filteredNotes.length;
  const blockerCount = useMemo(
    () => filteredNotes.filter((n) => n.is_blocker).length,
    [filteredNotes]
  );

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8">
      <Header title="Tasks" />

      {/* View switcher + global notes button */}
      <Card className="p-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 px-2">
            <div className="text-sm text-muted-foreground">
              Switch view
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={view === 'table' ? 'default' : 'outline'}
              onClick={() => setView('table')}
              aria-pressed={view === 'table'}
              className="flex items-center gap-2"
            >
              <TableIcon className="h-4 w-4" />
              Table
            </Button>
            <Button
              type="button"
              variant={view === 'kanban' ? 'default' : 'outline'}
              onClick={() => setView('kanban')}
              aria-pressed={view === 'kanban'}
              className="flex items-center gap-2"
            >
              <LayoutDashboard className="h-4 w-4" />
              Kanban
            </Button>

            {/* 🔵 All notes button – visible to everyone */}
            <Button
              type="button"
              variant="outline"
              className="ml-4 flex items-center gap-2"
              onClick={() => setShowNotesOverview(true)}
            >
              <FileText className="h-4 w-4" />
              All notes
            </Button>
          </div>
        </div>
      </Card>

      {/* Content */}
      <motion.div
        key={view}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {view === 'table' ? (
          <TasksDashboard />
        ) : (
          <Suspense
            fallback={
              <div className="text-sm text-muted-foreground p-6">
                Loading Kanban…
              </div>
            }
          >
            <KanbanBoard />
          </Suspense>
        )}
      </motion.div>

      {/* Global notes overview dialog */}
      <Dialog
        open={showNotesOverview}
        onOpenChange={(open) => {
          if (!open) {
            setShowNotesOverview(false);
            setNotes([]);
            setNotesError(null);
            setSearch('');
            setFromDate('');
            setToDate('');
            setVisibilityFilter('any');
            setKindFilter('any');
            setGroupBy('none');
          } else {
            fetchOverview();
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Task notes overview
            </DialogTitle>
            <DialogDescription>
              You&apos;ll see notes you&apos;re allowed to view. Owners/admins
              will see notes across the company; other users will see notes for
              their own tasks.
            </DialogDescription>
          </DialogHeader>

          {/* Filters + stats */}
          <div className="mt-3 mb-4 space-y-3">
            {/* Top row: search + date range */}
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[180px]">
                <Input
                  placeholder="Search by task, assignee, author, message, visibility..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground">From</div>
                <Input
                  type="date"
                  className="h-8 w-[140px]"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground">To</div>
                <Input
                  type="date"
                  className="h-8 w-[140px]"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>

            {/* Second row: select filters + grouping + stats */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">
                    Visibility
                  </span>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={visibilityFilter}
                    onChange={(e) =>
                      setVisibilityFilter(e.target.value as 'any' | NoteVisibility)
                    }
                  >
                    <option value="any">Any</option>
                    <option value="all">Public (all)</option>
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">
                    Kind
                  </span>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={kindFilter}
                    onChange={(e) =>
                      setKindFilter(e.target.value as 'any' | NoteKind)
                    }
                  >
                    <option value="any">Any</option>
                    <option value="note">Note</option>
                    <option value="progress">Progress</option>
                    <option value="status">Status</option>
                    <option value="system">System</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted-foreground">
                    Group by
                  </span>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={groupBy}
                    onChange={(e) =>
                      setGroupBy(e.target.value as GroupByMode)
                    }
                  >
                    <option value="none">None</option>
                    <option value="task">Task</option>
                    <option value="assignee">Assignee</option>
                    <option value="date">Date</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 text-xs">
                <div className="px-3 py-1 rounded-full bg-muted text-muted-foreground">
                  Total notes: <span className="font-semibold">{totalNotes}</span>
                </div>
                <div className="px-3 py-1 rounded-full bg-red-50 text-red-700">
                  Blockers: <span className="font-semibold">{blockerCount}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="h-[48vh] overflow-y-auto pr-1">
            {notesLoading ? (
              <div className="py-8 text-sm text-muted-foreground text-center">
                Loading notes…
              </div>
            ) : notesError ? (
              <div className="py-4 text-sm text-red-600">
                {notesError}
              </div>
            ) : !groupedNotes.length ? (
              <div className="py-6 text-sm text-muted-foreground text-center">
                No notes found.
              </div>
            ) : (
              <div className="space-y-4">
                {groupedNotes.map((group) => (
                  <div key={group.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-gray-700">
                        {group.label}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {group.items.length} note
                        {group.items.length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {group.items.map((n) => (
                        <div
                          key={n.id}
                          className="border rounded-md px-3 py-2 bg-white"
                        >
                          {/* Top line: task + assignees */}
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-gray-900">
                                {n.task_title}
                              </span>
                              <span className="text-[11px] text-gray-500">
                                Assigned to: {formatAssignees(n.assignees)}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-gray-100 capitalize">
                                {n.kind}
                              </span>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-gray-100">
                                visibility: {n.visibility}
                              </span>
                              {n.is_blocker && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                                  Blocker
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Author + timestamp */}
                          <div className="mb-1 text-[11px] text-gray-500">
                            {n.author_name || 'Unknown'} ·{' '}
                            {formatDateTime(n.created_at)}
                          </div>

                          {/* Message */}
                          <div className="text-sm whitespace-pre-wrap">
                            {n.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tasks;
