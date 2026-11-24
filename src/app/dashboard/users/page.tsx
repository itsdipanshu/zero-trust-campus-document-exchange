"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Search,
  Edit2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle,
  UserCheck,
  UserX,
  ShieldAlert,
} from "lucide-react";

interface Department {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  department: Department | null;
  status: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ role: "", status: "", departmentId: "" });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [forbidden, setForbidden] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        ...(search && { search }),
        ...(roleFilter && { role: roleFilter }),
      });
      const res = await fetch(`/api/users?${params}`);
      if (res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setUsers(data.data.users);
        setPagination(data.data.pagination);
      }
    } catch {
      console.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => {
    fetch("/api/departments").then((r) => r.json()).then((d) => {
      if (d.success) setDepartments(d.data.departments);
    }).catch(() => {});
  }, []);

  const handleEdit = (user: User) => {
    setEditing(user);
    setEditForm({
      role: user.role,
      status: user.status,
      departmentId: user.department?.id || "",
    });
  };

  const handleUpdate = async () => {
    if (!editing) return;
    try {
      const res = await fetch(`/api/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "User updated" });
        setEditing(null);
        fetchUsers();
      } else {
        setMessage({ type: "error", text: data.error });
      }
    } catch {
      setMessage({ type: "error", text: "Update failed" });
    }
  };

  const roleColors: Record<string, string> = {
    admin: "bg-[#F6ECE0] text-[#845627] border border-[#ECD5BA]",
    hod: "bg-purple-50 text-purple-700 border border-purple-200",
    faculty: "bg-[#EAF1EE] text-[#325C53] border border-[#A9C5BB]",
    student: "bg-[#EAF1EE] text-[#477B70] border border-[#A9C5BB]",
  };

  if (forbidden) {
    return (
      <div className="card text-center py-20 max-w-lg mx-auto mt-10">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-[#202923]">Administrative Access Required</h2>
        <p className="text-[#68736B] text-xs mt-1.5 leading-relaxed">
          The User Management directory contains campus identity records and is restricted strictly to University Administrators and Department Heads.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="pb-2 border-b border-[#D9DED8]">
        <h1 className="text-xl font-bold text-[#202923] flex items-center gap-2">
          <Users className="w-5 h-5 text-[#477B70]" />
          User Management
        </h1>
        <p className="text-[#68736B] text-xs mt-0.5">View and manage campus identities and academic roles</p>
      </div>

      {message.text && (
        <div className={`flex items-center gap-2 p-3 rounded-lg border text-xs ${message.type === "success" ? "bg-[#EAF1EE] border-[#A9C5BB] text-[#325C53]" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
          {message.type === "success" ? <CheckCircle className="w-4 h-4 text-[#477B70]" /> : <AlertCircle className="w-4 h-4 text-rose-500" />}
          <p className="font-medium">{message.text}</p>
          <button onClick={() => setMessage({ type: "", text: "" })} className="ml-auto text-[#68736B] hover:text-[#202923]"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="card p-3.5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#68736B]" />
            <input type="text" placeholder="Search by name or email..." className="input-field pl-9 text-xs py-2" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select className="select-field text-xs py-2 w-36" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="hod">HOD</option>
            <option value="faculty">Faculty</option>
            <option value="student">Student</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 text-[#477B70] animate-spin" /></div>
      ) : (
        <div className="card overflow-hidden p-0 border border-[#D9DED8]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="table-header">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Joined</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9DED8]/60 bg-white/70">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-[#EAF1EE]/30 transition-colors">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#183A35] text-white flex items-center justify-center font-semibold text-xs">
                          {u.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-[#202923] font-semibold text-xs">{u.name}</p>
                          <p className="text-[#68736B] text-[11px] font-mono">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell"><span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded ${roleColors[u.role] || "bg-[#E9EBE5] text-[#202923]"}`}>{u.role}</span></td>
                    <td className="table-cell text-[#68736B] text-xs">{u.department?.name || "—"}</td>
                    <td className="table-cell">
                      <span className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded ${u.status === "active" ? "bg-[#EAF1EE] text-[#325C53] border border-[#A9C5BB]" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="table-cell text-[#68736B] text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="table-cell text-right">
                      <button onClick={() => handleEdit(u)} className="p-1.5 text-[#68736B] hover:text-[#202923] rounded hover:bg-[#E9EBE5]" title="Edit user">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit User Modal - Frosted Glass */}
      {editing && (
        <div className="fixed inset-0 bg-[#183A35]/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl border border-[#D9DED8] shadow-[0_16px_40px_rgba(24,58,53,0.15)] p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#D9DED8]">
              <h2 className="text-base font-bold text-[#202923]">Edit Campus User</h2>
              <button onClick={() => setEditing(null)} className="text-[#68736B] hover:text-[#202923]"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1">Academic Role</label>
                <select className="select-field text-xs" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                  <option value="student">Student</option>
                  <option value="faculty">Faculty</option>
                  <option value="hod">HOD</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1">Account Status</label>
                <select className="select-field text-xs" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1">Department</label>
                <select className="select-field text-xs" value={editForm.departmentId} onChange={(e) => setEditForm({ ...editForm, departmentId: e.target.value })}>
                  <option value="">No Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button onClick={() => setEditing(null)} className="btn-secondary flex-1 text-xs py-2">Cancel</button>
              <button onClick={handleUpdate} className="btn-primary flex-1 text-xs py-2">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
