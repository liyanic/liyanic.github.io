import {
    AdditiveBlending,
    BufferAttribute,
    BufferGeometry,
    Color,
    MathUtils,
    Matrix4,
    type PerspectiveCamera,
    Points,
    Quaternion,
    ShaderMaterial,
    Vector2,
    Vector3,
    type WebGLRenderer,
} from "three";
import type {ParticleEffectDefinition} from "./types";

const SPRITE_COLORS: Record<string, string> = {
    "minecraft:flame": "#ff9a2e",
    "minecraft:small_flame": "#ff9a2e",
    "minecraft:soul_fire_flame": "#4fe3ff",
    "minecraft:end_rod": "#fff6d8",
    "minecraft:heart": "#ff3b5c",
    "minecraft:happy_villager": "#4bd84b",
    "minecraft:enchant": "#b07cff",
    "minecraft:portal": "#a040ff",
    "minecraft:snowflake": "#e8f6ff",
    "minecraft:smoke": "#8a8a8a",
    "minecraft:electric_spark": "#aef4ff",
};

const MAX_PARTICLES = 1024;
const PIXELS_PER_BLOCK = 16;

interface Particle {
    effect: ParticleEffectDefinition;
    position: Vector3;
    velocity: Vector3;
    age: number;
    lifetime: number;
    size: number;
    color: Color;
    emitter: (() => Matrix4) | null;
}

export class ParticleSystem extends Points<BufferGeometry, ShaderMaterial> {
    private readonly particles: Particle[] = [];
    private readonly counts = new Map<ParticleEffectDefinition, number>();
    private readonly scratch = new Vector3();
    private readonly drawSize = new Vector2();

    constructor() {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
        geometry.setAttribute("color", new BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
        geometry.setAttribute("size", new BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
        geometry.setAttribute("alpha", new BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
        geometry.setDrawRange(0, 0);

        const material = new ShaderMaterial({
            uniforms: {scale: {value: 1}},
            vertexShader: `
                attribute float size;
                attribute float alpha;
                attribute vec3 color;
                uniform float scale;
                varying float vAlpha;
                varying vec3 vColor;
                void main() {
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * scale / -mv.z;
                    gl_Position = projectionMatrix * mv;
                    vAlpha = alpha;
                    vColor = color;
                }`,
            fragmentShader: `
                varying float vAlpha;
                varying vec3 vColor;
                void main() {
                    float d = length(gl_PointCoord - 0.5) * 2.0;
                    if (d > 1.0) discard;
                    gl_FragColor = vec4(vColor, vAlpha * (1.0 - d * d));
                }`,
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
        });
        super(geometry, material);
        this.frustumCulled = false;
        this.name = "cosmeticParticles";
    }

    override onBeforeRender = (renderer: WebGLRenderer, _scene: unknown, camera: unknown) => {
        const fov = (camera as PerspectiveCamera).fov ?? 50;
        renderer.getDrawingBufferSize(this.drawSize);
        this.material.uniforms.scale.value = this.drawSize.y / (2 * Math.tan(MathUtils.degToRad(fov) / 2));
    };

    spawn(effect: ParticleEffectDefinition, matrix: Matrix4, emitter: () => Matrix4) {
        const count = this.counts.get(effect) ?? 0;
        const spawn = Math.min(effect.count, effect["max-particles"] - count, MAX_PARTICLES - this.particles.length);
        if (spawn <= 0) return;
        this.counts.set(effect, count + spawn);

        const rotation = new Quaternion();
        matrix.decompose(new Vector3(), rotation, new Vector3());
        const direction = new Vector3(...(effect.direction ?? [0, 1, 0]));
        if (direction.lengthSq() === 0) direction.set(0, 1, 0);
        direction.normalize();
        const box = effect["spawn-box"] ?? [0, 0, 0];
        const color = new Color(SPRITE_COLORS[effect.sprite] ?? "#ffffff");

        for (let i = 0; i < spawn; i++) {
            const offset = new Vector3(
                (Math.random() * 2 - 1) * box[0],
                (Math.random() * 2 - 1) * box[1],
                (Math.random() * 2 - 1) * box[2],
            );
            const velocity = spread(direction, MathUtils.degToRad(effect["spread-degrees"] ?? 0))
                .multiplyScalar(MathUtils.randFloat(effect.speed.min, effect.speed.max));

            const particle: Particle = {
                effect,
                position: offset,
                velocity,
                age: 0,
                lifetime: MathUtils.randInt(effect["lifetime-ticks"].min, effect["lifetime-ticks"].max) / 20,
                size: MathUtils.randFloat(effect.size.min, effect.size.max),
                color,
                emitter: effect["local-space"] ? emitter : null,
            };
            if (!particle.emitter) {
                particle.position.applyMatrix4(matrix).divideScalar(PIXELS_PER_BLOCK);
                particle.velocity.applyQuaternion(rotation);
            }
            this.particles.push(particle);
        }
    }

    update(dt: number) {
        const position = this.geometry.getAttribute("position") as BufferAttribute;
        const color = this.geometry.getAttribute("color") as BufferAttribute;
        const size = this.geometry.getAttribute("size") as BufferAttribute;
        const alpha = this.geometry.getAttribute("alpha") as BufferAttribute;
        const ticks = dt * 20;

        let n = 0;
        for (const particle of this.particles) {
            particle.age += dt;
            if (particle.age >= particle.lifetime) {
                this.counts.set(particle.effect, (this.counts.get(particle.effect) ?? 1) - 1);
                continue;
            }
            particle.velocity.y -= (particle.effect.gravity ?? 0) * ticks;
            particle.position.addScaledVector(particle.velocity, ticks);

            if (particle.emitter) this.scratch.copy(particle.position).applyMatrix4(particle.emitter());
            else this.scratch.copy(particle.position).multiplyScalar(PIXELS_PER_BLOCK);
            position.setXYZ(n, this.scratch.x, this.scratch.y, this.scratch.z);
            color.setXYZ(n, particle.color.r, particle.color.g, particle.color.b);
            size.setX(n, particle.size * PIXELS_PER_BLOCK);
            alpha.setX(n, particle.effect["fade-out"] ? 1 - particle.age / particle.lifetime : 1);
            this.particles[n++] = particle;
        }
        this.particles.length = n;
        this.geometry.setDrawRange(0, n);
        position.needsUpdate = color.needsUpdate = size.needsUpdate = alpha.needsUpdate = true;
    }

    reset() {
        this.particles.length = 0;
        this.counts.clear();
        this.geometry.setDrawRange(0, 0);
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
    }
}

function spread(direction: Vector3, angle: number): Vector3 {
    if (angle <= 0) return direction.clone();
    const cos = MathUtils.lerp(Math.cos(angle), 1, Math.random());
    const sin = Math.sqrt(1 - cos * cos);
    const phi = Math.random() * Math.PI * 2;
    const local = new Vector3(Math.cos(phi) * sin, cos, Math.sin(phi) * sin);
    return local.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction));
}
