import { useState } from "react";
import { projects } from "../data/profile";
import { Hotbar } from "./Hotbar";
import { ItemTooltip } from "./ItemTooltip";

export function Projects() {
  const [selected, setSelected] = useState(0);
  const current = projects[selected] ?? projects[0];

  return (
    <section id="projects" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[28px] leading-[34px] font-bold tracking-tight">Projects</h2>
        <p className="m-0 text-[15px] leading-5 text-text-secondary">Things I&#39;ve built and worked on</p>
      </div>

      <div
        className="flex justify-center rounded-xl bg-cover bg-bottom px-5 py-14 [image-rendering:pixelated] bg-top-right"
        style={{
          backgroundImage: `linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.35)), url(/mc-bg.png)`,
        }}
      >
        <div className="flex w-full max-w-[640px] flex-col gap-4">
          <Hotbar projects={projects} selected={selected} onSelect={setSelected} />
          {current && <ItemTooltip project={current} />}
        </div>
      </div>
    </section>
  );
}
