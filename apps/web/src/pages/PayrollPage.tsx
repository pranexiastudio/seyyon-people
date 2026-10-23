import React, { useState } from 'react';
import {
  CreditCard,
  FileText,
  CheckCircle2,
  Lock,
  Download,
  Printer,
  ShieldCheck,
  Building2,
  RefreshCw,
  X,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole, PayrollStatus } from '@seyyon/shared';

export const PayrollPage: React.FC = () => {
  const { user } = useAuth();
  const isHrOrAdmin = [UserRole.COMPANY_ADMIN, UserRole.HR_ADMIN].includes(user?.role as UserRole);

  const [activeCycle, setActiveCycle] = useState<any>({
    month: 10,
    year: 2026,
    status: PayrollStatus.REVIEW,
    totalGross: 485000,
    totalDeductions: 58200,
    totalNet: 426800,
    employeesCount: 5,
  });

  const [selectedPayslip, setSelectedPayslip] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const mockPayslips = [
    {
      id: 'pay-1',
      employee: 'Sara Jenkins',
      code: 'EMP-004',
      designation: 'Senior Full Stack Engineer',
      department: 'Engineering & Technology',
      bankAccount: '•••• •••• 5678 (KKBK0001122)',
      workingDays: 31,
      lopDays: 0,
      basic: 45000,
      hra: 22500,
      da: 0,
      special: 15750,
      conveyance: 3000,
      gross: 86250,
      pf: 1800,
      esi: 0,
      pt: 208,
      tds: 3200,
      deductions: 5208,
      net: 81042,
      netInWords: 'Rupees Eighty-One Thousand Forty-Two Only',
      status: 'REVIEW',
    },
    {
      id: 'pay-2',
      employee: 'David Chen',
      code: 'EMP-003',
      designation: 'Technical Lead & Architect',
      department: 'Engineering & Technology',
      bankAccount: '•••• •••• 3456 (SBIN0007890)',
      workingDays: 31,
      lopDays: 0,
      basic: 75000,
      hra: 37500,
      da: 0,
      special: 26250,
      conveyance: 3000,
      gross: 141750,
      pf: 1800,
      esi: 0,
      pt: 208,
      tds: 8500,
      deductions: 10508,
      net: 131242,
      netInWords: 'Rupees One Lakh Thirty-One Thousand Two Hundred Forty-Two Only',
      status: 'REVIEW',
    },
    {
      id: 'pay-3',
      employee: 'Priya Sharma',
      code: 'EMP-002',
      designation: 'Director of People Ops',
      department: 'People Operations & HR',
      bankAccount: '•••• •••• 9012 (ICIC0000456)',
      workingDays: 31,
      lopDays: 0,
      basic: 75000,
      hra: 37500,
      da: 0,
      special: 26250,
      conveyance: 3000,
      gross: 141750,
      pf: 1800,
      esi: 0,
      pt: 208,
      tds: 8500,
      deductions: 10508,
      net: 131242,
      netInWords: 'Rupees One Lakh Thirty-One Thousand Two Hundred Forty-Two Only',
      status: 'REVIEW',
    },
    {
      id: 'pay-4',
      employee: 'Rahul Verma',
      code: 'EMP-005',
      designation: 'Senior Product Designer',
      department: 'Product & Design',
      bankAccount: '•••• •••• 7890 (AXIS0003344)',
      workingDays: 31,
      lopDays: 0,
      basic: 45000,
      hra: 22500,
      da: 0,
      special: 15750,
      conveyance: 3000,
      gross: 86250,
      pf: 1800,
      esi: 0,
      pt: 208,
      tds: 3200,
      deductions: 5208,
      net: 81042,
      netInWords: 'Rupees Eighty-One Thousand Forty-Two Only',
      status: 'REVIEW',
    },
  ];

  const handleRunPayroll = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setSuccessNotice('✅ October 2026 payroll calculation executed successfully with Indian statutory rules.');
      setTimeout(() => setSuccessNotice(null), 4000);
    }, 1200);
  };

  const handleFinalize = () => {
    setActiveCycle({ ...activeCycle, status: PayrollStatus.FINALIZED });
    setSuccessNotice('🔒 October 2026 payroll finalized, locked against changes, and payslips released to employees.');
    setTimeout(() => setSuccessNotice(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Cycle Status Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold text-slate-900">October 2026 Payroll Cycle</h2>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                activeCycle.status === PayrollStatus.FINALIZED
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {activeCycle.status}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Indian Statutory Compliance Active (EPF 12% capped at ₹1,800, PT Slab ₹208, TDS Deductions).
          </p>
        </div>

        {isHrOrAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunPayroll}
              disabled={isProcessing || activeCycle.status === PayrollStatus.FINALIZED}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg text-xs font-bold transition-all shadow-xs"
            >
              <RefreshCw size={14} className={isProcessing ? 'animate-spin text-blue-600' : ''} />
              <span>{isProcessing ? 'Recalculating...' : 'Recalculate Run'}</span>
            </button>
            {activeCycle.status !== PayrollStatus.FINALIZED ? (
              <button
                onClick={handleFinalize}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-600/20"
              >
                <Lock size={14} />
                <span>Approve & Finalize</span>
              </button>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                <CheckCircle2 size={14} /> Finalized & Locked
              </span>
            )}
          </div>
        )}
      </div>

      {successNotice && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold rounded-xl animate-in fade-in">
          {successNotice}
        </div>
      )}

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gross Monthly Earnings</span>
          <p className="text-2xl font-extrabold text-slate-900 mt-2">₹4,85,000.00</p>
          <span className="text-[11px] text-slate-400 mt-1 block">5 Active salaried staff</span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Statutory Deductions</span>
          <p className="text-2xl font-extrabold text-rose-600 mt-2">₹58,200.00</p>
          <span className="text-[11px] text-slate-400 mt-1 block">EPF: ₹7,200 • PT: ₹832 • TDS: ₹50,168</span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Net Disbursal</span>
          <p className="text-2xl font-extrabold text-emerald-600 mt-2">₹4,26,800.00</p>
          <span className="text-[11px] text-slate-400 mt-1 block">Direct Bank Transfer (NEFT/RTGS)</span>
        </div>
      </div>

      {/* Payroll Register Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Monthly Payroll Register & Payslips</h3>
            <p className="text-xs text-slate-400">Click any employee row to inspect printable payslip</p>
          </div>
          <span className="text-xs text-slate-500 font-mono">Currency: INR (₹)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200/80 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                <th className="py-3.5 px-6">Employee</th>
                <th className="py-3.5 px-4">Basic Pay</th>
                <th className="py-3.5 px-4">HRA</th>
                <th className="py-3.5 px-4">Gross Earnings</th>
                <th className="py-3.5 px-4">PF Deduct</th>
                <th className="py-3.5 px-4">TDS Tax</th>
                <th className="py-3.5 px-4 font-bold text-slate-900">Net Pay</th>
                <th className="py-3.5 px-6 text-right">Payslip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mockPayslips.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  onClick={() => setSelectedPayslip(p)}
                >
                  <td className="py-3.5 px-6">
                    <p className="font-bold text-slate-900">{p.employee}</p>
                    <p className="text-[11px] text-slate-400">{p.code} • {p.designation}</p>
                  </td>
                  <td className="py-3.5 px-4 font-mono">₹{p.basic.toLocaleString()}</td>
                  <td className="py-3.5 px-4 font-mono">₹{p.hra.toLocaleString()}</td>
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-800">₹{p.gross.toLocaleString()}</td>
                  <td className="py-3.5 px-4 font-mono text-rose-600">₹{p.pf.toLocaleString()}</td>
                  <td className="py-3.5 px-4 font-mono text-rose-600">₹{p.tds.toLocaleString()}</td>
                  <td className="py-3.5 px-4 font-mono font-black text-emerald-600 text-sm">
                    ₹{p.net.toLocaleString()}
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPayslip(p);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-xs rounded-md"
                    >
                      <FileText size={13} />
                      View Payslip
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Printable Payslip Modal */}
      {selectedPayslip && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-8 shadow-2xl border border-slate-200 animate-in fade-in my-6">
            {/* Modal Actions */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 print:hidden">
              <span className="text-xs font-bold text-slate-500 uppercase">Official Salary Slip Preview</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
                >
                  <Printer size={13} />
                  Print / PDF
                </button>
                <button
                  onClick={() => setSelectedPayslip(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Official Payslip Container */}
            <div className="pt-4 text-xs font-sans">
              {/* Header */}
              <div className="text-center pb-4 border-b-2 border-slate-800">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">ACME TECHNOLOGIES PVT LTD</h2>
                <p className="text-[11px] text-slate-500">
                  Prestige Tech Cloud, 4th Floor, Whitefield, Bengaluru, Karnataka 560066
                </p>
                <p className="text-xs font-bold text-blue-700 mt-2 uppercase tracking-wider">
                  Payslip for the month of October 2026
                </p>
              </div>

              {/* Employee & Bank Meta Grid */}
              <div className="grid grid-cols-2 gap-4 py-4 border-b border-slate-200">
                <div className="space-y-1">
                  <p><span className="text-slate-400">Employee Name:</span> <strong className="text-slate-800">{selectedPayslip.employee}</strong></p>
                  <p><span className="text-slate-400">Employee Code:</span> <strong className="text-slate-800">{selectedPayslip.code}</strong></p>
                  <p><span className="text-slate-400">Designation:</span> <strong className="text-slate-800">{selectedPayslip.designation}</strong></p>
                  <p><span className="text-slate-400">Department:</span> <strong className="text-slate-800">{selectedPayslip.department}</strong></p>
                </div>
                <div className="space-y-1">
                  <p><span className="text-slate-400">Bank Details:</span> <strong className="text-slate-800">{selectedPayslip.bankAccount}</strong></p>
                  <p><span className="text-slate-400">Total Working Days:</span> <strong className="text-slate-800">{selectedPayslip.workingDays}</strong></p>
                  <p><span className="text-slate-400">Loss of Pay Days:</span> <strong className="text-slate-800">{selectedPayslip.lopDays}</strong></p>
                  <p><span className="text-slate-400">Payment Status:</span> <strong className="text-emerald-600 font-bold">VERIFIED</strong></p>
                </div>
              </div>

              {/* Earnings & Deductions Breakdown */}
              <div className="grid grid-cols-2 gap-4 py-4 border-b border-slate-200">
                {/* Earnings */}
                <div>
                  <h4 className="font-bold text-slate-900 uppercase text-[11px] mb-2 pb-1 border-b border-slate-200">
                    Earnings
                  </h4>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Basic Salary:</span>
                      <span className="font-mono font-medium">₹{selectedPayslip.basic.toLocaleString()}.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">House Rent Allowance (HRA):</span>
                      <span className="font-mono font-medium">₹{selectedPayslip.hra.toLocaleString()}.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Special Allowance:</span>
                      <span className="font-mono font-medium">₹{selectedPayslip.special.toLocaleString()}.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Conveyance Allowance:</span>
                      <span className="font-mono font-medium">₹{selectedPayslip.conveyance.toLocaleString()}.00</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-slate-900">
                      <span>Gross Earnings:</span>
                      <span className="font-mono">₹{selectedPayslip.gross.toLocaleString()}.00</span>
                    </div>
                  </div>
                </div>

                {/* Deductions */}
                <div>
                  <h4 className="font-bold text-slate-900 uppercase text-[11px] mb-2 pb-1 border-b border-slate-200">
                    Deductions
                  </h4>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Employees' PF (12%):</span>
                      <span className="font-mono font-medium">₹{selectedPayslip.pf.toLocaleString()}.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">ESI (0.75%):</span>
                      <span className="font-mono font-medium">₹{selectedPayslip.esi.toLocaleString()}.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Professional Tax (PT):</span>
                      <span className="font-mono font-medium">₹{selectedPayslip.pt.toLocaleString()}.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Income Tax (TDS):</span>
                      <span className="font-mono font-medium">₹{selectedPayslip.tds.toLocaleString()}.00</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-rose-700">
                      <span>Total Deductions:</span>
                      <span className="font-mono">₹{selectedPayslip.deductions.toLocaleString()}.00</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Net Pay & Words */}
              <div className="p-4 bg-slate-50 rounded-xl my-4 flex items-center justify-between border border-slate-200">
                <div>
                  <span className="text-xs uppercase font-bold text-slate-500">Net Take-Home Salary</span>
                  <p className="text-[11px] text-slate-500 italic mt-0.5">{selectedPayslip.netInWords}</p>
                </div>
                <span className="text-2xl font-black text-emerald-600 font-mono">
                  ₹{selectedPayslip.net.toLocaleString()}.00
                </span>
              </div>

              <p className="text-center text-[10px] text-slate-400 mt-6 pt-4 border-t border-slate-100">
                This is a computer-generated document authorized by Seyyon People HRMS SaaS. No signature is required.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
