"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { saveAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await authApi.login({ phone, password });
      saveAuth(data.token, { user_id: data.user_id, role: data.role as "driver" | "passenger" | "both" });
      router.push("/map");
    } catch {
      setError("Invalid phone or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-navy mb-1">SamKjør</h1>
        <p className="text-gray-500 text-sm mb-6">Sign in to your account</p>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+47 900 00 000"
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand hover:bg-brand-light text-white font-semibold rounded-lg py-2.5 text-sm transition disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          No account?{" "}
          <Link href="/register" className="text-brand font-medium hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
