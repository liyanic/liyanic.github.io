import {CanvasTexture, NearestFilter, RepeatWrapping, type Texture} from "three";

interface DecodedFrame {
    image: CanvasImageSource & { displayWidth: number; displayHeight: number; close(): void };
}

interface ImageDecoderLike {
    tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
    decode(options: { frameIndex: number }): Promise<DecodedFrame>;
    close(): void;
}

type ImageDecoderConstructor = new (init: { data: ArrayBuffer; type: string }) => ImageDecoderLike;

function sniffType(bytes: Uint8Array): string {
    const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
    if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
    if (ascii(0, 3) === "GIF") return "image/gif";
    return "image/png";
}

function toCanvas(image: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return canvas;
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
    return response.arrayBuffer();
}

async function loadFrames(url: string): Promise<HTMLCanvasElement[]> {
    const data = await fetchBuffer(url);
    const type = sniffType(new Uint8Array(data, 0, Math.min(16, data.byteLength)));
    const Decoder = (globalThis as unknown as { ImageDecoder?: ImageDecoderConstructor }).ImageDecoder;

    if (Decoder) {
        const decoder = new Decoder({data, type});
        try {
            await decoder.tracks.ready;
            const count = decoder.tracks.selectedTrack?.frameCount ?? 1;
            const frames: HTMLCanvasElement[] = [];
            for (let i = 0; i < count; i++) {
                const {image} = await decoder.decode({frameIndex: i});
                frames.push(toCanvas(image, image.displayWidth, image.displayHeight));
                image.close();
            }
            return frames;
        } finally {
            decoder.close();
        }
    }

    const bitmap = await createImageBitmap(new Blob([data], {type}));
    const canvas = toCanvas(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    return [canvas];
}

export async function loadPixels(url: string): Promise<ImageData> {
    const data = await fetchBuffer(url);
    const bitmap = await createImageBitmap(new Blob([data]), {
        colorSpaceConversion: "none",
        premultiplyAlpha: "none",
    });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", {willReadFrequently: true})!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return context.getImageData(0, 0, canvas.width, canvas.height);
}

function hasPartialAlpha(canvas: HTMLCanvasElement): boolean {
    const {data} = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] !== 0 && data[i] !== 255) return true;
    }
    return false;
}

export function isTranslucent(texture: Texture | null | undefined): boolean {
    return texture?.userData.translucent === true;
}

function pixelTexture(canvas: HTMLCanvasElement): Texture {
    const texture = new CanvasTexture(canvas);
    texture.userData.translucent = hasPartialAlpha(canvas);
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    return texture;
}

export async function loadTextureFrames(url: string): Promise<Texture[]> {
    return (await loadFrames(url)).map(pixelTexture);
}
