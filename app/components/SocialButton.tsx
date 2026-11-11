import type { ReactNode } from "react";

type Variant = "accent" | "discord";

const variants: Record<Variant, string> = {
  accent: "bg-accent hover:bg-accent/85",
  discord: "bg-discord hover:bg-discord-hover",
};

export function SocialButton({
  href,
  icon,
  children,
  variant = "accent",
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-white no-underline transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${variants[variant]}`}
    >
      {icon}
      {children}
    </a>
  );
}
