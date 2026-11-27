// These defaults apply to every tutor. Angles are in degrees and times are in seconds.
export const avatarMotionSettings = {
  rest: {
    armLoweringDegrees: 80, // Angle down from horizontal. 90 hangs straight down.
    smileWeight: 0.45, // 0 turns the smile off. 1 is the model's full smile.
  },
  armSway: {
    amplitudeDegrees: 2, // Set to 0 to keep the arms still.
    periodSeconds: 4, // Time for one full up-and-down cycle.
  },
  blink: {
    intervalSeconds: 10, // Time between blinks. Set to 0 to turn blinking off.
    durationSeconds: 0.3, // Total time to close and reopen the eyes.
  },
  stageTurn: {
    pickerAngleDegrees: -7.45,
    amplitudeDegrees: 2.58,
    periodSeconds: 18,
  },
  speaking: {
    minimumMouthWeight: 0.13,
    extraMouthWeight: 0.32,
    pulsesPerSecond: 1.91,
  },
};
