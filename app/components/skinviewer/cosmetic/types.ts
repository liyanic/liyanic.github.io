export type Vec3 = { x: number; y: number; z: number };

export interface AssetRef {
    url: string;
    sha256: string;
}

export type CosmeticType = "model" | "cape" | "elytra" | "skin_glint";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type Bone = "head" | "body" | "left_arm" | "right_arm" | "left_leg" | "right_leg";
export type OnEnd = "loop" | "hold" | "stop";

const STATE_EVENTS = ["idle", "player_walk", "player_sprint", "player_sneak", "player_swim", "player_fly"] as const;
type InstantEvent = "player_jump" | "player_hurt" | "player_attack";
export type CosmeticEvent = (typeof STATE_EVENTS)[number] | InstantEvent;

export function isStateEvent(event: string): boolean {
    return (STATE_EVENTS as readonly string[]).includes(event);
}

export interface Variant {
    id: string;
    name: string;
    textures: { diffuse?: AssetRef };
    "glint-color": string;
}

export interface AnimationDefinition {
    id: string;
    event: CosmeticEvent;
    source: string | null;
    priority: number;
    probability?: number;
    "texture-fps"?: number;
    "blend-in-ticks"?: number;
    "blend-out-ticks"?: number;
    "while-active"?: boolean;
    "on-end"?: OnEnd;
}

export interface EmitterDefinition {
    id: string;
    event: CosmeticEvent;
    effect: string;
    locator?: string | null;
    offset?: Vec3;
    probability?: number;
    "cooldown-ticks"?: number;
    "interval-ticks"?: number;
    "while-active"?: boolean;
}

export interface CosmeticDefinition {
    "schema-version": string;
    type?: CosmeticType;
    meta: {
        id: string;
        name: string;
        description: string;
        category: string;
        tags: string[];
        rarity: Rarity;
        author: string;
        version: string;
        thumbnail?: AssetRef;
    };
    assets: {
        model?: AssetRef;
        mtl?: AssetRef;
        animations?: Record<string, AssetRef>;
        effects?: Record<string, AssetRef>;
    };
    variants: Variant[];
    "default-variant": string;
    glint?: { enabled: boolean; intensity: number };
    animations?: AnimationDefinition[];
    particles?: EmitterDefinition[];
    transform?: {
        position: Vec3;
        "rotation-degrees": Vec3;
        "rotation-order": string;
        scale: Vec3;
        pivot: Vec3;
    };
    mirror?: { enabled: boolean; axis: "x" | "y" | "z"; pivot: Vec3 };
    attachment?: { bone: Bone; "first-person": boolean; "third-person": boolean };
    visibility?: {
        "hide-when-invisible": boolean;
        "hide-with-armor": boolean;
        "hide-with-elytra": boolean;
        "hide-in-spectator": boolean;
        "max-render-distance": number;
    };
    bounds?: { from: Vec3; to: Vec3 };
    equipment?: { slot: string; "exclusive-group": string };
}

export interface VatLocator {
    positions: number[][];
    rotations: number[][];
}

export interface VatKeyframe {
    frame: number;
    type: string;
    effect?: string;
    locator?: string | null;
}

export interface VatDefinition {
    name: string;
    mesh: string;
    textures: { position: string; normal?: string; tangent?: string };
    sha256: Record<string, string>;
    vertex_count: number;
    frame_count: number;
    start_frame: number;
    end_frame: number;
    fps: number;
    bounds_min: number[];
    bounds_max: number[];
    locators?: Record<string, VatLocator>;
    keyframes?: VatKeyframe[];
}

export interface ParticleEffectDefinition {
    id: string;
    sprite: string;
    count: number;
    "max-particles": number;
    "lifetime-ticks": { min: number; max: number };
    speed: { min: number; max: number };
    direction: number[];
    "spread-degrees": number;
    gravity: number;
    size: { min: number; max: number };
    "spawn-box": number[];
    "fade-out": boolean;
    "local-space": boolean;
}

export type AssetResolver = (url: string, relativeTo?: string) => string;

export function cosmeticType(def: CosmeticDefinition): CosmeticType {
    return def.type ?? "model";
}

export function findVariant(def: CosmeticDefinition, variant?: string | null): Variant | undefined {
    return def.variants.find(v => v.id === variant)
        ?? def.variants.find(v => v.id === def["default-variant"])
        ?? def.variants[0];
}
