class LessonPcmWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.samples = new Float32Array(Math.ceil(sampleRate * options.processorOptions.seconds));
    this.length = 0;
    this.recording = false;
    this.take = 0;
    this.levelFrames = 0;
    this.peak = 0;
    this.port.onmessage = ({ data: { type, take } }) => {
      if (type === 'start') {
        this.take = take;
        this.length = 0;
        this.levelFrames = 0;
        this.peak = 0;
        this.recording = true;
      } else {
        this.recording = false;
        if (type === 'finish') {
          const captured = this.samples.slice(0, this.length);
          this.port.postMessage({ take, samples: captured.buffer }, [captured.buffer]);
        }
      }
    };
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (this.recording && channel) {
      const clip = channel.subarray(0, this.samples.length - this.length);
      this.samples.set(clip, this.length);
      this.length += clip.length;
      for (const sample of clip) this.peak = Math.max(this.peak, Math.abs(sample));
      this.levelFrames += channel.length;
      if (this.levelFrames >= sampleRate / 10) {
        this.port.postMessage({ take: this.take, peak: this.peak });
        this.peak = 0;
        this.levelFrames = 0;
      }
    }
    return true;
  }
}

registerProcessor('lesson-pcm', LessonPcmWorklet);
