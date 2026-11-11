import { profile } from "../data/profile";
import { DiscordIcon, GitHubIcon } from "./icons";
import { SkinPreview } from "./SkinPreview";
import { SocialButton } from "./SocialButton";

export function Hero() {
  return (
    <section id="about" className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
      <SkinPreview name={profile.name} />

      <div className="flex flex-col justify-center gap-5 py-6">
        <h1 className="m-0 text-5xl leading-none font-extrabold tracking-tight uppercase md:text-[56px]">
          Hi, I&apos;m {profile.name}
        </h1>
        <p className="m-0 max-w-[440px] text-[15px] leading-[22px] text-text-secondary">{profile.about}</p>
        <div className="flex flex-wrap gap-3">
          <SocialButton href={profile.githubUrl} icon={<GitHubIcon />}>
            GitHub
          </SocialButton>
          <SocialButton href={profile.discordUrl} icon={<DiscordIcon />} variant="discord">
            Discord
          </SocialButton>
        </div>
      </div>
    </section>
  );
}
