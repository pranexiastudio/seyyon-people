import React, { useState } from 'react';
import { Award, Star, CheckCircle2, TrendingUp, UserCheck, MessageSquare } from 'lucide-react';

export const PerformancePage: React.FC = () => {
  const [reviews, setReviews] = useState([
    {
      id: 'rev-1',
      employee: 'Sara Jenkins',
      role: 'Senior Full Stack Engineer',
      cycle: 'H2 2026 Engineering Review',
      selfRating: 4.5,
      managerRating: 4.8,
      status: 'COMPLETED',
      feedback:
        'Outstanding technical leadership on the biometric deduplication gateway and mobile token migration.',
    },
    {
      id: 'rev-2',
      employee: 'Rahul Verma',
      role: 'Senior Product Designer',
      cycle: 'H2 2026 Engineering Review',
      selfRating: 4.2,
      managerRating: 4.5,
      status: 'IN_REVIEW',
      feedback: 'Excellent work on the WCAG AA contrast audit and responsive design system.',
    },
  ]);

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full">
            Active Appraisal Cycle
          </span>
          <h2 className="text-lg font-extrabold text-slate-900 mt-2">H2 2026 Performance & OKRs Cycle</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Peer feedback, self-evaluations, and manager appraisal pipelines with privacy controls.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-2xl font-black text-slate-900">4.65</span>
            <span className="text-xs text-slate-400 block font-medium">Org Avg Rating</span>
          </div>
          <div className="p-3 rounded-xl bg-purple-100 text-purple-700">
            <Award size={24} />
          </div>
        </div>
      </div>

      {/* Review Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reviews.map((r) => (
          <div
            key={r.id}
            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">{r.employee}</h3>
                  <p className="text-xs text-slate-500">{r.role}</p>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    r.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {r.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 my-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Self Rating</span>
                  <div className="flex items-center justify-center gap-1 mt-1 text-amber-500 font-bold text-sm">
                    <Star size={14} className="fill-amber-400 text-amber-400" />
                    <span>{r.selfRating} / 5.0</span>
                  </div>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Manager Rating</span>
                  <div className="flex items-center justify-center gap-1 mt-1 text-emerald-600 font-bold text-sm">
                    <Star size={14} className="fill-emerald-500 text-emerald-500" />
                    <span>{r.managerRating} / 5.0</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-600 italic bg-blue-50/50 p-3 rounded-lg border border-blue-100/60">
                "{r.feedback}"
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-400">{r.cycle}</span>
              <button className="text-blue-600 hover:text-blue-800 font-bold">
                View Full Scorecard
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
