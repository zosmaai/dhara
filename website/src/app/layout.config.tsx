import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const layoutConfig: BaseLayoutProps = {
  nav: {
    title: (
      <div className="flex items-center gap-2">
        <svg
          width="20"
          height="20"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="size-5"
        >
          <defs>
            <linearGradient id="navLogo" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
          <circle
            cx="100"
            cy="100"
            r="85"
            stroke="url(#navLogo)"
            strokeWidth="3"
            fill="none"
            opacity="0.3"
          />
          <circle
            cx="100"
            cy="100"
            r="40"
            stroke="url(#navLogo)"
            strokeWidth="2"
            fill="none"
          />
          <circle cx="100" cy="100" r="20" fill="url(#navLogo)" opacity="0.9" />
        </svg>
        <span className="font-semibold text-base">Dhara</span>
      </div>
    ),
  },
  links: [
    {
      text: "Docs",
      url: "/docs/getting-started",
      active: "nested-url",
    },
    {
      text: "GitHub",
      url: "https://github.com/zosmaai/dhara",
      external: true,
    },
  ],
};
