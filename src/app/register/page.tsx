"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Shield,
  Mail,
  Lock,
  User,
  Building2,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";

interface Department {
  id: string;
  name: string;
  description?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "student",
    departmentId: "",
  });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptLoading, setDeptLoading] = useState(true);
  const [deptError, setDeptError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setDeptLoading(true);
    setDeptError("");

    fetch("/api/departments")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        if (data.success && Array.isArray(data.data.departments) && data.data.departments.length > 0) {
          setDepartments(data.data.departments);
          // Set first department as default if not selected
          setForm((prev) => ({
            ...prev,
            departmentId: prev.departmentId || data.data.departments[0].id,
          }));
        } else {
          setDeptError("Campus departments could not be loaded. Please contact administrator.");
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setDeptError("Failed to connect to department directory.");
        console.error("Department fetch error:", err);
      })
      .finally(() => {
        if (isMounted) setDeptLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError("Please fill in all required fields.");
      return;
    }

    if (!form.departmentId) {
      setError("Please select your academic department.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role === "faculty" ? "faculty" : "student", // Strictly student or faculty
          departmentId: form.departmentId,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Registration failed");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Network error. Please verify your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F3EE] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Institutional Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="w-10 h-10 bg-[#183A35] border border-[#224741] rounded-xl flex items-center justify-center shadow-md">
              <Shield className="w-5 h-5 text-[#C18B52]" />
            </div>
            <div className="text-left">
              <span className="text-xl font-bold tracking-tight text-[#202923] block">
                CAMPUS<span className="text-[#C18B52]">VAULT</span>
              </span>
              <span className="text-xs text-[#68736B] block font-medium">
                University Document Exchange
              </span>
            </div>
          </Link>
        </div>

        {/* Register Card - Frosted Glass */}
        <div className="card shadow-[0_8px_30px_rgba(24,58,53,0.06)] p-7">
          <div className="border-b border-[#D9DED8] pb-4 mb-6">
            <h2 className="text-lg font-bold text-[#202923]">
              Create Campus Account
            </h2>
            <p className="text-xs text-[#68736B] mt-1">
              Register with your university credentials and assigned department
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-lg p-3 mb-5">
              <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-rose-700 font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1.5">
                Full Name *
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#68736B]" />
                <input
                  type="text"
                  className="input-field pl-9 text-xs"
                  placeholder="e.g. Rahul Sharma"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1.5">
                Campus Email Address *
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#68736B]" />
                <input
                  type="email"
                  className="input-field pl-9 text-xs"
                  placeholder="student@campusvault.edu"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1.5">
                  Academic Role *
                </label>
                <select
                  className="select-field text-xs"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="student">Student</option>
                  <option value="faculty">Faculty / Instructor</option>
                </select>
                <p className="text-[11px] text-[#68736B] mt-1">
                  Default: Student. Admin roles are managed via governance.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1.5">
                  Department *
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#68736B] pointer-events-none" />
                  <select
                    className="select-field pl-9 text-xs"
                    value={form.departmentId}
                    onChange={(e) =>
                      setForm({ ...form, departmentId: e.target.value })
                    }
                    disabled={deptLoading || departments.length === 0}
                    required
                  >
                    {deptLoading ? (
                      <option value="">Loading departments...</option>
                    ) : departments.length > 0 ? (
                      departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))
                    ) : (
                      <option value="">No departments available</option>
                    )}
                  </select>
                </div>
                {deptLoading && (
                  <p className="text-[11px] text-[#477B70] mt-1 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Fetching campus departments...
                  </p>
                )}
                {deptError && (
                  <p className="text-[11px] text-rose-500 mt-1">{deptError}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1.5">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#68736B]" />
                  <input
                    type="password"
                    className="input-field pl-9 text-xs"
                    placeholder="Min 6 characters"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider mb-1.5">
                  Confirm Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#68736B]" />
                  <input
                    type="password"
                    className="input-field pl-9 text-xs"
                    placeholder="Repeat password"
                    value={form.confirmPassword}
                    onChange={(e) =>
                      setForm({ ...form, confirmPassword: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || deptLoading || departments.length === 0}
                className="btn-primary w-full py-2.5 text-xs font-semibold"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating account...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Complete Registration</span>
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="border-t border-[#D9DED8] mt-6 pt-4 text-center">
            <p className="text-xs text-[#68736B]">
              Already have an authorized account?{" "}
              <Link href="/login" className="text-[#477B70] hover:text-[#325C53] font-semibold hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
