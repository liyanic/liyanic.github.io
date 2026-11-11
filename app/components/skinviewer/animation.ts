import { PlayerObject } from "./model";

export abstract class PlayerAnimation {
	speed: number = 1.0;

	paused: boolean = false;

	progress: number = 0;

	protected abstract animate(player: PlayerObject, delta: number): void;

	update(player: PlayerObject, deltaTime: number): void {
		if (this.paused) {
			return;
		}
		const delta = deltaTime * this.speed;
		this.animate(player, delta);
		this.progress += delta;
	}
}

export class FunctionAnimation extends PlayerAnimation {
	fn: (player: PlayerObject, progress: number, delta: number) => void;

	constructor(fn: (player: PlayerObject, progress: number, delta: number) => void) {
		super();
		this.fn = fn;
	}

	protected animate(player: PlayerObject, delta: number): void {
		this.fn(player, this.progress, delta);
	}
}

export class IdleAnimation extends PlayerAnimation {
	protected animate(player: PlayerObject): void {
		const age = this.progress * 20;

		const armZ = Math.cos(age * 0.09) * 0.05 + 0.05;
		const armX = Math.sin(age * 0.067) * 0.05;
		player.skin.leftArm.rotation.z = armZ;
		player.skin.rightArm.rotation.z = -armZ;
		player.skin.leftArm.rotation.x = -armX;
		player.skin.rightArm.rotation.x = armX;

		const basicCapeRotationX = Math.PI * 0.06;
		player.cape.rotation.x = Math.sin(age * 0.05) * 0.04 + basicCapeRotationX;
	}
}

export class WalkingAnimation extends PlayerAnimation {

	headBobbing: boolean = true;

	protected animate(player: PlayerObject): void {
		const t = this.progress * 8;

		player.skin.leftLeg.rotation.x = Math.sin(t) * 0.5;
		player.skin.rightLeg.rotation.x = Math.sin(t + Math.PI) * 0.5;

		player.skin.leftArm.rotation.x = Math.sin(t + Math.PI) * 0.5;
		player.skin.rightArm.rotation.x = Math.sin(t) * 0.5;
		const basicArmRotationZ = Math.PI * 0.02;
		player.skin.leftArm.rotation.z = Math.cos(t) * 0.03 + basicArmRotationZ;
		player.skin.rightArm.rotation.z = Math.cos(t + Math.PI) * 0.03 - basicArmRotationZ;

		if (this.headBobbing) {
			player.skin.head.rotation.y = Math.sin(t / 4) * 0.2;
			player.skin.head.rotation.x = Math.sin(t / 5) * 0.1;
		} else {
			player.skin.head.rotation.y = 0;
			player.skin.head.rotation.x = 0;
		}

		const basicCapeRotationX = Math.PI * 0.06;
		player.cape.rotation.x = Math.sin(t / 1.5) * 0.06 + basicCapeRotationX;
	}
}

export class RunningAnimation extends PlayerAnimation {
	protected animate(player: PlayerObject): void {
		const t = this.progress * 15 + Math.PI * 0.5;

		player.skin.leftLeg.rotation.x = Math.cos(t + Math.PI) * 1.3;
		player.skin.rightLeg.rotation.x = Math.cos(t) * 1.3;

		player.skin.leftArm.rotation.x = Math.cos(t) * 1.5;
		player.skin.rightArm.rotation.x = Math.cos(t + Math.PI) * 1.5;
		const basicArmRotationZ = Math.PI * 0.1;
		player.skin.leftArm.rotation.z = Math.cos(t) * 0.1 + basicArmRotationZ;
		player.skin.rightArm.rotation.z = Math.cos(t + Math.PI) * 0.1 - basicArmRotationZ;

		player.position.y = Math.cos(t * 2);
		player.position.x = Math.cos(t) * 0.15;
		player.rotation.z = Math.cos(t + Math.PI) * 0.01;

		const basicCapeRotationX = Math.PI * 0.3;
		player.cape.rotation.x = Math.sin(t * 2) * 0.1 + basicCapeRotationX;
	}
}

function clamp(num: number, min: number, max: number): number {
	return num <= min ? min : num >= max ? max : num;
}

export class FlyingAnimation extends PlayerAnimation {
	protected animate(player: PlayerObject): void {

		const t = this.progress > 0 ? this.progress * 20 : 0;
		const startProgress = clamp((t * t) / 100, 0, 1);

		player.rotation.x = (startProgress * Math.PI) / 2;
		player.skin.head.rotation.x = startProgress > 0.5 ? Math.PI / 4 - player.rotation.x : 0;

		const basicArmRotationZ = Math.PI * 0.25 * startProgress;
		player.skin.leftArm.rotation.z = basicArmRotationZ;
		player.skin.rightArm.rotation.z = -basicArmRotationZ;

		const elytraRotationX = 0.34906584;
		const elytraRotationZ = Math.PI / 2;
		const interpolation = Math.pow(0.9, t);
		player.elytra.leftWing.rotation.x = elytraRotationX + interpolation * (0.2617994 - elytraRotationX);
		player.elytra.leftWing.rotation.z = elytraRotationZ + interpolation * (0.2617994 - elytraRotationZ);
		player.elytra.updateRightWing();
	}
}

export class WaveAnimation extends PlayerAnimation {

    whichArm: string;

    constructor(whichArm: 'left' | 'right' = 'left') {
        super();
        this.whichArm = whichArm;
    }

    protected animate(player: PlayerObject): void {
        const t = this.progress * 2 * Math.PI * 0.5;

        const targetArm = this.whichArm === 'left' ? player.skin.leftArm : player.skin.rightArm;
        targetArm.rotation.x = 180
        targetArm.rotation.z = Math.sin(t) * 0.5;
    }
}
