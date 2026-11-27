import { MathUtils, Vector3 } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { avatarMotionSettings as settings } from '../data/avatarMotionSettings';

const fullTurn = 2 * Math.PI;

export default function createVrmMotion(avatar: VRM) {
  const restAngle = MathUtils.degToRad(settings.rest.armLoweringDegrees);
  const swayAngle = MathUtils.degToRad(settings.armSway.amplitudeDegrees);
  const blinkInterval = Math.max(0, settings.blink.intervalSeconds);
  const blinkDuration = MathUtils.clamp(settings.blink.durationSeconds, 0, blinkInterval);
  const arms = (['left', 'right'] as const).flatMap((side) => {
    const arm = avatar.humanoid.getNormalizedBoneNode(`${side}UpperArm`);
    const elbow = avatar.humanoid.getNormalizedBoneNode(`${side}LowerArm`);
    if (!arm || !elbow || elbow.position.lengthSq() === 0) return [];

    // Use each rig's actual arm direction so the same pose works across VRM versions.
    const originalDirection = elbow.position.clone().normalize();
    const direction = Math.sign(originalDirection.x);
    const relaxedDirection = new Vector3(
      direction * Math.cos(restAngle),
      -Math.sin(restAngle),
      0,
    ).normalize();
    arm.quaternion.setFromUnitVectors(originalDirection, relaxedDirection);
    return [{ arm, direction, restingRotation: arm.quaternion.clone() }];
  });

  const expressions = avatar.expressionManager;
  expressions?.setValue('happy', settings.rest.smileWeight);
  expressions?.update();
  avatar.humanoid.update();

  return (elapsed: number, delta: number, speaking: boolean) => {
    const sway =
      settings.armSway.periodSeconds > 0
        ? Math.sin((elapsed / settings.armSway.periodSeconds) * fullTurn) * swayAngle
        : 0;
    for (const { arm, direction, restingRotation } of arms) {
      arm.quaternion.copy(restingRotation);
      arm.rotateZ(direction * sway);
    }

    const blinkProgress =
      blinkDuration > 0
        ? Math.max(0, ((elapsed % blinkInterval) - (blinkInterval - blinkDuration)) / blinkDuration)
        : 0;
    expressions?.setValue('blink', Math.sin(blinkProgress * Math.PI));

    const { minimumMouthWeight, extraMouthWeight, pulsesPerSecond } = settings.speaking;
    const mouth = speaking
      ? minimumMouthWeight +
        Math.max(0, Math.sin(elapsed * pulsesPerSecond * fullTurn)) * extraMouthWeight
      : 0;
    expressions?.setValue('aa', mouth);
    avatar.update(delta);
  };
}
