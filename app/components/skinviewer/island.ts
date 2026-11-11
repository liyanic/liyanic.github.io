import {BoxGeometry, CanvasTexture, Color, Group, Mesh, MeshStandardMaterial, NearestFilter, SRGBColorSpace, Texture, TextureLoader} from "three";

export interface BlockTextures {
    dirt: string;
    grassTop: string;
    grassSide: string;
}

const BLOCK = 16;
const GRASS_TINT = new Color("#91bd59");
export const ISLAND_TOP = -16;
export const ISLAND_DEPTH = 2 * BLOCK;

const BLOCKS: [number, number, number][] = [
    [-0.5, 0, 0.5],
    [0.5, 0, 0.5],
    [0.5, 0, -0.5],
    [0.5, 1, 0.5],
];

const ISLAND_TURN = -0.45;
const SHADE = {top: 1, northSouth: 0.8, eastWest: 0.6, bottom: 0.5};

function seeded(seed: number) {
    return () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
}

function drawFallbackTextures(): Record<keyof BlockTextures, HTMLCanvasElement> {
    const random = seeded(7);
    const canvas = (draw: (pixel: (x: number, y: number, color: string) => void) => void) => {
        const element = document.createElement("canvas");
        element.width = element.height = 16;
        const context = element.getContext("2d")!;
        draw((x, y, color) => {
            context.fillStyle = color;
            context.fillRect(x, y, 1, 1);
        });
        return element;
    };
    const pick = (colors: string[]) => colors[Math.floor(random() * colors.length)];
    const dirt = ["#866043", "#79553a", "#966c4a", "#5e4430", "#8b6d50"];

    const grass = ["#8e8e8e", "#a3a3a3", "#7a7a7a", "#b5b5b5", "#949494"];
    const grassSide = ["#59a530", "#4c8f29", "#6bba3a"];

    const dirtPixels = Array.from({length: 256}, () => pick(dirt));

    const edge = Array.from({length: 16}, () => 3 + Math.floor(random() * 2.2));

    return {
        dirt: canvas(pixel => dirtPixels.forEach((color, i) => pixel(i % 16, Math.floor(i / 16), color))),
        grassTop: canvas(pixel => {
            for (let i = 0; i < 256; i++) pixel(i % 16, Math.floor(i / 16), pick(grass));
        }),
        grassSide: canvas(pixel => dirtPixels.forEach((color, i) => {
            const x = i % 16, y = Math.floor(i / 16);
            pixel(x, y, y < edge[x] ? pick(grassSide) : color);
        })),
    };
}

function toTexture(source: string | HTMLCanvasElement): Texture {
    const texture = typeof source === "string" ? new TextureLoader().load(source) : new CanvasTexture(source);
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.colorSpace = SRGBColorSpace;
    return texture;
}


export function createIsland(textures: BlockTextures | null): { island: Group, dispose: () => void } {
    const sources = textures ?? drawFallbackTextures();
    const grassTop = toTexture(sources.grassTop);
    const grassSide = toTexture(sources.grassSide);
    const dirt = toTexture(sources.dirt);

    const material = (map: Texture, shade: number, tint?: Color) =>
        new MeshStandardMaterial({map, color: (tint ?? new Color("#ffffff")).clone().multiplyScalar(shade), roughness: 1, metalness: 0});

    const faces = (side: Texture, top: Texture, bottom: Texture, topTint?: Color) => [
        material(side, SHADE.eastWest), material(side, SHADE.eastWest),
        material(top, SHADE.top, topTint), material(bottom, SHADE.bottom),
        material(side, SHADE.northSouth), material(side, SHADE.northSouth),
    ];
    const grassMaterials = faces(grassSide, grassTop, dirt, GRASS_TINT);
    const dirtMaterials = faces(dirt, dirt, dirt);
    const geometry = new BoxGeometry(BLOCK, BLOCK, BLOCK);

    const island = new Group();
    island.rotation.y = ISLAND_TURN;
    for (const [x, layer, z] of BLOCKS) {
        const block = new Mesh(geometry, layer === 0 ? grassMaterials : dirtMaterials);
        block.position.set(x * BLOCK, ISLAND_TOP - BLOCK / 2 - layer * BLOCK, z * BLOCK);
        island.add(block);
    }

    return {
        island,
        dispose: () => {
            geometry.dispose();
            [...grassMaterials, ...dirtMaterials].forEach(used => used.dispose());
            [grassTop, grassSide, dirt].forEach(texture => texture.dispose());
        },
    };
}
