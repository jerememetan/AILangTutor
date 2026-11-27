import { MathUtils, Vector3, type Object3D } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { avatarMotionSettings } from '../data/avatarMotionSettings';

const radians = MathUtils.degToRad;
const digits = ['Index', 'Middle', 'Ring', 'Little'] as const;

export default function createPickerHandPose(avatar: VRM, side: 'left' | 'right', hand: Object3D) {
  const bone = avatar.humanoid.getNormalizedBoneNode.bind(avatar.humanoid);
  const index = bone(`${side}IndexProximal`);
  const little = bone(`${side}LittleProximal`);
  const middle = bone(`${side}MiddleIntermediate`);
  if (!index || !little || !middle) return;

  // The rig's knuckles define the palm plane for both VRM 0 and VRM 1 models.
  const acrossPalm = index.position.clone().sub(little.position).normalize();
  const palmNormal = new Vector3().crossVectors(acrossPalm, middle.position).normalize();
  if (side === 'left') palmNormal.negate();
  const wristAxis = new Vector3().crossVectors(middle.position, palmNormal).normalize();
  const wristRest = hand.quaternion.clone();
  const { fingerCurlDegrees, wristFlexDegrees } = avatarMotionSettings.pickerIdle;

  const fingers = digits.flatMap((digit, index) => {
    const proximal = bone(`${side}${digit}Proximal`);
    const intermediate = bone(`${side}${digit}Intermediate`);
    const distal = bone(`${side}${digit}Distal`);
    if (!proximal || !intermediate || !distal) return [];

    const curl = radians(fingerCurlDegrees) * (0.8 + 0.13 * index);
    const spreadAxis = new Vector3().crossVectors(intermediate.position, acrossPalm).normalize();
    const spread = radians(4 - 3.3 * index);
    return [
      {
        proximal,
        spreadAxis,
        spread,
        joints: [
          { joint: proximal, offset: intermediate.position, bend: curl * 0.65 },
          { joint: intermediate, offset: distal.position, bend: curl },
          { joint: distal, offset: distal.position, bend: curl * 0.45 },
        ].map(({ joint, offset, bend }) => ({
          joint,
          bend,
          rest: joint.quaternion.clone(),
          axis: new Vector3().crossVectors(offset, palmNormal).normalize(),
        })),
      },
    ];
  });

  const thumbRoot = bone(`${side}ThumbMetacarpal`);
  const thumbBase = bone(`${side}ThumbProximal`);
  const thumbTip = bone(`${side}ThumbDistal`);
  const thumbJoints =
    thumbRoot && thumbBase && thumbTip
      ? [
          { joint: thumbRoot, offset: thumbBase.position, bend: radians(7) },
          { joint: thumbBase, offset: thumbTip.position, bend: radians(9) },
        ].map(({ joint, offset, bend }) => ({
          joint,
          bend,
          rest: joint.quaternion.clone(),
          axis: new Vector3()
            .crossVectors(offset, little.position.clone().sub(thumbRoot.position))
            .normalize(),
        }))
      : [];

  return (openness: number, waveAngle: number) => {
    const curlWeight = 1 - 0.88 * openness;
    hand.quaternion.copy(wristRest);
    hand.rotateOnAxis(wristAxis, radians(wristFlexDegrees) * (1 - openness));
    hand.rotateZ(waveAngle);
    for (const { proximal, spreadAxis, spread, joints } of fingers) {
      for (const { joint, rest, axis, bend } of joints) {
        joint.quaternion.copy(rest);
        joint.rotateOnAxis(axis, bend * curlWeight);
      }
      proximal.rotateOnAxis(spreadAxis, spread * openness);
    }
    for (const { joint, rest, axis, bend } of thumbJoints) {
      joint.quaternion.copy(rest);
      joint.rotateOnAxis(axis, bend * (1 - openness));
    }
  };
}
