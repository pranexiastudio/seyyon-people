import React, { useState } from 'react';
import { FileText, Upload, Download, Eye, ShieldCheck, Lock, Plus, X } from 'lucide-react';

export const DocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState([
    {
      id: 'doc-1',
      title: 'Employment Agreement & NDA (Executed)',
      category: 'Contracts',
      size: '1.4 MB',
      updatedAt: 'Jan 10, 2022',
      isConfidential: true,
    },
    {
      id: 'doc-2',
      title: 'Aadhaar Card & Government ID Verification',
      category: 'Identification',
      size: '850 KB',
      updatedAt: 'Jan 12, 2022',
      isConfidential: true,
    },
    {
      id: 'doc-3',
      title: 'Acme Technologies Employee Handbook 2026',
      category: 'Policies',
      size: '3.2 MB',
      updatedAt: 'Aug 01, 2026',
      isConfidential: false,
    },
    {
      id: 'doc-4',
      title: 'Form 16 Tax Certificate (FY 2025-26)',
      category: 'Tax & Compliance',
      size: '620 KB',
      updatedAt: 'Jun 15, 2026',
      isConfidential: true,
    },
  ]);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleDownload = (title: string) => {
    setFeedback(`Authorized secure download initiated for: "${title}".`);
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Secure Employee Document Vault</h2>
          <p className="text-xs text-slate-400">AES-256 S3-compatible encrypted storage with tenant boundary access</p>
        </div>
        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-blue-600/20"
        >
          <Upload size={14} />
          <span>Upload Document</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold rounded-xl animate-in fade-in">
          {feedback}
        </div>
      )}

      {/* Documents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {documents.map((d) => (
          <div
            key={d.id}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                  <FileText size={18} />
                </span>
                {d.isConfidential ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    <Lock size={10} /> Confidential
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    Public
                  </span>
                )}
              </div>

              <h4 className="font-bold text-slate-900 text-xs leading-snug">{d.title}</h4>
              <p className="text-[11px] text-slate-400 mt-1">{d.category} • {d.size}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">{d.updatedAt}</span>
              <button
                onClick={() => handleDownload(d.title)}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                <Download size={13} />
                <span>Download</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-sm">Upload to Vault</h3>
              <button onClick={() => setIsUploadModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Document Title</label>
                <input
                  type="text"
                  placeholder="e.g. Master Degree Certificate"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Category</label>
                <select className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800">
                  <option>Contracts & Agreements</option>
                  <option>Identification & Tax Proofs</option>
                  <option>Education & Credentials</option>
                  <option>Organizational Policies</option>
                </select>
              </div>

              <div className="border-2 border-dashed border-slate-200 p-6 rounded-xl text-center bg-slate-50">
                <Upload size={24} className="mx-auto text-blue-600 mb-1" />
                <p className="text-xs font-bold text-slate-700">Choose file or drag & drop</p>
                <p className="text-[10px] text-slate-400">PDF, PNG, JPG up to 25MB</p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setIsUploadModalOpen(false);
                    setFeedback('Document encrypted and stored successfully.');
                  }}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Upload & Encrypt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
