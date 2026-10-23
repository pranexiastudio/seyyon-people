import React from 'react';
import { X, Bell, Check, Clock, Calendar, Award } from 'lucide-react';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const notifications = [
    {
      id: 'notif-1',
      title: 'Leave Request Pending Approval',
      message: 'Sara Jenkins submitted a Casual Leave request for Oct 20 - Oct 21.',
      time: '10 mins ago',
      icon: Calendar,
      type: 'leave',
      unread: true,
    },
    {
      id: 'notif-2',
      title: 'Task Assigned',
      message: 'David Chen assigned you to "Implement FaceID & Biometric Authentication Flow".',
      time: '2 hours ago',
      icon: Check,
      type: 'task',
      unread: true,
    },
    {
      id: 'notif-3',
      title: 'October Payroll Review Ready',
      message: 'Draft payroll calculations for 5 active employees are ready for review.',
      time: 'Yesterday',
      icon: Award,
      type: 'payroll',
      unread: false,
    },
    {
      id: 'notif-4',
      title: 'Biometric Log Synced',
      message: '14 biometric punch records successfully imported from Main Lobby Terminal.',
      time: '2 days ago',
      icon: Clock,
      type: 'attendance',
      unread: false,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell size={18} className="text-blue-600" />
              <h3 className="font-bold text-slate-900 text-sm">Notifications & Reminders</h3>
              <span className="bg-blue-100 text-blue-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                2 new
              </span>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg">
              <X size={18} />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {notifications.map((n) => {
              const Icon = n.icon;
              return (
                <div
                  key={n.id}
                  className={`p-4 flex items-start gap-3.5 transition-colors hover:bg-slate-50 ${
                    n.unread ? 'bg-blue-50/40' : ''
                  }`}
                >
                  <div className="p-2 rounded-xl bg-blue-100 text-blue-700 shrink-0">
                    <Icon size={16} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                    <span className="text-[10px] text-slate-400 mt-1 block">{n.time}</span>
                  </div>
                  {n.unread && <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0 mt-1.5" />}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-slate-100 bg-slate-50 text-center">
            <button className="text-xs font-semibold text-blue-600 hover:text-blue-800">
              Mark all as read
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
