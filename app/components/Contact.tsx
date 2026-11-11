import { profile } from "../data/profile";
import { DiscordIcon } from "./icons";
import { SocialButton } from "./SocialButton";

export function Contact() {
  return (
    <section
      id="contact"
      className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface p-6"
    >
      <div className="flex flex-col gap-1">
        <span className="text-lg leading-[22px] font-bold">Want to talk or build something?</span>
        <span className="text-[13px] leading-[18px] text-text-secondary">Message me on Discord</span>
      </div>
      <SocialButton href={profile.discordUrl} icon={<DiscordIcon />} variant="discord">
        Discord
      </SocialButton>
    </section>
  );
}
