import { MathUtils } from 'three';
import { avatarMotionSettings } from '../data/avatarMotionSettings';

// Offsets from the standing pose. A value of 1 uses the full configured glance angle.
const neutral = {
  pitch: 0,
  yaw: 0,
  roll: 0,
  chestPitch: 0,
  chestYaw: 0,
  leftElbow: 0,
  rightElbow: 0,
  leftLift: 0,
  rightLift: 0,
  rightForearmLift: 0,
  rightWrist: 0,
  rightHandOpen: 0,
  smile: 0,
};
type FidgetPose = typeof neutral;
type Keyframe = { seconds: number; pose: Partial<FidgetPose> };

const greeting: Keyframe[] = [
  { seconds: 0, pose: neutral },
  {
    seconds: 0.16,
    pose: {
      pitch: -2,
      chestPitch: -1,
      rightLift: 5,
      rightForearmLift: 16,
      rightHandOpen: 0.15,
      smile: 0.11,
    },
  },
  {
    seconds: 0.62,
    pose: {
      pitch: 3,
      roll: -4,
      rightLift: 59,
      rightForearmLift: 88,
      rightWrist: -13,
      rightHandOpen: 1,
      smile: 0.26,
    },
  },
  {
    seconds: 0.83,
    pose: {
      pitch: 2,
      roll: -4,
      rightLift: 59,
      rightForearmLift: 80,
      rightWrist: 16,
      rightHandOpen: 1,
      smile: 0.27,
    },
  },
  {
    seconds: 1.04,
    pose: {
      pitch: 1,
      roll: -3,
      rightLift: 59,
      rightForearmLift: 88,
      rightWrist: -13,
      rightHandOpen: 1,
      smile: 0.26,
    },
  },
  {
    seconds: 1.25,
    pose: {
      roll: -3,
      rightLift: 57,
      rightForearmLift: 81,
      rightWrist: 13,
      rightHandOpen: 0.93,
      smile: 0.23,
    },
  },
  { seconds: 1.86, pose: neutral },
];

const fidgets: Keyframe[][] = [
  [
    { seconds: 0, pose: neutral },
    { seconds: 0.34, pose: { pitch: -2, yaw: 0.8, roll: 3, chestYaw: 1 } },
    { seconds: 0.76, pose: { pitch: -4, yaw: 1, roll: 5, chestYaw: 6 } },
    { seconds: 1.42, pose: { pitch: -3.5, yaw: 0.92, roll: 4, chestYaw: 5, rightElbow: 3 } },
    { seconds: 2.16, pose: neutral },
  ],
  [
    { seconds: 0, pose: neutral },
    {
      seconds: 0.64,
      pose: { chestPitch: -5, pitch: -4, leftLift: 14, rightLift: 8, leftElbow: 8 },
    },
    {
      seconds: 1.13,
      pose: { chestPitch: 2.8, pitch: 3, leftLift: 6, rightLift: 10, rightElbow: 6 },
    },
    { seconds: 1.94, pose: neutral },
  ],
  [
    { seconds: 0, pose: neutral },
    { seconds: 0.58, pose: { pitch: 7, yaw: 0.48, roll: -6, chestPitch: 2, smile: 0.14 } },
    { seconds: 1.18, pose: { pitch: 5, yaw: 0.4, roll: -5, chestPitch: 1.5, smile: 0.16 } },
    { seconds: 1.95, pose: neutral },
  ],
];

const channels = Object.keys(neutral) as (keyof FidgetPose)[];

export default function createPickerFidgets(tutorKey: string) {
  const { gazeShiftSeconds, fidgetRestVariationSeconds } = avatarMotionSettings.pickerIdle;
  const seed = [...tutorKey].reduce((hash, char) => (31 * hash + char.charCodeAt(0)) >>> 0, 0);
  const opening = greeting[greeting.length - 1].seconds;
  let duration = 0;
  // Each tutor gets a different order and spacing without drawing random numbers every frame.
  const cues = Array.from({ length: fidgets.length * 2 }, (_, index) => {
    const clip = fidgets[(seed + index) % fidgets.length];
    const firstSide = seed % 2 ? -1 : 1;
    const mix = ((seed >>> ((index * 5) % 24)) & 31) / 31;
    const start = duration + gazeShiftSeconds + mix * fidgetRestVariationSeconds;
    const end = start + clip[clip.length - 1].seconds;
    duration = end;
    return { start, end, clip, side: index % 2 ? -firstSide : firstSide };
  });
  const pose = { ...neutral };

  function sample(clip: Keyframe[], time: number, side: number) {
    const nextIndex = clip.findIndex((frame) => frame.seconds > time);
    if (nextIndex < 1) return neutral;
    const from = clip[nextIndex - 1];
    const to = clip[nextIndex];
    const blend = MathUtils.smootherstep(time, from.seconds, to.seconds);
    for (const channel of channels) {
      pose[channel] = MathUtils.lerp(from.pose[channel] ?? 0, to.pose[channel] ?? 0, blend);
    }
    pose.yaw *= side;
    pose.roll *= side;
    pose.chestYaw *= side;
    return pose;
  }

  return (elapsed: number) => {
    if (elapsed < opening) return sample(greeting, elapsed, 1);
    if (gazeShiftSeconds <= 0) return neutral;
    const time = (elapsed - opening) % duration;
    const cue = cues.find(({ start, end }) => time >= start && time < end);
    return cue ? sample(cue.clip, time - cue.start, cue.side) : neutral;
  };
}
