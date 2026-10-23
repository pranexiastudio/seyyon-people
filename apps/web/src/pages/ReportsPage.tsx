import React, { useState } from 'react';
import { BarChart3, Download, FileSpreadsheet, Users, Clock, CreditCard, CheckCircle2 } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);

  const handleExportCsv = (reportName: string) => {
    setDownloadFeedback(`Generating and downloading verified ${reportName}.csv...`);
    setTimeout(() => {
      // Simulate CSV download
      const csvContent = "data:text/csv;charset=utf-8,EmployeeCode,Name,Department,Designation,Status\nEMP-001,Alex Morgan,Engineering,VP Eng,ACTIVE\nEMP-002,Priya Sharma,People HR,HR Director,ACTIVE\nEMP-003,David Chen,Engineering,Lead Arch,ACTIVE\nEMP-004,Sara Jenkins,Engineering,Sr Dev,ACTIVE\nEMP-005,Rahul Verma,Product,Sr Designer,ACTIVE";
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${reportName}_october_2026.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloadFeedback(`✅ ${reportName}.csv downloaded successfully.`);
      setTimeout(() => setDownloadFeedback(null), 3500);
    }, 800);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Workforce Intelligence & Statutory Reporting</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time analytics for headcount, attendance, statutory deductions, and payroll registers.
          </p>
        </div>
      </div>

      {downloadFeedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold rounded-xl animate-in fade-in">
          {downloadFeedback}
        </div>
      )}

      {/* Reports Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Headcount Report */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600 w-fit mb-3">
              <Users size={20} />
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm">Headcount & Attrition Register</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Complete department-wise active employee directory, joining dates, designations, and managers.
            </p>
          </div>
          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Format: CSV / XLSX</span>
            <button
              onClick={() => handleExportCsv('Headcount_Directory')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Monthly Attendance & LOP Report */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 w-fit mb-3">
              <Clock size={20} />
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm">Monthly Attendance & LOP Summary</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Punctuality metrics, late arrivals, half-days, approved leaves, and loss of pay calculations.
            </p>
          </div>
          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Period: Oct 2026</span>
            <button
              onClick={() => handleExportCsv('Attendance_Monthly_Summary')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold transition-colors"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Statutory Payroll & PF ECR Report */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <div className="p-3 rounded-xl bg-purple-50 text-purple-600 w-fit mb-3">
              <CreditCard size={20} />
            </div>
            <h3 className="font-extrabold text-slate-900 text-sm">Statutory PF & Payroll Register</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Gross wages, EPF Employee/Employer contributions, ESI, Professional Tax, and Income Tax TDS.
            </p>
          </div>
          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Compliance: India</span>
            <button
              onClick={() => handleExportCsv('Statutory_Payroll_Register')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-lg text-xs font-bold transition-colors"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
