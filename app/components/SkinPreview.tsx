import PlayerPreview from "@/app/components/PlayerPreview";

export function SkinPreview({ name }: { name: string }) {
  return (
    <div className="flex h-[500px] flex-col items-center justify-center gap-5  rounded-xl px-5 py-10 overflow-visible aspect-[1/2]">
        <PlayerPreview autoRotate={false} nameTag={name} zoomable={false} rotation={22.8} pitch={11.8} followMouse={true} />
    </div>
  );
}
