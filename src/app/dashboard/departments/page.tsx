"use client";

import { useState, useEffect } from "react";
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  Users,
  FileText,
  ShieldAlert,
} from "lucide-react";

interface Department {
  id: string;
  name: string;
  description: string | null;
  _count: { users: number; documents: number };
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [forbidden, setForbidden] = useState(false);

  const fetchDepartments = async () => {
    try {
      const [meRes, deptRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/departments")
      ]);
      const meData = await meRes.json();
      if (meData.success && meData.data.user.role !== "admin") {
        setForbidden(true);
        setLoading(false);
        return;
      }
      const data = await deptRes.json();
      if (data.success) setDepartments(data.data.departments);
    } catch {
      console.error("Failed to fetch departments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDepartments(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editing ? `/api/departments/${editing.id}` : "/api/departments";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: editing ? "Department updated" : "Department created" });
        setShowForm(false);
        setEditing(null);
        setForm({ name: "", description: "" });
        fetchDepartments();
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Operation failed" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this department?")) return;
    try {
      const res = await fetch(`/api/departments/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "Department deleted" });
        fetchDepartments();
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Delete failed" });
    }
  };

  const openEdit = (dept: Department) => {
    setEditing(dept);
    setForm({ name: dept.name, description: dept.description || "" });
    setShowForm(true);
  };

  if (forbidden) {
    return (
      <div className="card text-center py-20 max-w-lg mx-auto mt-10">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-[#202923]">Administrative Access Required</h2>
        <p className="text-[#68736B] text-xs mt-1.5 leading-relaxed">
          Department configurations and academic restructuring are restricted strictly to University System Administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#D9DED8]">
        <div>
          <h1 className="text-xl font-bold text-[#202923] flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#477B70]" />
            Department Management
          </h1>
          <p className="text-[#68736B] text-xs mt-0.5">Manage academic faculties, units, and campus departments</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ name: "", description: "" }); }} className="btn-primary flex items-center gap-2 text-xs py-2 px-3.5">
          <Plus className="w-4 h-4" /> Add Department
        </button>
      </div>

      {message.text && (
        <div className={`flex items-center gap-2 p-3 rounded-lg border text-xs ${message.type === "success" ? "bg-[#EAF1EE] border-[#A9C5BB] text-[#325C53]" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
          {message.type === "success" ? <CheckCircle className="w-4 h-4 text-[#477B70]" /> : <AlertCircle className="w-4 h-4 text-rose-500" />}
          <p className="font-medium">{message.text}</p>
          <button onClick={() => setMessage({ type: "", text: "" })} className="ml-auto text-[#68736B] hover:text-[#202923]"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-[#477B70] animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <div key={dept.id} className="card-hover group flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-[#EAF1EE] border border-[#A9C5BB] rounded-xl flex items-center justify-center text-[#325C53]">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(dept)} className="p-1.5 text-[#68736B] hover:text-[#202923] rounded hover:bg-[#E9EBE5]"><Edit2 className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(dept.id)} className="p-1.5 text-[#68736B] hover:text-rose-600 rounded hover:bg-rose-50"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <h3 className="text-[#202923] font-bold text-sm mb-1">{dept.name}</h3>
                <p className="text-[#68736B] text-xs mb-4 min-h-[32px]">{dept.description || "No description provided."}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-[#68736B] pt-3 border-t border-[#D9DED8]">
                <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-[#477B70]" />{dept._count.users} users</span>
                <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-[#477B70]" />{dept._count.documents} docs</span>
              </div>
            </div>
          ))}
          {departments.length === 0 && (
            <div className="col-span-full card text-center py-12">
              <Building2 className="w-12 h-12 text-[#68736B] mx-auto mb-3" />
              <p className="text-[#68736B] text-xs">No departments configured yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Department Modal - Frosted Glass */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#183A35]/40 backdrop-blur-md p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl border border-[#D9DED8] shadow-[0_16px_40px_rgba(24,58,53,0.15)] p-6 w-full max-w-md">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9DED8] mb-4">
              <h2 className="text-base font-bold text-[#202923]">{editing ? "Edit Department" : "New Department"}</h2>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="text-[#68736B] hover:text-[#202923]"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1.5">Department Name *</label>
                <input type="text" className="input-field text-xs" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1.5">Description</label>
                <textarea className="input-field text-xs" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="flex gap-2.5 pt-2">
                <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="btn-secondary flex-1 text-xs py-2">Cancel</button>
                <button type="submit" className="btn-primary flex-1 text-xs py-2">{editing ? "Update Department" : "Create Department"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
