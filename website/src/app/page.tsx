import Link from "next/link";
import { GeistMono } from "geist/font/mono";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { layoutConfig } from "@/app/layout.config";

const features = [
  {
    title: "Agent Loop",
    description:
      "LLM → tool → LLM cycle with streaming, cancellation, and error recovery. The core that powers every interaction.",
    icon: "🔄",
  },
  {
    title: "Extension Protocol",
    description:
      "JSON-RPC 2.0 wire protocol. Write extensions in any language — they're subprocesses, not function calls.",
    icon: "🔌",
  },
  {
    title: "20+ LLM Providers",
    description:
      "OpenAI, Anthropic, Google, Mistral, Groq, DeepSeek, Bedrock, and more. Pick your provider, set a key, go.",
    icon: "🤖",
  },
  {
    title: "Capability Sandbox",
    description:
      "Declare what tools need. Block everything else. Every capability requires explicit approval — no silent escapes.",
    icon: "🛡️",
  },
  {
    title: "Session Persistence",
    description:
      "Append-only JSONL format. Resume conversations across restarts. Full audit trail of every interaction.",
    icon: "💾",
  },
  {
    title: "TUI + REPL",
    description:
      "Full-screen terminal UI with syntax highlighting, or line-based REPL. Zero dependencies. Works anywhere.",
    icon: "🖥️",
  },
];

const steps = [
  {
    title: "Install",
    code: "npm install -g @zosmaai/dhara",
  },
  {
    title: "Set a Key",
    code: "export ANTHROPIC_API_KEY=\"sk-ant-...\"",
  },
  {
    title: "Run",
    code: "npx dhara \"List the files in this project\"",
  },
];

export default function HomePage() {
  return (
    <HomeLayout {...layoutConfig}>
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-4 pt-24 pb-16 sm:pt-32 sm:pb-20">
        <div className="flex flex-col items-center gap-6 max-w-3xl text-center">
          <svg
            width="96"
            height="96"
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-[0_0_30px_oklch(0.66_0.16_152.37_/_0.15)]"
            aria-label="Dhara logo"
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

          <div className="flex flex-col gap-4">
            <h1 className="text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Dhara
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
              A minimal, secure, language-agnostic coding agent harness.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 justify-center pt-2">
            <Link
              href="/docs/getting-started"
              className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:opacity-90 transition-all"
            >
              Get Started
            </Link>
            <Link
              href="https://github.com/zosmaai/dhara"
              className="inline-flex items-center justify-center rounded-lg border border-border bg-card text-card-foreground px-6 py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor" aria-label="GitHub">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              GitHub
            </Link>
          </div>

          <div className="mt-4">
            <code
              className={`${GeistMono.variable} inline-flex items-center gap-2 rounded-lg bg-card border border-border px-5 py-3 text-sm text-muted-foreground font-mono`}
            >
              <span className="text-primary">$</span> npm install -g @zosmaai/dhara
            </code>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 pb-24">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12">
            Everything you need to build agentic tools
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-border bg-card p-5 hover:bg-accent/50 transition-colors"
              >
                <div className="text-2xl mb-3">{feature.icon}</div>
                <h3 className="font-semibold text-sm mb-1.5">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quick Start */}
      <section className="px-4 pb-24">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-12">
            Get started in 30 seconds
          </h2>
          <div className="flex flex-col gap-6">
            {steps.map((step, i) => (
              <div key={step.title} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm mb-2">{step.title}</h3>
                  <code
                    className={`${GeistMono.variable} block rounded-lg bg-card border border-border px-4 py-2.5 text-sm text-muted-foreground font-mono overflow-x-auto`}
                  >
                    {step.code}
                  </code>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              href="/docs/getting-started"
              className="text-sm text-primary hover:underline"
            >
              Read the full guide →
            </Link>
          </div>
        </div>
      </section>

      {/* Architecture */}
      <section className="px-4 pb-24">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-4">
            Minimal by design
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-10 max-w-lg mx-auto leading-relaxed">
            Three clean layers. No bloat. No lock-in. Just the essential
            primitives for building AI agents.
          </p>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-1 divide-y divide-border">
              {[
                {
                  layer: "Ecosystem",
                  desc: "Packages · Themes · Skills · Prompts",
                  color: "text-emerald-400",
                },
                {
                  layer: "Extension",
                  desc: "Tools · Providers · Renderers · Hooks (any language, wire protocol)",
                  color: "text-sky-400",
                },
                {
                  layer: "Core",
                  desc: "Agent Loop · Tool Interface · Sandbox · Session Format · Event Bus",
                  color: "text-violet-400",
                },
              ].map((item) => (
                <div
                  key={item.layer}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex-shrink-0">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${item.color} opacity-70`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm">{item.layer}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      {item.desc}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>Dhara — {new Date().getFullYear()} Zosma AI</span>
          <div className="flex items-center gap-6">
            <Link
              href="/docs/getting-started"
              className="hover:text-foreground transition-colors"
            >
              Docs
            </Link>
            <a
              href="https://github.com/zosmaai/dhara"
              className="hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <a
              href="https://zosma.ai"
              className="hover:text-foreground transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Zosma AI
            </a>
          </div>
        </div>
      </footer>
    </HomeLayout>
  );
}
