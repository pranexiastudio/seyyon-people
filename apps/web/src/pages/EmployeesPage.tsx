import React, { useState } from 'react';
import {
  Users,
  Search,
  Filter,
  UserPlus,
  Download,
  Upload,
  MoreVertical,
  Mail,
  Phone,
  ShieldAlert,
  CheckCircle2,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { INITIAL_EMPLOYEES } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { UserRole, EmploymentType, EmployeeStatus } from '@seyyon/shared';

export const EmployeesPage: React.FC = () => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState(INITIAL_EMPLOYEES);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);

  // New Employee Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    department: 'Engineering & Technology',
    designation: 'Software Engineer',
    manager: 'David Chen',
    employmentType: EmploymentType.FULL_TIME,
    dateOfJoining: '2026-10-15',
    panNumber: '',
    bankAccount: '',
  });

  const [importStatus, setImportStatus] = useState<string | null>(null);

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.firstName.toLowerCase().includes(search.toLowerCase()) ||
      emp.lastName.toLowerCase().includes(search.toLowerCase()) ||
      emp.email.toLowerCase().includes(search.toLowerCase()) ||
      emp.employeeCode.toLowerCase().includes(search.toLowerCase());

    const matchesDept = selectedDept === 'ALL' || emp.department.includes(selectedDept);
    return matchesSearch && matchesDept;
  });

  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.email) return;

    const newCode = `EMP-${String(employees.length + 1).padStart(3, '0')}`;
    const newEmp = {
      id: `emp-${Date.now()}`,
      employeeCode: newCode,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone || '+91 98000 00000',
      department: formData.department,
      designation: formData.designation,
      manager: formData.manager,
      employmentType: formData.employmentType,
      status: EmployeeStatus.ACTIVE,
      dateOfJoining: formData.dateOfJoining,
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    };

    setEmployees([...employees, newEmp]);
    setIsAddModalOpen(false);
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      department: 'Engineering & Technology',
      designation: 'Software Engineer',
      manager: 'David Chen',
      employmentType: EmploymentType.FULL_TIME,
      dateOfJoining: '2026-10-15',
      panNumber: '',
      bankAccount: '',
    });
  };

  const handleSimulateCsvImport = () => {
    setImportStatus('Validating CSV rows & checking duplicates...');
    setTimeout(() => {
      setImportStatus('✅ 2 new employees successfully validated and imported into Acme Technologies.');
      const imported = [
        {
          id: `emp-imp-1`,
          employeeCode: `EMP-006`,
          firstName: 'Ananya',
          lastName: 'Iyer',
          email: 'ananya.iyer@acmetech.com',
          phone: '+91 98450 11223',
          department: 'Product & Design',
          designation: 'UX Researcher',
          manager: 'David Chen',
          employmentType: EmploymentType.FULL_TIME,
          status: EmployeeStatus.ACTIVE,
          dateOfJoining: '2026-10-15',
          avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
        },
        {
          id: `emp-imp-2`,
          employeeCode: `EMP-007`,
          firstName: 'Karthik',
          lastName: 'Rao',
          email: 'karthik.rao@acmetech.com',
          phone: '+91 98450 99887',
          department: 'Engineering & Technology',
          designation: 'DevOps Engineer',
          manager: 'Alex Morgan',
          employmentType: EmploymentType.FULL_TIME,
          status: EmployeeStatus.ACTIVE,
          dateOfJoining: '2026-10-15',
          avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150',
        },
      ];
      setEmployees((prev) => [...prev, ...imported]);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-1 items-center gap-3 max-w-md">
          <div className="relative w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, code, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Departments</option>
            <option value="Engineering">Engineering</option>
            <option value="People">People / HR</option>
            <option value="Product">Product & Design</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-all shadow-xs"
          >
            <Upload size={14} className="text-slate-500" />
            <span>Import CSV</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all shadow-md shadow-blue-600/20"
          >
            <UserPlus size={14} />
            <span>Add Employee</span>
          </button>
        </div>
      </div>

      {/* Employees Directory Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-900 text-sm">Active Staff Directory</h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700">
              {filteredEmployees.length} Members
            </span>
          </div>
          <span className="text-xs text-slate-400">Plan Seat Limit: 150 Seats</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200/80 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                <th className="py-3.5 px-6">Employee</th>
                <th className="py-3.5 px-4">Code</th>
                <th className="py-3.5 px-4">Department & Role</th>
                <th className="py-3.5 px-4">Reporting Manager</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredEmployees.map((emp) => (
                <tr
                  key={emp.id}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  onClick={() => setSelectedEmployee(emp)}
                >
                  <td className="py-3.5 px-6 flex items-center gap-3">
                    <img
                      src={emp.avatarUrl}
                      alt={emp.firstName}
                      className="h-9 w-9 rounded-full object-cover ring-2 ring-slate-100 group-hover:ring-blue-400 transition-all"
                    />
                    <div>
                      <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {emp.firstName} {emp.lastName}
                      </p>
                      <p className="text-[11px] text-slate-400">{emp.email}</p>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-slate-600">
                    {emp.employeeCode}
                  </td>
                  <td className="py-3.5 px-4">
                    <p className="font-medium text-slate-800">{emp.designation}</p>
                    <p className="text-[11px] text-slate-400">{emp.department}</p>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    {emp.manager || <span className="text-slate-400 italic">Direct to CEO</span>}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      ACTIVE
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEmployee(emp);
                      }}
                      className="px-2.5 py-1 rounded bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 font-semibold text-xs transition-colors"
                    >
                      View Profile
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Employee Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base">Onboard New Employee</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddEmployee} className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="e.g. Arun"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    placeholder="e.g. Kumar"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Work Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="arun.kumar@acmetech.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Department</label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none"
                  >
                    <option value="Engineering & Technology">Engineering & Tech</option>
                    <option value="People Operations & HR">People Ops & HR</option>
                    <option value="Product & Design">Product & Design</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Designation</label>
                  <input
                    type="text"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none"
                    placeholder="e.g. Frontend Engineer"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md shadow-blue-600/20"
                >
                  Save & Send Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm">Bulk Employee CSV Ingestion</h3>
              <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <p className="text-xs text-slate-500">
                Upload a standardized CSV file with headers: <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">first_name, last_name, email, department, role</code>.
              </p>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center bg-slate-50">
                <FileSpreadsheet size={32} className="mx-auto text-blue-600 mb-2" />
                <p className="text-xs font-bold text-slate-700">employees_batch_october.csv</p>
                <p className="text-[11px] text-slate-400">2 employee records ready for import</p>
              </div>

              {importStatus && (
                <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-200">
                  {importStatus}
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Close
                </button>
                <button
                  onClick={handleSimulateCsvImport}
                  className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm"
                >
                  Start Import
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee Profile View Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3.5">
                <img
                  src={selectedEmployee.avatarUrl}
                  alt={selectedEmployee.firstName}
                  className="h-14 w-14 rounded-full object-cover ring-4 ring-blue-500/20"
                />
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    {selectedEmployee.firstName} {selectedEmployee.lastName}
                  </h3>
                  <p className="text-xs text-blue-600 font-semibold">{selectedEmployee.designation}</p>
                  <p className="text-[11px] text-slate-400">{selectedEmployee.department}</p>
                </div>
              </div>
              <button onClick={() => setSelectedEmployee(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 font-medium block">Employee Code:</span>
                  <span className="font-mono font-bold text-slate-800">{selectedEmployee.employeeCode}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Date of Joining:</span>
                  <span className="font-bold text-slate-800">{selectedEmployee.dateOfJoining}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Reporting Manager:</span>
                  <span className="font-bold text-slate-800">{selectedEmployee.manager || 'Executive'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Employment Type:</span>
                  <span className="font-bold text-slate-800">{selectedEmployee.employmentType}</span>
                </div>
              </div>

              {/* Sensitive Data Protection Field Level Notice */}
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
                <ShieldAlert size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-900 text-[11px]">Field-Level Security Active</p>
                  <p className="text-[11px] text-amber-700">
                    Statutory PAN, Aadhaar, and Bank Account details are encrypted and masked for non-HR roles.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setSelectedEmployee(null)}
                className="px-4 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
