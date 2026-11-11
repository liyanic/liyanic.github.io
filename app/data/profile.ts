export const profile = {
    name: "Liyanic",
    about: "A swiss developer with a passion for programming. I build mainly Minecraft mods and my own render engines with Vulkan and OpenGL.",
    githubUrl: "https://github.com/liyanic",
    discordUrl: "https://discord.com/users/853525304470667274",
};

export type Rarity = "LEGENDARY" | "EPIC" | "RARE";

export type Project = {
    name: string;
    rarity: Rarity;
    language: string;
    description: string;
    url: string;
    icon: string;
};

export const projects: Project[] = [
    {
        name: "Simple Client",
        rarity: "LEGENDARY",
        language: "Java",
        description: "Minecraft Client developed to make your daily game easier and more fun.",
        url: "https://simple-client.com",
        icon: "/client.svg",
    },
    {
        name: "Simple Laucher",
        rarity: "EPIC",
        language: "TS and React",
        description: "Minecraft Launcher which allows you to manage mods and versions easily",
        url: "https://simple-client.com",
        icon: "/launcher.svg",
    },
    {
        name: "Simple Render Engine",
        rarity: "RARE",
        language: "[Language]",
        description: "Render your html pages using java inside of Minecraft or other games",
        url: "https://simple-client.com",
        icon: "/engine.svg",
    },
];
