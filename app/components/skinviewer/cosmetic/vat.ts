import type {AssetResolver, VatDefinition} from "./types";
import {loadPixels} from "./texture";

export interface Locator {
    positions: Float32Array;
    rotations: Float32Array;
}

export interface Vat {
    name: string;
    vertexCount: number;
    frameCount: number;
    fps: number;
    offsets: Float32Array;
    normals: Float32Array | null;
    locators: Map<string, Locator>;
    keyframes: { frame: number; effect: string; locator: string | null }[];
}

function decode(pixels: ImageData, vat: VatDefinition, map: (encoded: number, axis: number) => number): Float32Array {
    const width = vat.vertex_count;
    const rows = vat.frame_count;
    if (pixels.width !== width || pixels.height !== rows) {
        throw new Error(`VAT ${vat.name} texture is ${pixels.width}x${pixels.height}, expected ${width}x${rows}`);
    }
    const out = new Float32Array(width * rows * 3);
    for (let i = 0; i < width * rows; i++) {
        for (let axis = 0; axis < 3; axis++) {
            out[i * 3 + axis] = map(pixels.data[i * 4 + axis] / 255, axis);
        }
    }
    return out;
}

export async function loadVat(resolve: AssetResolver, url: string): Promise<Vat> {
    const response = await fetch(resolve(url));
    if (!response.ok) throw new Error(`Failed to load VAT ${url}: ${response.status}`);
    const vat: VatDefinition = await response.json();
    if (vat.vertex_count <= 0 || vat.frame_count <= 0) throw new Error(`VAT ${vat.name} is empty`);
    if (!vat.textures?.position) throw new Error(`VAT ${vat.name} has no position texture`);

    const min = vat.bounds_min;
    const max = vat.bounds_max;
    const [positionPixels, normalPixels] = await Promise.all([
        loadPixels(resolve(vat.textures.position, url)),
        vat.textures.normal ? loadPixels(resolve(vat.textures.normal, url)) : Promise.resolve(null),
    ]);

    const locators = new Map<string, Locator>();
    for (const [name, locator] of Object.entries(vat.locators ?? {})) {
        if (locator.positions.length !== vat.frame_count || locator.rotations.length !== vat.frame_count) continue;
        locators.set(name, {
            positions: new Float32Array(locator.positions.flat()),
            rotations: new Float32Array(locator.rotations.flat()),
        });
    }

    return {
        name: vat.name,
        vertexCount: vat.vertex_count,
        frameCount: vat.frame_count,
        fps: vat.fps,
        offsets: decode(positionPixels, vat, (e, axis) => min[axis] + e * (max[axis] - min[axis])),
        normals: normalPixels ? decode(normalPixels, vat, e => e * 2 - 1) : null,
        locators,
        keyframes: (vat.keyframes ?? [])
            .filter(k => k.type === "particle" && k.effect)
            .map(k => ({frame: k.frame - vat.start_frame, effect: k.effect!, locator: k.locator ?? null}))
            .filter(k => k.frame >= 0 && k.frame < vat.frame_count),
    };
}
