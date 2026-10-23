import React, { useState, useEffect } from 'react';
import {
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Cpu,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  FileCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AttendanceStatus } from '@seyyon/shared';

const MOCK_TIMESHEET = [
  { date: '2026-10-15 (Today)', checkIn: '08:58 AM', checkOut: '--:--', hours: '8.2h', late: 0, status: AttendanceStatus.PRESENT, source: 'Biometric Terminal' },
  { date: '2026-10-14', checkIn: '09:02 AM', checkOut: '06:15 PM', hours: '9.2h', late: 0, status: AttendanceStatus.PRESENT, source: 'Web Portal' },
  { date: '2026-10-13', checkIn: '09:25 AM', checkOut: '06:00 PM', hours: '8.5h', late: 25, status: AttendanceStatus.LATE, source: 'Biometric Terminal' },
  { date: '2026-10-12', checkIn: '08:55 AM', checkOut: '05:30 PM', hours: '8.5h', late: 0, status: AttendanceStatus.PRESENT, source: 'Mobile App' },
  { date: '2026-10-11', checkIn: '--:--', checkOut: '--:--', hours: '0.0h', late: 0, status: AttendanceStatus.WEEK_OFF, source: 'Schedule' },
];

export const AttendancePage: React.FC = () => {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());
  const [clockedIn, setClockedIn] = useState(true);
  const [biometricLogs, setBiometricLogs] = useState<any[]>([]);
  const [importSummary, setImportSummary] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSimulateBiometricSync = () => {
    setIsProcessing(true);
    setImportSummary(null);

    setTimeout(() => {
      setIsProcessing(false);
      setImportSummary({
        totalReceived: 18,
        successfulPunches: 16,
        duplicatesDebounced: 2,
        unrecognizedEmployees: 0,
        status: 'COMPLETE',
      });
      setBiometricLogs([
        { time: '09:00:12 AM', code: 'EMP-001', device: 'LOBBY_BIO_01', type: 'IN', status: 'MATCHED' },
        { time: '09:02:44 AM', code: 'EMP-002', device: 'LOBBY_BIO_01', type: 'IN', status: 'MATCHED' },
        { time: '09:02:49 AM', code: 'EMP-002', device: 'LOBBY_BIO_01', type: 'IN', status: 'DUPE_DEBOUNCED' },
        { time: '09:25:10 AM', code: 'EMP-003', device: 'FLOOR_2_TERM', type: 'IN', status: 'LATE_FLAGGED' },
        { time: '08:58:30 AM', code: 'EMP-004', device: 'LOBBY_BIO_01', type: 'IN', status: 'MATCHED' },
      ]);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      {/* Real-Time Punch Widget & Policy Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Punch Card */}
        <div className="bg-gradient-to-br from-navy-900 via-blue-950 to-slate-900 text-white p-6 rounded-2xl shadow-xl border border-blue-900/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-bold text-cyan-400">
                Live Attendance Console
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                Shift: 09:00 - 18:00 IST
              </span>
            </div>

            <div className="my-6 text-center">
              <span className="font-mono text-4xl md:text-5xl font-black text-white tracking-tight">
                {currentTime}
              </span>
              <p className="text-xs text-slate-400 mt-1">Grace Period: 15 mins (Late after 09:15 AM)</p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Status for Today:</p>
              <p className="text-sm font-bold text-emerald-400">
                {clockedIn ? 'Clocked In at 08:58 AM' : 'Clocked Out'}
              </p>
            </div>
            <button
              onClick={() => setClockedIn(!clockedIn)}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg ${
                clockedIn
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'
              }`}
            >
              {clockedIn ? 'Punch Out' : 'Punch In'}
            </button>
          </div>
        </div>

        {/* Biometric Integration Architecture Summary */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu size={18} className="text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">Biometric Device Event Ingestion</h3>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
                Vendor-Agnostic Adapter
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Seyyon People ingests raw event streams from fingerprint scanners, facial terminals, and RFID readers without storing biometric templates in the cloud. Events are debounced (2-minute window) and matched against tenant employee codes with automated late detection.
            </p>

            {importSummary && (
              <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-4 gap-3 text-center">
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Received</span>
                  <span className="text-sm font-bold text-slate-800">{importSummary.totalReceived}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Successful</span>
                  <span className="text-sm font-bold text-emerald-600">{importSummary.successfulPunches}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Debounced</span>
                  <span className="text-sm font-bold text-amber-600">{importSummary.duplicatesDebounced}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-medium">Errors</span>
                  <span className="text-sm font-bold text-slate-800">0</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Terminal: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">LOBBY_BIO_01 (192.168.1.105)</code>
            </span>
            <button
              onClick={handleSimulateBiometricSync}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
            >
              <RefreshCw size={13} className={isProcessing ? 'animate-spin' : ''} />
              <span>{isProcessing ? 'Syncing...' : 'Simulate Biometric Sync'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Monthly Attendance Timesheet */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Monthly Timesheet & Punch History</h3>
            <p className="text-xs text-slate-400">Punches logged for current payroll period</p>
          </div>
          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
            October 2026
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200/80 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                <th className="py-3.5 px-6">Date</th>
                <th className="py-3.5 px-4">Punch In</th>
                <th className="py-3.5 px-4">Punch Out</th>
                <th className="py-3.5 px-4">Work Hours</th>
                <th className="py-3.5 px-4">Punctuality</th>
                <th className="py-3.5 px-4">Source Device</th>
                <th className="py-3.5 px-6 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_TIMESHEET.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-6 font-semibold text-slate-800">{row.date}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-700">{row.checkIn}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-700">{row.checkOut}</td>
                  <td className="py-3.5 px-4 font-bold text-slate-800">{row.hours}</td>
                  <td className="py-3.5 px-4">
                    {row.late > 0 ? (
                      <span className="text-amber-700 font-semibold">{row.late}m Late</span>
                    ) : (
                      <span className="text-emerald-700 font-medium">On Time</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500">{row.source}</td>
                  <td className="py-3.5 px-6 text-right">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        row.status === AttendanceStatus.PRESENT
                          ? 'bg-emerald-100 text-emerald-800'
                          : row.status === AttendanceStatus.LATE
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
