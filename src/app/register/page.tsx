"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { saveAuth } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "", role: "passenger" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await authApi.register(form);
      saveAuth(data.token, { user_id: data.user_id, role: data.role as "driver" | "passenger" | "both", name: form.name });
      router.push("/map");
    } catch {
      setError("Registration failed. Phone may already be registered.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-navy mb-1">Create account</h1>
        <p className="text-gray-500 text-sm mb-6">Join SamKjør</p>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required
              placeholder="+47 900 00 000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-gray-400">(for notifications)</span></label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">I am a…</label>
            <select value={form.role} onChange={(e) => set("role", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
              <option value="passenger">Passenger</option>
              <option value="driver">Driver (taxi)</option>
              <option value="both">Both</option>
            </select>
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-brand hover:bg-brand-light text-white font-semibold rounded-lg py-2.5 text-sm transition disabled:opacity-60">
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="text-brand font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
