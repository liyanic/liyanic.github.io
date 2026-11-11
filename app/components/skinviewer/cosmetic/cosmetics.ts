import {
    AdditiveBlending,
    BufferAttribute,
    Color,
    DoubleSide,
    Group,
    LessEqualDepth,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Quaternion,
    ShaderMaterial,
    type Texture,
    Vector3,
} from "three";
import {
    type AssetResolver,
    type CosmeticDefinition,
    cosmeticType,
    findVariant,
    type ParticleEffectDefinition,
    type Vec3,
} from "./types";
import type {BodyPart, PlayerObject} from "../model";
import {type AnimationPose, CosmeticAnimator} from "./animator";
import {type ObjMesh, parseObj} from "./obj";
import {ParticleSystem} from "./particles";
import {isEmissive, type MtlMaterial, parseMtl} from "./mtl";
import {isTranslucent, loadTextureFrames} from "./texture";
import {loadVat, type Vat} from "./vat";

const PIXELS_PER_BLOCK = 16;
const TICK_SECONDS = 1 / 20;

export interface LoadedCosmetic {
    definition: CosmeticDefinition;
    textures: Map<string, Texture[]>;
    mesh: ObjMesh | null;
    materials: Map<string, MtlMaterial>;
    vats: Map<string, Vat>;
    effects: Map<string, ParticleEffectDefinition>;
}

export async function loadCosmetic(definition: CosmeticDefinition, resolve: AssetResolver): Promise<LoadedCosmetic> {
    const {assets} = definition;
    const fetchJson = async (url: string) => {
        const response = await fetch(resolve(url));
        if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
        return response.json();
    };
    const isModel = cosmeticType(definition) === "model";

    const fetchText = async (url: string) => {
        const response = await fetch(resolve(url));
        if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
        return response.text();
    };

    const [textures, mesh, materials, vats, effects] = await Promise.all([
        Promise.all(definition.variants
            .filter(v => v.textures.diffuse)
            .map(async v => [v.id, await loadTextureFrames(resolve(v.textures.diffuse!.url))] as const)),
        isModel && assets.model
            ? fetchText(assets.model.url).then(parseObj)
            : Promise.resolve(null),
        isModel && assets.mtl
            ? fetchText(assets.mtl.url).then(parseMtl)
            : Promise.resolve(new Map<string, MtlMaterial>()),
        isModel
            ? Promise.all(Object.entries(assets.animations ?? {}).map(async ([key, ref]) => [key, await loadVat(resolve, ref.url)] as const))
            : Promise.resolve([]),
        isModel
            ? Promise.all(Object.entries(assets.effects ?? {}).map(async ([key, ref]) => [key, await fetchJson(ref.url)] as const))
            : Promise.resolve([]),
    ]);

    return {
        definition,
        textures: new Map(textures),
        mesh,
        materials,
        vats: new Map(vats),
        effects: new Map(effects),
    };
}

export function disposeCosmetic(cosmetic: LoadedCosmetic) {
    cosmetic.textures.forEach(frames => frames.forEach(t => t.dispose()));
    cosmetic.mesh?.geometry.dispose();
}

function localMatrix(def: CosmeticDefinition, dest = new Matrix4()): Matrix4 {
    const v = (vec: Vec3 | undefined, fallback = 0) => new Vector3(vec?.x ?? fallback, vec?.y ?? fallback, vec?.z ?? fallback);
    const translate = (t: Vector3) => new Matrix4().makeTranslation(t.x, t.y, t.z);
    dest.identity();

    const transform = def.transform;
    if (transform) {
        const pivot = v(transform.pivot);
        const rotation = v(transform["rotation-degrees"]).multiplyScalar(Math.PI / 180);
        let order = (transform["rotation-order"] ?? "XYZ").toUpperCase();
        if (order.length !== 3 || !["X", "Y", "Z"].every(axis => order.includes(axis))) order = "XYZ";

        dest.multiply(translate(v(transform.position).add(pivot)));

        for (let i = 2; i >= 0; i--) {
            const axis = order[i];
            const angle = axis === "X" ? rotation.x : axis === "Y" ? rotation.y : rotation.z;
            dest.multiply(axis === "X" ? new Matrix4().makeRotationX(angle)
                : axis === "Y" ? new Matrix4().makeRotationY(angle)
                    : new Matrix4().makeRotationZ(angle));
        }
        const scale = v(transform.scale, 1);
        dest.multiply(new Matrix4().makeScale(scale.x, scale.y, scale.z));
        dest.multiply(translate(pivot.clone().negate()));
    }

    const mirror = def.mirror;
    if (mirror?.enabled) {
        const pivot = v(mirror.pivot);
        dest.multiply(translate(pivot));
        dest.multiply(new Matrix4().makeScale(mirror.axis === "x" ? -1 : 1, mirror.axis === "y" ? -1 : 1, mirror.axis === "z" ? -1 : 1));
        dest.multiply(translate(pivot.clone().negate()));
    }
    return dest;
}

function boneOf(player: PlayerObject, bone: string | undefined): BodyPart {
    const skin = player.skin;
    switch (bone) {
        case "head": return skin.head;
        case "left_arm": return skin.leftArm;
        case "right_arm": return skin.rightArm;
        case "left_leg": return skin.leftLeg;
        case "right_leg": return skin.rightLeg;
        default: return skin.body;
    }
}

function textureFrame(frames: Texture[] | undefined, time: number): Texture | null {
    if (!frames || frames.length === 0) return null;
    return frames[((Math.floor(time) % frames.length) + frames.length) % frames.length];
}

abstract class CosmeticInstance {
    readonly animator: CosmeticAnimator;
    protected readonly frames: Texture[] | undefined;

    protected constructor(readonly cosmetic: LoadedCosmetic, variant: string | null | undefined) {
        const def = cosmetic.definition;
        this.frames = cosmetic.textures.get(findVariant(def, variant)?.id ?? "");
        this.animator = new CosmeticAnimator(def, cosmetic.vats, (effect, locator, offset) => this.spawn(effect, locator, offset));
    }

    get id(): string {
        return this.cosmetic.definition.meta.id;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected spawn(effect: string, locator: string | null, offset: Vec3): void {
    }

    abstract update(pose: AnimationPose): void;

    abstract dispose(): void;
}

class ModelCosmetic extends CosmeticInstance {
    private readonly attachment = new Group();
    private readonly mesh: Mesh;
    private readonly materials: (MeshStandardMaterial | MeshBasicMaterial)[];
    private readonly parts: (MtlMaterial | undefined)[];
    private map: Texture | null = null;
    private pose: AnimationPose = {layers: [], textureFrameTime: 0};
    private readonly locatorPosition = new Vector3();
    private readonly locatorRotation = new Quaternion();
    private normalsBlended = false;

    constructor(cosmetic: LoadedCosmetic, variant: string | null | undefined,
                player: PlayerObject, private readonly particles: ParticleSystem) {
        super(cosmetic, variant);
        const def = cosmetic.definition;

        const bone = boneOf(player, def.attachment?.bone);
        if (bone === player.skin.body) this.attachment.position.y = 6;
        this.attachment.scale.setScalar(PIXELS_PER_BLOCK);
        bone.add(this.attachment);

        const mesh = cosmetic.mesh!;
        this.parts = mesh.materials.map(name => (name !== null ? cosmetic.materials.get(name) : undefined));
        this.materials = this.parts.map(part => {
            const options = {
                side: DoubleSide,
                alphaTest: 0.1,
                color: new Color(...(part?.color ?? [1, 1, 1])),
                opacity: part?.dissolve ?? 1,
            };
            if (isEmissive(part)) {
                const [r, g, b] = part!.color;
                const [er, eg, eb] = part!.emissive!;
                options.color = new Color(Math.min(1, r + er), Math.min(1, g + eg), Math.min(1, b + eb));
                return new MeshBasicMaterial(options);
            }
            return new MeshStandardMaterial(options);
        });
        this.setMap(this.frames?.[0] ?? null);
        this.mesh = new Mesh(mesh.geometry.clone(), this.materials);
        this.mesh.name = def.meta.id;
        this.mesh.matrixAutoUpdate = false;
        this.mesh.frustumCulled = false;
        this.mesh.matrix.copy(localMatrix(def));
        this.mesh.visible = def.attachment?.["third-person"] !== false;
        this.attachment.add(this.mesh);
    }

    update(pose: AnimationPose) {
        this.pose = pose;
        const map = textureFrame(this.frames, pose.textureFrameTime);
        if (map && map !== this.map) this.setMap(map);
        this.applyVat(pose);
    }

    private setMap(map: Texture | null) {
        this.map = map;
        const translucentTexture = isTranslucent(map);
        this.materials.forEach((material, i) => {
            const transparent = translucentTexture || (this.parts[i]?.dissolve ?? 1) < 1;
            if (material.map !== map || material.transparent !== transparent) {
                material.map = map;
                material.transparent = transparent;
                material.needsUpdate = true;
            }
        });
    }

    private applyVat(pose: AnimationPose) {
        const {restPositions, restNormals, vatU} = this.cosmetic.mesh!;
        const position = this.mesh.geometry.getAttribute("position") as BufferAttribute;
        const normal = this.mesh.geometry.getAttribute("normal") as BufferAttribute;
        const positions = position.array as Float32Array;
        const normals = normal.array as Float32Array;
        positions.set(restPositions);

        const blendNormals = pose.layers.length > 0 && pose.layers.every(l => l.vat.normals);
        let totalWeight = 0;
        if (blendNormals) normals.fill(0);

        for (const layer of pose.layers) {
            const {vat, weight} = layer;
            const width = vat.vertexCount;
            const frames = vat.frameCount;
            const current = Math.min(Math.max(Math.floor(layer.frame), 0), frames - 1);
            const next = layer.loop ? (current + 1) % frames : Math.min(current + 1, frames - 1);
            const blend = layer.frame - Math.floor(layer.frame);
            const rowA = current * width;
            const rowB = next * width;

            for (let i = 0; i < vatU.length; i++) {
                const column = Math.min(Math.max(Math.round(vatU[i] * width), 0), width - 1);
                const a = (rowA + column) * 3;
                const b = (rowB + column) * 3;
                for (let axis = 0; axis < 3; axis++) {
                    const offset = vat.offsets[a + axis] + (vat.offsets[b + axis] - vat.offsets[a + axis]) * blend;
                    positions[i * 3 + axis] += weight * offset;
                    if (blendNormals) {
                        const n = vat.normals![a + axis] + (vat.normals![b + axis] - vat.normals![a + axis]) * blend;
                        normals[i * 3 + axis] += weight * n;
                    }
                }
            }
            totalWeight += weight;
        }

        if (blendNormals) {
            const rest = Math.max(1 - totalWeight, 0);
            for (let i = 0; i < normals.length; i += 3) {
                let x = normals[i] + restNormals[i] * rest;
                let y = normals[i + 1] + restNormals[i + 1] * rest;
                let z = normals[i + 2] + restNormals[i + 2] * rest;
                const length = Math.hypot(x, y, z);
                if (length > 1e-4) {
                    x /= length;
                    y /= length;
                    z /= length;
                } else {
                    [x, y, z] = [restNormals[i], restNormals[i + 1], restNormals[i + 2]];
                }
                normals[i] = x;
                normals[i + 1] = y;
                normals[i + 2] = z;
            }
            normal.needsUpdate = true;
        } else if (this.normalsBlended) {
            normals.set(restNormals);
            normal.needsUpdate = true;
        }
        this.normalsBlended = blendNormals;
        position.needsUpdate = true;
    }

    private emitterMatrix(locator: string | null, offset: Vec3, dest = new Matrix4()): Matrix4 {
        this.mesh.updateWorldMatrix(true, false);
        dest.copy(this.particles.matrixWorld).invert().multiply(this.mesh.matrixWorld);
        dest.multiply(new Matrix4().makeTranslation(offset.x, offset.y, offset.z));
        if (locator && this.animator.sampleLocator(locator, this.pose, this.locatorPosition, this.locatorRotation)) {
            dest.multiply(new Matrix4().compose(this.locatorPosition, this.locatorRotation, new Vector3(1, 1, 1)));
        }
        return dest;
    }

    protected override spawn(effectName: string, locator: string | null, offset: Vec3) {
        const effect = this.cosmetic.effects.get(effectName);
        if (!effect || !this.mesh.visible) return;
        const matrix = new Matrix4();
        this.particles.spawn(effect, this.emitterMatrix(locator, offset, matrix), () => this.emitterMatrix(locator, offset, matrix));
    }

    dispose() {
        this.attachment.removeFromParent();
        this.mesh.geometry.dispose();
        this.materials.forEach(m => m.dispose());
    }
}

class BackTextureCosmetic extends CosmeticInstance {
    constructor(cosmetic: LoadedCosmetic, variant: string | null | undefined, private readonly player: PlayerObject) {
        super(cosmetic, variant);
    }

    get elytra(): boolean {
        return cosmeticType(this.cosmetic.definition) === "elytra";
    }

    update(pose: AnimationPose) {
        const map = textureFrame(this.frames, pose.textureFrameTime);
        if (!map) return;
        const elytraEquipped = this.player.cosmetics.instances.some(c => c instanceof BackTextureCosmetic && c.elytra);
        if (this.elytra) {
            if (this.player.elytra.map !== map) this.player.elytra.map = map;
            this.player.backEquipment = "elytra";
        } else {
            if (this.player.cape.map !== map) this.player.cape.map = map;
            if (!elytraEquipped && this.player.elytra.map !== map) this.player.elytra.map = map;
            if (!elytraEquipped) this.player.backEquipment = "cape";
        }
    }

    dispose() {
        if (this.elytra) {
            this.player.elytra.map = null;
            if (this.player.backEquipment === "elytra") this.player.backEquipment = null;
        } else {
            this.player.cape.map = null;
            if (this.player.backEquipment === "cape") this.player.backEquipment = null;
        }
    }
}

const GLINT_VERTEX = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;

const GLINT_FRAGMENT = `
    uniform sampler2D map;
    uniform vec3 color;
    uniform float intensity;
    uniform float time;
    varying vec2 vUv;
    void main() {
        if (texture2D(map, vUv).a < 0.1) discard;
        vec2 p = vUv * 8.0;
        float a = pow(0.5 + 0.5 * sin((p.x + p.y) * 2.0 - time * 2.5), 6.0);
        float b = pow(0.5 + 0.5 * sin((p.x * 0.7 - p.y) * 1.6 + time * 1.7), 8.0);
        gl_FragColor = vec4(color * (a + b * 0.6) * intensity, 1.0);
    }`;

class SkinGlintCosmetic extends CosmeticInstance {
    private readonly material: ShaderMaterial;
    private readonly meshes: Mesh[] = [];

    constructor(cosmetic: LoadedCosmetic, variant: string | null | undefined, private readonly player: PlayerObject) {
        super(cosmetic, variant);
        const def = cosmetic.definition;
        this.material = new ShaderMaterial({
            uniforms: {
                map: {value: player.skin.map},
                color: {value: new Color(findVariant(def, variant)?.["glint-color"] ?? "#ffffff")},
                intensity: {value: def.glint?.intensity ?? 0.5},
                time: {value: 0},
            },
            vertexShader: GLINT_VERTEX,
            fragmentShader: GLINT_FRAGMENT,
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false,
            depthFunc: LessEqualDepth,
            side: DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        });

        const skin = player.skin;
        for (const part of [skin.head, skin.body, skin.leftArm, skin.rightArm, skin.leftLeg, skin.rightLeg]) {
            for (const layer of [part.innerLayer, part.outerLayer] as Mesh[]) {
                const glint = new Mesh(layer.geometry, this.material);
                glint.name = "glint";
                layer.add(glint);
                this.meshes.push(glint);
            }
        }
    }

    update() {
        this.material.uniforms.map.value = this.player.skin.map;
        this.material.uniforms.time.value = performance.now() / 1000;
        const glint = this.cosmetic.definition.glint;
        this.meshes.forEach(m => (m.visible = glint?.enabled !== false && this.player.skin.visible));
    }

    dispose() {
        this.meshes.forEach(m => m.removeFromParent());
        this.material.dispose();
    }
}

export class PlayerCosmetics {
    readonly instances: CosmeticInstance[] = [];
    readonly particles = new ParticleSystem();
    events = new Set<string>();
    private readonly instant = new Set<string>();
    private accumulator = 0;

    constructor(private readonly player: PlayerObject) {
        player.add(this.particles);
    }

    add(cosmetic: LoadedCosmetic, variant?: string | null): CosmeticInstance {
        this.remove(cosmetic.definition.meta.id);
        const type = cosmeticType(cosmetic.definition);
        let instance: CosmeticInstance;
        if (type === "cape" || type === "elytra") instance = new BackTextureCosmetic(cosmetic, variant, this.player);
        else if (type === "skin_glint") instance = new SkinGlintCosmetic(cosmetic, variant, this.player);
        else if (cosmetic.mesh) instance = new ModelCosmetic(cosmetic, variant, this.player, this.particles);
        else throw new Error(`Cosmetic ${cosmetic.definition.meta.id} has no model`);
        this.instances.push(instance);
        instance.update(instance.animator.sample(0));
        return instance;
    }

    remove(id: string) {
        const index = this.instances.findIndex(c => c.id === id);
        if (index < 0) return;
        this.instances[index].dispose();
        this.instances.splice(index, 1);
    }

    clear() {
        this.instances.forEach(c => c.dispose());
        this.instances.length = 0;
        this.particles.reset();
    }

    trigger(event: string) {
        this.instant.add(event);
    }

    update(dt: number) {
        this.accumulator += Math.min(dt, 1);
        while (this.accumulator >= TICK_SECONDS) {
            this.accumulator -= TICK_SECONDS;
            for (const instance of this.instances) instance.animator.tick(this.events, this.instant);
            this.instant.clear();
        }
        const partialTick = this.accumulator / TICK_SECONDS;
        for (const instance of this.instances) instance.update(instance.animator.sample(partialTick));
        this.particles.update(dt);
    }

    dispose() {
        this.clear();
        this.particles.removeFromParent();
        this.particles.dispose();
    }
}
