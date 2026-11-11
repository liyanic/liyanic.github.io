import {type RefObject, useEffect, useRef, useState} from "react";
import type * as skinview3d from "./skinviewer/skinview3d";

type SkinView3d = typeof skinview3d;
type Loaded = { lib: SkinView3d, viewer: skinview3d.SkinViewer };

const DEFAULT_UUID = "9b600729b6154adfb26792994a29e2ae";

interface Props {
    uuid?: string;
    autoRotate?: boolean;
    rotation?: number;
    pitch?: number;
    debug?: boolean;
    nameTag?: string;
    zoomable?: boolean;
    tiltable?: boolean;
    background?: number | null;
    className?: string;
    followMouse?: boolean;
    lookAt?: RefObject<HTMLElement | null>;
    punch?: number;
    island?: boolean;
}

const MAX_HEAD_YAW = 70 * Math.PI / 180;
const MAX_HEAD_PITCH = 40 * Math.PI / 180;

const NAME_TAG_MAX_WIDTH = 20;
const PUNCH_DURATION = 6 / 20; // 6 Ticks wie in Minecraft
const DEFAULT_ZOOM = 0.75;

const ISLAND_WIDTH = 60;
const ISLAND_MARGIN = 4;
const FLOAT_HEIGHT = 1.2;
const FLOAT_PERIOD = 4000;
const clamp = (value: number, max: number) => Math.max(-max, Math.min(max, value));

const toDegrees = (radians: number) => Math.round(radians * 180 / Math.PI * 10) / 10;

export default function PlayerPreview({uuid, autoRotate = true, rotation = 0, pitch = 0, debug = false, nameTag, zoomable = true, tiltable = true, background = null, className = "", followMouse = false, lookAt, punch = 0, island = false}: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const viewer = loaded?.viewer;
    const [error, setError] = useState(false);

    useEffect(() => {
        const container = containerRef.current!;
        const canvas = canvasRef.current!;
        let cleanup: (() => void) | undefined;
        let cancelled = false;

        import("./skinviewer/skinview3d").then((lib) => {
            if (cancelled) return;
            const viewer = new lib.SkinViewer({
                canvas,
                width: Math.max(container.clientWidth, 1),
                height: Math.max(container.clientHeight, 1),
                fov: 70,
                zoom: DEFAULT_ZOOM,
            });
            viewer.autoRotateSpeed = 0.25;
            viewer.animation = new lib.IdleAnimation();
            setLoaded({lib, viewer});

            const observer = new ResizeObserver(() => {
                if (container.clientWidth > 0 && container.clientHeight > 0) {
                    viewer.setSize(container.clientWidth, container.clientHeight);
                    viewer.render();
                }
            });
            observer.observe(container);
            cleanup = () => {
                observer.disconnect();
                viewer.dispose();
            };
        });

        return () => {
            cancelled = true;
            cleanup?.();
            setLoaded(null);
        };
    }, []);

    useEffect(() => {
        if (viewer) viewer.background = background;
    }, [viewer, background]);

    useEffect(() => {
        if (!viewer) return;
        const pitchRadians = pitch * Math.PI / 180;
        viewer.playerWrapper.rotation.y = rotation * Math.PI / 180;
        viewer.camera.position.set(0, Math.sin(pitchRadians), Math.cos(pitchRadians));
        viewer.adjustCameraDistance();
        viewer.controls.update();
    }, [viewer, rotation, pitch]);

    useEffect(() => {
        if (!loaded) return;
        const {lib, viewer} = loaded;
        viewer.nameTag = nameTag ? new lib.NameTagObject(nameTag, {font: "48px MinecraftFont", maxWidth: NAME_TAG_MAX_WIDTH}) : null;
        return () => {
            const tag = viewer.nameTag;
            tag?.material.map?.dispose();
            tag?.material.dispose();
        };
    }, [loaded, nameTag]);

    useEffect(() => {
        if (!loaded || !island) return;
        const {lib, viewer} = loaded;
        const wrapper = viewer.playerWrapper;
        let raf = 0;

        const top = nameTag ? 22 : 16;
        const bottom = lib.ISLAND_TOP - lib.ISLAND_DEPTH;
        const center = (top + bottom) / 2;
        let aspect = 0;
        const fit = () => {
            aspect = viewer.camera.aspect;
            const tan = Math.tan(viewer.fov / 360 * Math.PI);
            const distance = Math.max((top - bottom + 2 * ISLAND_MARGIN) / (2 * tan), ISLAND_WIDTH / (2 * tan * aspect));
            viewer.zoom = 16.5 / tan / (distance - 4.5);
        };

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const tick = (now: number) => {
            if (viewer.camera.aspect !== aspect) fit();
            wrapper.position.y = -center + (reducedMotion ? 0 : Math.sin(now / FLOAT_PERIOD * 2 * Math.PI) * FLOAT_HEIGHT);
            raf = requestAnimationFrame(tick);
        };

        const created = lib.createIsland(null);
        wrapper.add(created.island);
        raf = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(raf);
            wrapper.remove(created.island);
            created.dispose();
            wrapper.position.y = 0;
            viewer.zoom = DEFAULT_ZOOM;
        };
    }, [loaded, island, nameTag]);

    useEffect(() => {
        if (viewer) viewer.controls.enableZoom = zoomable;
    }, [viewer, zoomable]);

    useEffect(() => {
        if (!viewer) return;
        const controls = viewer.controls;
        const polar = Math.PI / 2 - pitch * Math.PI / 180;
        controls.minPolarAngle = tiltable ? 0 : polar;
        controls.maxPolarAngle = tiltable ? Math.PI : polar;
        controls.update();
    }, [viewer, tiltable, pitch]);

    useEffect(() => {
        if (!debug || !viewer) return;
        const log = () => {
            const yaw = toDegrees(viewer.playerWrapper.rotation.y - viewer.controls.getAzimuthalAngle());
            const normalizedYaw = Math.round((((yaw + 180) % 360 + 360) % 360 - 180) * 10) / 10;
            const cameraPitch = toDegrees(Math.PI / 2 - viewer.controls.getPolarAngle());
            console.log(`[PlayerPreview] rotation={${normalizedYaw}} pitch={${cameraPitch}}`);
        };
        viewer.controls.addEventListener("end", log);
        return () => viewer.controls.removeEventListener("end", log);
    }, [viewer, debug]);

    const lookAtRef = useRef(lookAt);
    lookAtRef.current = lookAt;
    const looking = followMouse || lookAt !== undefined;

    useEffect(() => {
        if (!viewer || !looking) return;
        const head = viewer.playerObject.skin.head;
        const canvas = canvasRef.current!;

        const target = head.position.clone();
        const headPos = head.position.clone();
        const dir = head.position.clone();
        let mouse: { x: number, y: number } | null = null;
        let raf = 0;

        const onMove = (e: MouseEvent) => { mouse = {x: e.clientX, y: e.clientY}; };

        const tick = () => {
            let yaw = 0, pitch = 0;
            const element = lookAtRef.current?.current;
            const box = element?.getBoundingClientRect();
            const point = box ? {x: box.left + box.width / 2, y: box.top + box.height / 2} : followMouse ? mouse : null;
            if (point) {
                const rect = canvas.getBoundingClientRect();
                const camera = viewer.camera;
                // ray from the camera through the mouse, ending a bit in front of the head
                target.set((point.x - rect.left) / rect.width * 2 - 1, 1 - (point.y - rect.top) / rect.height * 2, 0.5)
                    .unproject(camera);
                dir.copy(target).sub(camera.position).normalize();
                head.getWorldPosition(headPos);
                target.copy(camera.position).addScaledVector(dir, camera.position.distanceTo(headPos) * 0.6);
                head.parent!.worldToLocal(target).sub(head.position);
                yaw = clamp(Math.atan2(target.x, target.z), MAX_HEAD_YAW);
                pitch = clamp(-Math.atan2(target.y, Math.hypot(target.x, target.z)), MAX_HEAD_PITCH);
            }
            head.rotation.y += (yaw - head.rotation.y) * 0.15;
            head.rotation.x += (pitch - head.rotation.x) * 0.15;
            raf = requestAnimationFrame(tick);
        };

        window.addEventListener("mousemove", onMove);
        raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("mousemove", onMove);
            head.rotation.x = 0;
            head.rotation.y = 0;
        };
    }, [viewer, followMouse, looking]);

    useEffect(() => {
        if (!viewer || !punch) return;
        const {rightArm, leftArm, body, head} = viewer.playerObject.skin;
        const baseRightZ = rightArm.rotation.z;
        const start = performance.now();
        let raf = 0;
        const animation = viewer.animation;
        if (animation) animation.paused = true;
        rightArm.rotation.order = "ZYX";
        leftArm.rotation.order = "ZYX";

        const tick = (now: number) => {
            const attackTime = Math.min(1, (now - start) / 1000 / PUNCH_DURATION);
            const bodyY = Math.sin(Math.sqrt(attackTime) * Math.PI * 2) * 0.2;

            body.rotation.y = -bodyY;
            rightArm.position.set(-Math.cos(bodyY) * 5, rightArm.position.y, -Math.sin(bodyY) * 5);
            leftArm.position.set(Math.cos(bodyY) * 5, leftArm.position.y, Math.sin(bodyY) * 5);

            let f = 1 - attackTime;
            f *= f;
            f *= f;
            f = 1 - f;
            const f1 = Math.sin(f * Math.PI);
            const f2 = Math.sin(attackTime * Math.PI) * -(head.rotation.x - 0.7) * 0.75;

            rightArm.rotation.x = -(f1 * 1.2 + f2);
            rightArm.rotation.y = -bodyY * 3;
            rightArm.rotation.z = baseRightZ + Math.sin(attackTime * Math.PI) * 0.4;
            leftArm.rotation.x = bodyY;
            leftArm.rotation.y = -bodyY;

            if (attackTime < 1) raf = requestAnimationFrame(tick);
            else if (animation) animation.paused = false;
        };
        raf = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(raf);
            body.rotation.y = 0;
            rightArm.position.set(-5, rightArm.position.y, 0);
            leftArm.position.set(5, leftArm.position.y, 0);
            rightArm.rotation.set(0, 0, baseRightZ, "XYZ");
            leftArm.rotation.set(0, 0, leftArm.rotation.z, "XYZ");
            if (animation) animation.paused = false;
        };
    }, [viewer, punch]);

    useEffect(() => {
        if (!viewer) return;
        viewer.autoRotate = autoRotate;
    }, [viewer, autoRotate]);

    useEffect(() => {
        if (!viewer) return;
        setError(false);
        viewer.loadSkin(`https://minecraftapi.net/api/v2/profile/${(uuid || DEFAULT_UUID).replace(/-/g, "")}/skin`)
            .catch(() => setError(true));
    }, [viewer, uuid]);

    return (
        <div ref={containerRef} className={`relative h-full w-full ${className}`}>
            <canvas ref={canvasRef} className="block h-full w-full"/>
            {error && (
                <div className="absolute bottom-2 left-2 right-2 rounded bg-red-900/80 px-2 py-1 text-xs text-red-100">
                    <p>Failed to load skin</p>
                </div>
            )}
        </div>
    );
}
