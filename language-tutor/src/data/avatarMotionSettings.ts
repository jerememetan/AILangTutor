// These defaults apply to every tutor. Angles are in degrees and times are in seconds.
export const avatarMotionSettings = {
  rest: {
    armLoweringDegrees: 80, // Angle down from horizontal. 90 hangs straight down.
    smileWeight: 0.45, // 0 turns the smile off. 1 is the model's full smile.
  },
  armSway: {
    amplitudeDegrees: 2, // Set to 0 to stop shoulder sway.
    periodSeconds: 4, // Time for one full up-and-down cycle.
  },
  blink: {
    intervalSeconds: 10, // Time between blinks. Set to 0 to turn blinking off.
    durationSeconds: 0.3, // Total time to close and reopen the eyes.
  },
  pickerIdle: {
    smileWeight: 0.22,
    elbowBendDegrees: 9,
    elbowSwayDegrees: 1.2,
    fingerCurlDegrees: 20, // The ring and little fingers rest a bit more curled.
    wristFlexDegrees: 4,
    weightShift: 0.05, // Fraction of leg length moved side to side.
    kneeSoftness: 0.02, // Fraction of leg length the hips sit below full extension.
    breathSeconds: 4.7,
    chestBreathDegrees: 0.75,
    weightShiftSeconds: 12,
    gazeShiftSeconds: 7.5, // Minimum pause before each fidget. Set to 0 to skip fidgets after the greeting.
    fidgetRestVariationSeconds: 3.5,
    glanceDegrees: 10.6,
    blinkIntervalsSeconds: [4.8, 6.3, 3.9, 5.6],
    blinkDurationSeconds: 0.59,
  },
  stageTurn: {
    pickerAngleDegrees: -7.45,
    amplitudeDegrees: 2.58,
    periodSeconds: 70,
  },
};
