class LessonPcmWorklet extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.samples = new Float32Array(Math.ceil(sampleRate * options.processorOptions.seconds));
    this.length = 0;
    this.finished = false;
    this.port.onmessage = () => {
      this.finished = true;
      const captured = this.samples.slice(0, this.length);
      this.port.postMessage(captured.buffer, [captured.buffer]);
    };
  }

  process(inputs) {
    if (this.finished) return false;
    const channel = inputs[0]?.[0];
    if (channel) {
      const clip = channel.subarray(0, this.samples.length - this.length);
      this.samples.set(clip, this.length);
      this.length += clip.length;
    }
    return true;
  }
}

registerProcessor('lesson-pcm', LessonPcmWorklet);
