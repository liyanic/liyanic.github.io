import {Quaternion, Vector3} from "three";
import {
    type AnimationDefinition,
    type CosmeticDefinition,
    type EmitterDefinition,
    isStateEvent,
    type Vec3,
} from "./types";
import type {Vat} from "./vat";


const MAX_LAYERS = 4;
const ZERO: Vec3 = {x: 0, y: 0, z: 0};

type ParticleSink = (effect: string, locator: string | null, offset: Vec3) => void;

export interface PoseLayer {
    vat: Vat;
    frame: number;
    weight: number;
    loop: boolean;
}

export interface AnimationPose {
    layers: PoseLayer[];
    textureFrameTime: number;
}

class Context {
    tickCount = 0;
    private startOrder = 0;

    constructor(readonly sink: ParticleSink) {
    }

    roll(probability: number): boolean {
        if (probability >= 1) return true;
        if (probability <= 0) return false;
        return Math.random() < probability;
    }

    nextStartOrder(): number {
        return this.startOrder++;
    }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

class AnimationLayer {
    private readonly onEnd: string;
    private readonly whileActive: boolean;
    private readonly frameCount: number;
    private readonly framesPerTick: number;

    active = false;
    private blendingOut = false;
    private weight = 0;
    private prevWeight = 0;
    private rate = 0;
    private playhead = 0;
    private prevPlayhead = 0;
    order = 0;
    effective = 0;
    selected = false;

    constructor(readonly def: AnimationDefinition, readonly vat: Vat | null) {
        this.onEnd = def["on-end"] ?? "loop";
        this.whileActive = (def["while-active"] ?? false) && isStateEvent(def.event);
        this.frameCount = vat?.frameCount ?? 0;
        this.framesPerTick = vat ? vat.fps / 20 : 0;
    }

    looping(): boolean {
        return this.onEnd === "loop" && this.vat !== null;
    }

    visible(): boolean {
        return this.active || this.prevWeight > 0;
    }

    weightAt(partialTick: number): number {
        return lerp(this.prevWeight, this.weight, partialTick);
    }

    frame(partialTick: number): number {
        let frame = lerp(this.prevPlayhead, this.playhead, partialTick);
        if (this.looping()) {
            frame -= Math.floor(frame / this.frameCount) * this.frameCount;
            return frame >= this.frameCount ? 0 : frame;
        }
        return Math.min(Math.max(frame, 0), this.frameCount - 1);
    }

    tick(active: Set<string>, started: Set<string>, context: Context) {
        this.prevWeight = this.weight;
        if (this.looping() && this.playhead >= this.frameCount) this.playhead -= this.frameCount;
        this.prevPlayhead = this.playhead;

        const wasBlendingOut = this.blendingOut;
        let advanced = false;
        if (started.has(this.def.event) && context.roll(this.def.probability ?? 1)) {
            this.start(context);
        } else if (this.active && this.vat) {
            this.playhead += this.framesPerTick;
            if (!this.looping()) this.playhead = Math.min(this.playhead, this.frameCount);
            advanced = true;
        }

        if (this.active && !this.blendingOut && this.shouldEnd(active.has(this.def.event), advanced)) {
            const ticks = this.def["blend-out-ticks"] ?? 0;
            this.blendingOut = true;
            this.rate = ticks > 0 ? this.weight / ticks : Number.MAX_VALUE;
        }
        if (advanced && !wasBlendingOut) {
            this.fireKeyframes(this.blendingOut ? this.frameCount : Number.MAX_VALUE, context);
        }
        this.updateWeight();
    }

    private start(context: Context) {
        this.active = true;
        this.blendingOut = false;
        this.order = context.nextStartOrder();
        this.playhead = 0;
        this.prevPlayhead = 0;
        const ticks = this.def["blend-in-ticks"] ?? 0;
        this.rate = ticks > 0 && this.weight < 1 ? (1 - this.weight) / ticks : 1;
        for (const keyframe of this.vat?.keyframes ?? []) {
            if (keyframe.frame === 0) context.sink(keyframe.effect, keyframe.locator, ZERO);
        }
    }

    private shouldEnd(eventActive: boolean, advanced: boolean): boolean {
        const wrapped = advanced && this.looping() && this.playhead >= this.frameCount;
        const passDone = this.vat === null || (this.looping() ? wrapped : this.playhead >= this.frameCount);
        if (this.onEnd === "stop" && this.vat && passDone) return true;
        if (this.whileActive) return !eventActive;
        return !eventActive && passDone;
    }

    private updateWeight() {
        if (this.blendingOut) {
            this.weight -= this.rate;
            if (this.weight <= 0) {
                this.weight = 0;
                this.active = false;
                this.blendingOut = false;
            }
        } else if (this.active && this.weight < 1) {
            this.weight = Math.min(1, this.weight + this.rate);
        }
    }

    private fireKeyframes(limit: number, context: Context) {
        const prev = this.prevPlayhead;
        const cur = this.playhead;
        for (const keyframe of this.vat!.keyframes) {
            let crossed: boolean;
            if (this.looping()) {
                let candidate = keyframe.frame;
                while (candidate <= prev) candidate += this.frameCount;
                crossed = candidate <= cur && candidate < limit;
            } else {
                const last = this.frameCount - 1;
                crossed = Math.min(prev, last) < keyframe.frame && keyframe.frame <= Math.min(cur, last);
            }
            if (crossed) context.sink(keyframe.effect, keyframe.locator, ZERO);
        }
    }
}

class Emitter {
    private readonly whileActive: boolean;
    private lastSpawn = -Infinity;
    private intervalCounter = 0;

    constructor(private readonly def: EmitterDefinition) {
        this.whileActive = (def["while-active"] ?? false) && isStateEvent(def.event);
    }

    tick(active: Set<string>, started: Set<string>, context: Context) {
        if (started.has(this.def.event)) {
            this.intervalCounter = 0;
            this.trySpawn(context);
        } else if (this.whileActive && active.has(this.def.event)) {
            if (++this.intervalCounter >= (this.def["interval-ticks"] ?? 0)) {
                this.intervalCounter = 0;
                this.trySpawn(context);
            }
        }
    }

    private trySpawn(context: Context) {
        if (!context.roll(this.def.probability ?? 1)) return;
        if (context.tickCount - this.lastSpawn < (this.def["cooldown-ticks"] ?? 0)) return;
        this.lastSpawn = context.tickCount;
        context.sink(this.def.effect, this.def.locator ?? null, this.def.offset ?? ZERO);
    }
}

export class CosmeticAnimator {
    private readonly context: Context;
    private readonly layers: AnimationLayer[];
    private readonly emitters: Emitter[];
    private sorted: AnimationLayer[] = [];
    private prevTextureTime = 0;
    private textureTime = 0;
    private previousEvents = new Set<string>();

    private readonly position = new Vector3();
    private readonly next = new Vector3();
    private readonly rotation = new Quaternion();
    private readonly nextRotation = new Quaternion();

    constructor(def: CosmeticDefinition, vats: Map<string, Vat>, sink: ParticleSink) {
        this.context = new Context(sink);
        this.layers = (def.animations ?? []).map(a => new AnimationLayer(a, a.source ? vats.get(a.source) ?? null : null));
        this.emitters = (def.particles ?? []).map(p => new Emitter(p));
    }

    tick(events: Set<string>, instant: Set<string>) {
        const active = new Set(events);
        active.add("idle");
        const started = new Set(instant);
        for (const event of active) {
            if (!this.previousEvents.has(event)) started.add(event);
        }
        this.previousEvents = active;

        this.context.tickCount++;
        for (const layer of this.layers) layer.tick(active, started, this.context);
        for (const emitter of this.emitters) emitter.tick(active, started, this.context);
        this.sorted = this.layers.filter(l => l.visible()).sort((a, b) => a.def.priority - b.def.priority || a.order - b.order);

        const strongest = this.strongest(1);
        this.prevTextureTime = this.textureTime;
        this.textureTime += (strongest?.def["texture-fps"] ?? 20) / 20;
    }

    /** eff_i = w_i * prod(1 - w_j) over the layers above i */
    private computeEffective(partialTick: number) {
        let remaining = 1;
        for (let i = this.sorted.length - 1; i >= 0; i--) {
            const weight = this.sorted[i].weightAt(partialTick);
            this.sorted[i].effective = weight * remaining;
            remaining *= 1 - weight;
        }
    }

    private strongest(partialTick: number): AnimationLayer | null {
        this.computeEffective(partialTick);
        let strongest: AnimationLayer | null = null;
        for (const layer of this.sorted) {
            if (layer.effective > 0 && (!strongest || layer.effective > strongest.effective)) strongest = layer;
        }
        return strongest;
    }

    sample(partialTick: number): AnimationPose {
        this.computeEffective(partialTick);
        const candidates = this.sorted.filter(l => l.vat && l.effective > 0);
        while (candidates.length > MAX_LAYERS) {
            let weakest = 0;
            for (let i = 1; i < candidates.length; i++) {
                if (candidates[i].effective < candidates[weakest].effective) weakest = i;
            }
            candidates.splice(weakest, 1);
        }
        return {
            layers: candidates.map(l => ({vat: l.vat!, frame: l.frame(partialTick), weight: l.effective, loop: l.looping()})),
            textureFrameTime: lerp(this.prevTextureTime, this.textureTime, partialTick),
        };
    }

    sampleLocator(name: string, pose: AnimationPose, outPosition: Vector3, outRotation: Quaternion): boolean {
        let total = 0;
        outPosition.set(0, 0, 0);
        outRotation.set(0, 0, 0, 0);
        for (const layer of pose.layers) {
            const locator = layer.vat.locators.get(name);
            if (!locator) continue;
            const frames = layer.vat.frameCount;
            let f0 = Math.floor(layer.frame);
            const t = layer.frame - f0;
            f0 = layer.loop ? ((f0 % frames) + frames) % frames : Math.min(Math.max(f0, 0), frames - 1);
            const f1 = layer.loop ? (f0 + 1) % frames : Math.min(f0 + 1, frames - 1);

            const p = locator.positions;
            this.position.set(p[f0 * 3], p[f0 * 3 + 1], p[f0 * 3 + 2]);
            this.next.set(p[f1 * 3], p[f1 * 3 + 1], p[f1 * 3 + 2]);
            outPosition.addScaledVector(this.position.lerp(this.next, t), layer.weight);

            const r = locator.rotations;
            this.rotation.set(r[f0 * 4], r[f0 * 4 + 1], r[f0 * 4 + 2], r[f0 * 4 + 3]);
            this.nextRotation.set(r[f1 * 4], r[f1 * 4 + 1], r[f1 * 4 + 2], r[f1 * 4 + 3]);
            this.rotation.slerp(this.nextRotation, t);
            let weight = layer.weight;
            if (total > 0 && outRotation.dot(this.rotation) < 0) weight = -weight;
            outRotation.set(
                outRotation.x + this.rotation.x * weight,
                outRotation.y + this.rotation.y * weight,
                outRotation.z + this.rotation.z * weight,
                outRotation.w + this.rotation.w * weight,
            );
            total += layer.weight;
        }
        if (total <= 0) {
            outRotation.identity();
            return false;
        }
        outPosition.divideScalar(total);
        outRotation.normalize();
        return true;
    }
}
