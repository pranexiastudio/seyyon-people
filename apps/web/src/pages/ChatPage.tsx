import React, { useState } from 'react';
import {
  MessageSquare,
  Hash,
  Send,
  Paperclip,
  Smile,
  Users,
  Search,
  Plus,
} from 'lucide-react';
import { INITIAL_CHAT_CHANNELS } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const ChatPage: React.FC = () => {
  const { user } = useAuth();
  const [channels, setChannels] = useState(INITIAL_CHAT_CHANNELS);
  const [activeChannel, setActiveChannel] = useState(INITIAL_CHAT_CHANNELS[0]);
  const [messages, setMessages] = useState([
    {
      id: 'm1',
      sender: 'Alex Morgan',
      senderRole: 'Company Admin',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      time: '09:00 AM',
      content:
        'Welcome to Seyyon People! Our all-in-one HRMS and workforce portal is now live across all departments. 🎉',
    },
    {
      id: 'm2',
      sender: 'David Chen',
      senderRole: 'Manager',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      time: '09:12 AM',
      content:
        'Engineering teams are already synced up with the new Task boards and attendance tracking. Great rollout!',
    },
    {
      id: 'm3',
      sender: 'Priya Sharma',
      senderRole: 'HR Admin',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
      time: '09:30 AM',
      content:
        'October payroll review has been generated with Indian statutory components (PF, ESI, PT, TDS). Let me know if any employee needs an attendance correction.',
    },
  ]);
  const [inputText, setInputText] = useState('');

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMsg = {
      id: `m-${Date.now()}`,
      sender: `${user?.firstName} ${user?.lastName}`,
      senderRole: user?.role?.replace(/_/g, ' ') || 'Member',
      avatar: user?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: inputText.trim(),
    };

    setMessages([...messages, newMsg]);
    setInputText('');
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex h-[calc(100vh-180px)] overflow-hidden">
      {/* Channels Sidebar */}
      <div className="w-64 border-r border-slate-200 bg-slate-50/70 flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
            Workplace Channels
          </span>
          <button className="text-slate-400 hover:text-blue-600 p-1">
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {channels.map((ch) => {
            const isActive = activeChannel.id === ch.id;
            return (
              <button
                key={ch.id}
                onClick={() => setActiveChannel(ch)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm font-bold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Hash size={15} className={isActive ? 'text-white' : 'text-slate-400'} />
                  <span className="truncate">{ch.name}</span>
                </div>
                {ch.unread > 0 && !isActive && (
                  <span className="px-1.5 py-0.2 rounded-full bg-cyan-500 text-white text-[10px] font-bold">
                    {ch.unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-slate-200 bg-white text-xs text-slate-500 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Real-time presence active</span>
        </div>
      </div>

      {/* Message Area */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Header */}
        <div className="h-14 px-6 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash size={18} className="text-blue-600" />
            <h3 className="font-extrabold text-slate-900 text-sm">{activeChannel.name}</h3>
            <span className="text-xs text-slate-400 ml-2">5 Members online</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <Users size={15} />
            <span>Acme Tech</span>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {messages.map((m) => (
            <div key={m.id} className="flex items-start gap-3.5 group">
              <img
                src={m.avatar}
                alt={m.sender}
                className="h-9 w-9 rounded-full object-cover shrink-0 ring-2 ring-slate-100 mt-0.5"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-xs">{m.sender}</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                    {m.senderRole}
                  </span>
                  <span className="text-[10px] text-slate-400">{m.time}</span>
                </div>
                <p className="text-xs text-slate-700 mt-1 leading-relaxed bg-slate-50/80 p-3 rounded-2xl rounded-tl-xs border border-slate-100 inline-block max-w-xl">
                  {m.content}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Message Input Box */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50">
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Message #${activeChannel.name}...`}
              className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-xs"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/20 flex items-center gap-1.5"
            >
              <Send size={14} />
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
