export function createAudio(enabled) {
  let context, lastHit = 0;
  function unlock() {
    if (!enabled) return;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    context ??= new AudioContext();
    context.resume().catch(() => {});
  }
  function play(kind = 'hit') {
    if (!enabled || !context || context.state !== 'running') return;
    const now = context.currentTime;
    if (kind === 'hit' && now - lastHit < .045) return;
    lastHit = now;
    const notes = kind === 'win' ? [523, 659, 784, 1047] : [kind === 'special' ? 220 : 620 + Math.random() * 240];
    notes.forEach((frequency, i) => {
      const oscillator = context.createOscillator(), gain = context.createGain();
      const start = now + i * .1;
      oscillator.type = kind === 'special' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * .65, start + .14);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(.045, start + .005);
      gain.gain.exponentialRampToValueAtTime(.001, start + .18);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start); oscillator.stop(start + .2);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }
  return { unlock, play };
}
