"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, User } from "lucide-react";

const links = [
    { href: "/", label: "Learn", icon: BookOpen },
    { href: "/profile", label: "Profile", icon: User },
];

export default function Navbar() {
    const path = usePathname();
    return (
        <nav className="border-b border-white/[0.07] px-8 flex items-center justify-between h-14 sticky top-0 z-50"
            style={{ background: "rgba(11,14,26,0.92)", backdropFilter: "blur(12px)" }}>
            {/* Logo */}
            <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[#0B0E1A] font-bold text-sm"
                    style={{ background: "linear-gradient(135deg,#00E5A0,#0B8FFF)" }}>D</div>
                <span className="font-semibold text-sm tracking-tight">DOTG</span>
                <span className="text-white/20 text-xs">v2.0</span>
            </div>
            {/* Nav links */}
            <div className="flex items-center gap-1">
                {links.map(({ href, label, icon: Icon }) => {
                    const active = path === href;
                    return (
                        <Link key={href} href={href}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${active ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70 hover:bg-white/5"}`}>
                            <Icon size={14} />
                            {label}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
