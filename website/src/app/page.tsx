import Link from "next/link";
import { GeistMono } from "geist/font/mono";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center gap-8 max-w-2xl text-center">
        {/* Logo */}
        <svg
          width="80"
          height="80"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="heroLogo" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
            <linearGradient id="heroLogo2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#3B82F6" />
            </linearGradient>
            <radialGradient id="heroGlobe" cx="0.4" cy="0.35" r="0.6">
              <stop offset="0%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#4F46E5" />
            </radialGradient>
          </defs>
          <circle cx="100" cy="100" r="85" stroke="url(#heroLogo)" strokeWidth="3" fill="none" opacity="0.3" />
          <circle cx="100" cy="100" r="40" stroke="url(#heroLogo)" strokeWidth="2" fill="none" />
          <circle cx="100" cy="100" r="20" fill="url(#heroLogo)" opacity="0.9" />
          <path d="M100 60 Q120 70 140 60 Q160 50 170 70" stroke="url(#heroLogo2)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
          <path d="M100 140 Q80 130 60 140 Q40 150 30 130" stroke="url(#heroLogo2)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
          <path d="M140 80 Q150 100 140 120" stroke="url(#heroLogo2)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
          <path d="M60 80 Q50 100 60 120" stroke="url(#heroLogo2)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
          <circle cx="170" cy="70" r="5" fill="#3B82F6" opacity="0.8" />
          <circle cx="30" cy="130" r="5" fill="#3B82F6" opacity="0.8" />
          <circle cx="140" cy="120" r="4" fill="#6366F1" opacity="0.8" />
          <circle cx="60" cy="120" r="4" fill="#6366F1" opacity="0.8" />
          <circle cx="100" cy="100" r="14" fill="url(#heroGlobe)" />
          <path d="M87 94 Q100 100 113 94" stroke="white" strokeWidth="0.9" fill="none" opacity="0.5" />
          <path d="M86 100 Q100 106 114 100" stroke="white" strokeWidth="0.9" fill="none" opacity="0.5" />
          <path d="M87 106 Q100 112 113 106" stroke="white" strokeWidth="0.9" fill="none" opacity="0.5" />
          <path d="M95 87 Q101 100 95 113" stroke="white" strokeWidth="0.9" fill="none" opacity="0.5" />
          <path d="M100 86 Q106 100 100 114" stroke="white" strokeWidth="0.9" fill="none" opacity="0.5" />
          <path d="M105 87 Q111 100 105 113" stroke="white" strokeWidth="0.9" fill="none" opacity="0.5" />
        </svg>

        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Dhara
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg">
            A minimal, secure, language-agnostic AI coding agent harness.
          </p>
        </div>

        <div className="flex gap-4">
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Get Started
          </Link>
          <Link
            href="https://github.com/zosmaai/dhara"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-card text-card-foreground px-5 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
          >
            GitHub
          </Link>
        </div>

        <code
          className={`${GeistMono.variable} mt-4 rounded-lg bg-card border border-border px-4 py-3 text-sm text-muted-foreground`}
        >
          npm install -g @zosmaai/dhara
        </code>
      </div>
    </main>
  );
}
