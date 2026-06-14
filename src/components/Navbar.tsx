"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearAuth, getUser } from "@/lib/auth";
import clsx from "clsx";

const allLinks = [
  { href: "/map",      label: "Map",           roles: ["passenger", "both"] },
  { href: "/find",     label: "Find a ride",   roles: ["passenger", "both"] },
  { href: "/organize", label: "Organize trip", roles: ["passenger", "both"] },
  { href: "/driver",   label: "Driver",        roles: ["driver"] },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = typeof window !== "undefined" ? getUser() : null;

  function logout() {
    clearAuth();
    router.push("/login");
  }

  return (
    <nav className="h-14 bg-navy text-white flex items-center px-4 gap-4 shadow-md z-50">
      <span className="font-bold text-lg tracking-tight mr-4">SamKjør</span>

      {allLinks.filter((l) => !user || l.roles.includes(user.role)).map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={clsx(
            "text-sm px-3 py-1.5 rounded-lg transition",
            pathname === l.href
              ? "bg-brand text-white"
              : "text-gray-300 hover:bg-white/10"
          )}
        >
          {l.label}
        </Link>
      ))}

      <div className="ml-auto flex items-center gap-3">
        {user && <span className="text-xs text-gray-400">{user.role}</span>}
        <button
          onClick={logout}
          className="text-sm text-gray-300 hover:text-white transition"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
