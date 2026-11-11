import type { Project } from "../data/profile";

const SLOT_COUNT = 9;

const slotBase =
  "flex aspect-square w-full items-center justify-center rounded border-2 border-t-[#111] border-r-surface-active border-b-surface-active border-l-[#111] bg-surface-sunken transition-colors duration-150";

export function Hotbar({
  projects,
  selected,
  onSelect,
}: {
  projects: Project[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      role="list"
      aria-label="Projects"
      className="grid grid-cols-9 gap-1 rounded-[10px] bg-surface/90 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
    >
      {Array.from({ length: SLOT_COUNT }, (_, i) => {
        const project = projects[i];
        if (!project) {
          return <div key={i} aria-hidden="true" className={slotBase} />;
        }
        const isSelected = i === selected;
        return (
          <button
            key={i}
            type="button"
            role="listitem"
            aria-label={project.name}
            aria-pressed={isSelected}
            onClick={() => onSelect(i)}
            onMouseEnter={() => onSelect(i)}
            onFocus={() => onSelect(i)}
            className={`${slotBase} cursor-pointer p-0 hover:bg-surface-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              isSelected ? "bg-surface outline-3 -outline-offset-1 outline-accent" : ""
            }`}
          >
            <img src={project.icon} alt="" className="size-[62%] [image-rendering:pixelated]" />
          </button>
        );
      })}
    </div>
  );
}
