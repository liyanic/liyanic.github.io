import type { Project, Rarity } from "../data/profile";
import { ArrowUpRightIcon } from "./icons";

const rarityColor: Record<Rarity, string> = {
  LEGENDARY: "text-rarity-legendary",
  EPIC: "text-rarity-epic",
  RARE: "text-rarity-rare",
};

export function ItemTooltip({ project }: { project: Project }) {
  return (
    <div
      aria-live="polite"
      className="flex flex-col gap-2 rounded-md border-2 border-tooltip-border bg-tooltip/95 px-[18px] py-4 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-xl leading-6 font-extrabold">{project.name}</h3>
        <span className={`text-[11px] leading-[14px] font-bold tracking-[0.05em] ${rarityColor[project.rarity]}`}>
          {project.rarity}
        </span>
      </div>
      <p className="m-0 text-sm leading-5 text-[#c4c4cc]">{project.description}</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] leading-[18px] text-text-secondary">{project.language}</span>
        <a
          href={project.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-rarity-rare no-underline transition-colors hover:text-white"
        >
          View project
          <ArrowUpRightIcon size={16} />
        </a>
      </div>
    </div>
  );
}
