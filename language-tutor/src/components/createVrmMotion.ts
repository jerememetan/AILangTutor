import { MathUtils, Vector3 } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { avatarMotionSettings as settings } from '../data/avatarMotionSettings';
import createPickerHandPose from './createPickerHandPose';
import createPickerStance from './createPickerStance';

const fullTurn = 2 * Math.PI;

export default function createVrmMotion(avatar: VRM, inPicker = false) {
  const restAngle = MathUtils.degToRad(settings.rest.armLoweringDegrees);
  const swayAngle = MathUtils.degToRad(settings.armSway.amplitudeDegrees);
  const idle = settings.pickerIdle;
  const elbowSway = MathUtils.degToRad(idle.elbowSwayDegrees);
  const stance = inPicker ? createPickerStance(avatar) : undefined;
  const blinkIntervals = (
    inPicker ? idle.blinkIntervalsSeconds : [settings.blink.intervalSeconds]
  ).filter((interval) => interval > 0);
  const blinkCycle = blinkIntervals.reduce((total, interval) => total + interval, 0);
  const blinkDuration = inPicker ? idle.blinkDurationSeconds : settings.blink.durationSeconds;
  const forward = avatar.meta.metaVersion === '0' ? -1 : 1;
  const arms = (['left', 'right'] as const).flatMap((side) => {
    const arm = avatar.humanoid.getNormalizedBoneNode(`${side}UpperArm`);
    const elbow = avatar.humanoid.getNormalizedBoneNode(`${side}LowerArm`);
    const hand = avatar.humanoid.getNormalizedBoneNode(`${side}Hand`);
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
    const bend = idle.elbowBendDegrees * (side === 'left' ? 0.8 : 1.2);
    const elbowBend = -direction * forward * MathUtils.degToRad(bend);
    if (inPicker) elbow.rotation.y = elbowBend;
    const poseHand = inPicker && hand ? createPickerHandPose(avatar, side, hand) : undefined;
    poseHand?.(0, 0);
    return [
      {
        arm,
        elbow,
        poseHand,
        forearmAxis: hand?.position.clone().normalize(),
        elbowBend,
        direction,
        side,
        restingRotation: arm.quaternion.clone(),
      },
    ];
  });

  const expressions = avatar.expressionManager;
  expressions?.setValue('happy', inPicker ? idle.smileWeight : settings.rest.smileWeight);
  expressions?.update();
  stance?.(0);
  avatar.humanoid.update();

  return (elapsed: number, delta: number, speaking: boolean) => {
    const fidget = stance?.(elapsed);
    const swayPhase =
      settings.armSway.periodSeconds > 0
        ? (elapsed / settings.armSway.periodSeconds) * fullTurn
        : 0;
    for (const {
      arm,
      elbow,
      poseHand,
      forearmAxis,
      elbowBend,
      direction,
      side,
      restingRotation,
    } of arms) {
      arm.quaternion.copy(restingRotation);
      const sway = inPicker
        ? Math.sin(swayPhase * (side === 'left' ? 0.83 : 0.97)) * swayAngle * 0.45
        : Math.sin(swayPhase) * swayAngle;
      const lift = fidget ? (side === 'left' ? fidget.leftLift : fidget.rightLift) : 0;
      arm.rotateZ(direction * (sway + MathUtils.degToRad(lift)));
      if (fidget) {
        const lag = side === 'left' ? 0.65 : 1.5;
        const armResponse = Math.sin(swayPhase * 0.7) * Math.cos(swayPhase * 0.26 + lag);
        const fidgetBend = MathUtils.degToRad(
          side === 'left' ? fidget.leftElbow : fidget.rightElbow,
        );
        const flex = elbowBend - direction * forward * (elbowSway * armResponse + fidgetBend);
        const lift = side === 'right' ? direction * MathUtils.degToRad(fidget.rightForearmLift) : 0;
        elbow.rotation.set(0, flex, lift);
        if (side === 'right') {
          if (forearmAxis) {
            elbow.rotateOnAxis(forearmAxis, MathUtils.degToRad(62 * fidget.rightHandOpen));
          }
          poseHand?.(fidget.rightHandOpen, direction * MathUtils.degToRad(fidget.rightWrist));
        }
      }
    }
    if (fidget)
      expressions?.setValue('happy', MathUtils.clamp(idle.smileWeight + fidget.smile, 0, 1));

    let blink = 0;
    if (blinkCycle > 0 && blinkDuration > 0) {
      let timeInInterval = elapsed % blinkCycle;
      for (const interval of blinkIntervals) {
        if (timeInInterval < interval) {
          const duration = Math.min(blinkDuration, interval);
          const progress = Math.max(0, (timeInInterval - (interval - duration)) / duration);
          blink = Math.sin(progress * Math.PI);
          break;
        }
        timeInInterval -= interval;
      }
    }
    expressions?.setValue('blink', blink);

    const { minimumMouthWeight, extraMouthWeight, pulsesPerSecond } = settings.speaking;
    const mouth = speaking
      ? minimumMouthWeight +
        Math.max(0, Math.sin(elapsed * pulsesPerSecond * fullTurn)) * extraMouthWeight
      : 0;
    expressions?.setValue('aa', mouth);
    avatar.update(delta);
  };
}
