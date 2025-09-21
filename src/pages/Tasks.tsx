import React, { useEffect, useState, Suspense, lazy } from 'react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import TasksDashboard from '../components/tasks/TasksDashboard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table as TableIcon, LayoutDashboard } from 'lucide-react';

// Lazy-load Kanban to keep first load light (KanbanBoard is a named export)
const KanbanBoard = lazy(async () => {
  const mod = await import('../components/tasks/KanbanBoard');
  return { default: mod.KanbanBoard };
});

type ViewMode = 'table' | 'kanban';

const Tasks = () => {
  const [view, setView] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('tasks:view') as ViewMode | null;
    return saved === 'kanban' ? 'kanban' : 'table';
  });

  useEffect(() => {
    localStorage.setItem('tasks:view', view);
  }, [view]);

  return (
    <div className="flex-1 space-y-4 p-4 md:p-6 lg:p-8">
      <Header title="Tasks" />

      {/* View switcher */}
      <Card className="p-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground px-2">
            Switch view
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
    </div>
  );
};

export default Tasks;
