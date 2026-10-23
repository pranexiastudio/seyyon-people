import React, { useState } from 'react';
import {
  CheckSquare,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  MoreVertical,
  CheckCircle2,
  Circle,
  MessageSquare,
  ArrowRight,
  X,
} from 'lucide-react';
import { INITIAL_TASKS } from '../services/api';
import { TaskStatus, TaskPriority } from '@seyyon/shared';

export const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeProject, setActiveProject] = useState('ALL');

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    project: 'Seyyon Mobile App v2',
    priority: TaskPriority.MEDIUM,
    assignee: 'Sara Jenkins',
    dueDate: '2026-10-30',
  });

  const columns = [
    { id: TaskStatus.TODO, label: 'To Do', color: 'border-slate-300' },
    { id: TaskStatus.IN_PROGRESS, label: 'In Progress', color: 'border-blue-500' },
    { id: TaskStatus.IN_REVIEW, label: 'In Review', color: 'border-amber-500' },
    { id: TaskStatus.COMPLETED, label: 'Completed', color: 'border-emerald-500' },
  ];

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;

    const newTask = {
      id: `task-${Date.now()}`,
      title: formData.title,
      description: formData.description,
      status: TaskStatus.TODO,
      priority: formData.priority,
      project: formData.project,
      assignee: formData.assignee,
      dueDate: formData.dueDate,
      commentsCount: 0,
    };

    setTasks([...tasks, newTask]);
    setIsCreateModalOpen(false);
    setFormData({
      title: '',
      description: '',
      project: 'Seyyon Mobile App v2',
      priority: TaskPriority.MEDIUM,
      assignee: 'Sara Jenkins',
      dueDate: '2026-10-30',
    });
  };

  const moveTask = (taskId: string, targetStatus: TaskStatus) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: targetStatus } : t))
    );
  };

  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case TaskPriority.URGENT:
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case TaskPriority.HIGH:
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case TaskPriority.MEDIUM:
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Project:</span>
          <select
            value={activeProject}
            onChange={(e) => setActiveProject(e.target.value)}
            className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
          >
            <option value="ALL">All Active Projects</option>
            <option value="Seyyon Mobile App v2">Seyyon Mobile App v2</option>
            <option value="Q3 Financial Compliance">Q3 Financial Compliance</option>
          </select>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-blue-600/20"
        >
          <Plus size={14} />
          <span>New Work Item</span>
        </button>
      </div>

      {/* Kanban Board Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map((col) => {
          const colTasks = tasks.filter(
            (t) =>
              t.status === col.id &&
              (activeProject === 'ALL' || t.project === activeProject)
          );

          return (
            <div
              key={col.id}
              className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 flex flex-col min-h-[500px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full border-2 ${col.color}`} />
                  <h3 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">
                    {col.label}
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-bold">
                  {colTasks.length}
                </span>
              </div>

              {/* Task Cards */}
              <div className="space-y-3 flex-1 overflow-y-auto">
                {colTasks.map((t) => (
                  <div
                    key={t.id}
                    className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md transition-shadow group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold border uppercase tracking-wider ${getPriorityBadge(
                            t.priority
                          )}`}
                        >
                          {t.priority}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">{t.project}</span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 leading-snug group-hover:text-blue-600 transition-colors">
                        {t.title}
                      </h4>
                      {t.description && (
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                          {t.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-600 text-[11px]">
                        <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-700 font-bold text-[9px] flex items-center justify-center">
                          {t.assignee.split(' ').map((n) => n[0]).join('')}
                        </div>
                        <span className="truncate max-w-[90px]">{t.assignee}</span>
                      </div>

                      {/* Transition Action */}
                      <select
                        value={t.status}
                        onChange={(e) => moveTask(t.id, e.target.value as TaskStatus)}
                        className="text-[10px] font-bold bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 focus:outline-none"
                      >
                        <option value={TaskStatus.TODO}>To Do</option>
                        <option value={TaskStatus.IN_PROGRESS}>In Progress</option>
                        <option value={TaskStatus.IN_REVIEW}>In Review</option>
                        <option value={TaskStatus.COMPLETED}>Completed</option>
                      </select>
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && (
                  <div className="text-center py-10 text-slate-400 text-xs italic">
                    No items in this column
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Task Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm">Create Work Item</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Implement Webhook Deduplication"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Project</label>
                <select
                  value={formData.project}
                  onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                >
                  <option value="Seyyon Mobile App v2">Seyyon Mobile App v2</option>
                  <option value="Q3 Financial Compliance">Q3 Financial Compliance</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as TaskPriority })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  >
                    <option value={TaskPriority.LOW}>Low</option>
                    <option value={TaskPriority.MEDIUM}>Medium</option>
                    <option value={TaskPriority.HIGH}>High</option>
                    <option value={TaskPriority.URGENT}>Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Assignee</label>
                  <select
                    value={formData.assignee}
                    onChange={(e) => setFormData({ ...formData, assignee: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  >
                    <option value="Sara Jenkins">Sara Jenkins</option>
                    <option value="Rahul Verma">Rahul Verma</option>
                    <option value="David Chen">David Chen</option>
                    <option value="Priya Sharma">Priya Sharma</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Acceptance criteria and technical details..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
