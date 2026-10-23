import React, { useState } from 'react';
import { Video, Plus, Calendar, Clock, MapPin, Users, ExternalLink, X } from 'lucide-react';
import { INITIAL_MEETINGS } from '../services/api';

export const MeetingsPage: React.FC = () => {
  const [meetings, setMeetings] = useState(INITIAL_MEETINGS);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    time: 'Tomorrow, 02:00 PM - 03:00 PM',
    location: 'Google Meet',
    link: 'https://meet.google.com/sey-demo-meet',
    organizer: 'Alex Morgan',
  });

  const handleSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;

    const newMeeting = {
      id: `meet-${Date.now()}`,
      title: formData.title,
      time: formData.time,
      location: formData.location,
      link: formData.link,
      organizer: formData.organizer,
      status: 'SCHEDULED',
      attendees: ['Alex Morgan', 'David Chen', 'Sara Jenkins'],
    };

    setMeetings([...meetings, newMeeting]);
    setIsScheduleModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Team Calendar & Video Conferencing</h2>
          <p className="text-xs text-slate-400">Integrated meetings with automated conflict detection</p>
        </div>
        <button
          onClick={() => setIsScheduleModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-blue-600/20"
        >
          <Plus size={14} />
          <span>Schedule Meeting</span>
        </button>
      </div>

      {/* Meetings List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {meetings.map((m) => (
          <div key={m.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {m.status}
                  </span>
                  <h3 className="font-extrabold text-slate-900 text-base mt-2">{m.title}</h3>
                </div>
                <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
                  <Video size={18} />
                </div>
              </div>

              <div className="mt-4 space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-slate-400" />
                  <span>{m.time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-slate-400" />
                  <span>{m.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-slate-400" />
                  <span>{m.attendees.join(', ')}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Host: {m.organizer}</span>
              <a
                href={m.link}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
              >
                <span>Join Meeting</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Schedule Modal */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm">Schedule New Meeting</h3>
              <button onClick={() => setIsScheduleModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSchedule} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Q4 Product Roadmap & Goals"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Time & Duration</label>
                <input
                  type="text"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Create & Send Invites
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
