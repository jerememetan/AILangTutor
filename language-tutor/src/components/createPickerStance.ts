import { MathUtils, Quaternion, Vector3 } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { avatarMotionSettings } from '../data/avatarMotionSettings';
import createPickerFidgets from './createPickerFidgets';

const idle = avatarMotionSettings.pickerIdle;
const radians = MathUtils.degToRad;
const cycle = (seconds: number, period: number) =>
  period > 0 ? (seconds / period) * 2 * Math.PI : 0;

export default function createPickerStance(avatar: VRM) {
  const { humanoid } = avatar;
  const hips = humanoid.getNormalizedBoneNode('hips');
  const chest =
    humanoid.getNormalizedBoneNode('upperChest') ??
    humanoid.getNormalizedBoneNode('chest') ??
    humanoid.getNormalizedBoneNode('spine');
  const head = humanoid.getNormalizedBoneNode('head');
  const forward = avatar.meta.metaVersion === '0' ? -1 : 1;
  const tutorKey = avatar.meta.metaVersion === '0' ? avatar.meta.title : avatar.meta.name;
  const getFidget = createPickerFidgets(tutorKey ?? '');
  const restHips = hips?.position.clone();
  const legs = (['left', 'right'] as const).flatMap((side) => {
    const thigh = humanoid.getNormalizedBoneNode(`${side}UpperLeg`);
    const knee = humanoid.getNormalizedBoneNode(`${side}LowerLeg`);
    const foot = humanoid.getNormalizedBoneNode(`${side}Foot`);
    if (!hips || !restHips || !thigh || !knee || !foot) return [];

    const upperLength = knee.position.length();
    const lowerLength = foot.position.length();
    if (upperLength === 0 || lowerLength === 0) return [];
    const plantedFoot = restHips.clone().add(thigh.position).add(knee.position).add(foot.position);
    const upperRest = knee.position.clone().normalize();
    const lowerRest = foot.position.clone().normalize();
    return [
      {
        thigh,
        knee,
        foot,
        plantedFoot,
        upperRest,
        lowerRest,
        upperLength,
        lowerLength,
        hipToFoot: new Vector3(),
        kneeDirection: new Vector3(),
        thighVector: new Vector3(),
        shinVector: new Vector3(),
        shinRotation: new Quaternion(),
      },
    ];
  });
  const legLength =
    legs.length === 2 ? Math.min(...legs.map((leg) => leg.upperLength + leg.lowerLength)) : 0;

  return (elapsed: number) => {
    const shiftPhase = cycle(elapsed, idle.weightShiftSeconds);
    const balance = Math.sin(shiftPhase + 0.7);
    const support = Math.sign(balance) * MathUtils.smoothstep(Math.abs(balance), 0.12, 0.88);
    const shift = support * 0.8 + Math.sin(shiftPhase * 0.53 + 0.9) * 0.2;
    const breathPhase = cycle(elapsed, idle.breathSeconds);
    const breath = Math.sin(breathPhase) * 0.86 + Math.sin(2 * breathPhase) * 0.14;
    const fidget = getFidget(elapsed);

    if (hips && restHips && legLength > 0) {
      hips.position.copy(restHips);
      hips.position.x += shift * idle.weightShift * legLength;
      hips.position.y -= legLength * idle.kneeSoftness * (1 + 0.18 * breath);
      for (const leg of legs) {
        const { thigh, knee, foot, upperLength, lowerLength } = leg;
        const axis = leg.hipToFoot.copy(leg.plantedFoot).sub(hips.position).sub(thigh.position);
        const distance = MathUtils.clamp(
          axis.length(),
          Math.abs(upperLength - lowerLength) + 1e-5,
          upperLength + lowerLength - 1e-5,
        );
        axis.normalize();

        // Solve the knee from the two leg lengths while keeping the ankle in its original spot.
        const along =
          (distance * distance + upperLength * upperLength - lowerLength * lowerLength) /
          (2 * distance);
        const bend = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
        leg.kneeDirection
          .set(0, 0, forward)
          .addScaledVector(axis, -forward * axis.z)
          .normalize();
        leg.thighVector.copy(axis).multiplyScalar(along).addScaledVector(leg.kneeDirection, bend);
        leg.shinVector.copy(axis).multiplyScalar(distance).sub(leg.thighVector).normalize();
        thigh.quaternion.setFromUnitVectors(leg.upperRest, leg.thighVector.normalize());
        leg.shinRotation.setFromUnitVectors(leg.lowerRest, leg.shinVector);
        knee.quaternion.copy(thigh.quaternion).invert().multiply(leg.shinRotation);
        foot.quaternion.copy(leg.shinRotation).invert();
      }
    }

    chest?.rotation.set(
      radians((-idle.chestBreathDegrees * breath + fidget.chestPitch) * forward),
      radians(-1.25 * shift + fidget.chestYaw * forward),
      radians(1.35 * shift),
    );
    head?.rotation.set(
      radians((0.7 + 0.4 * Math.sin(breathPhase - 0.5) + fidget.pitch) * forward),
      radians((2 + idle.glanceDegrees * fidget.yaw - shift) * forward),
      radians(-1.15 * shift + fidget.roll * forward),
    );
    return fidget;
  };
}
