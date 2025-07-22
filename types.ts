export interface MidiNote {
  note: number; // MIDI note number (0-127)
  velocity: number; // Velocity (0-127)
  time: number; // Start time in beats from the beginning of the pattern
  duration: number; // Duration in beats
}

export enum TrackType {
  DRUM = 'drum',
  SYNTH = 'synth',
}

export enum SynthRole {
  BASSLINE = 'bassline',
  LEAD_MELODY = 'lead_melody',
  PAD_CHORDS = 'pad_chords',
  ARPEGGIO = 'arpeggio',
  PLUCKS = 'plucks',
  RHYTHMIC_SEQUENCE = 'rhythmic_sequence',
  ATMOSPHERIC_FX = 'atmospheric_fx',
  GENERAL_SYNTH = 'general_synth', // Default/fallback
}

export interface PatternHistoryEntry {
  pattern: MidiNote[] | null;
  bars: number;
  prompt: string;
}

export type OscillatorType = "sine" | "square" | "sawtooth" | "triangle" | "pwm" | "pulse"; // Added pwm, pulse for MonoSynth
export type FilterType = "lowpass" | "highpass" | "bandpass" | "notch";
export type FilterRollOff = -12 | -24 | -48 | -96;


// --- Synth Parameter Definitions ---

export type SupportedSynthType = "BasicSynth" | "MonoSynth" | "FMSynth" | "PolySynth";

export interface BasicSynthParams {
  oscillator: {
    type: OscillatorType;
    detune: number; // In cents
  };
  amplitudeEnvelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  filter: { // Specific to BasicSynth's external filter
    type: FilterType;
    frequency: number;
    Q: number;
  };
  filterEnvelope: { // Specific to BasicSynth's external filter envelope
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    baseFrequency: number;
    octaves: number;
  };
}

export interface MonoSynthParams {
  oscillatorType: OscillatorType;
  detune: number; // In cents
  portamento: number; // In seconds
  amplitudeEnvelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  filter: {
    type: FilterType;
    rolloff: FilterRollOff;
    Q: number;
  };
  filterEnvelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    baseFrequency: number;
    octaves: number;
    exponent: number;
  };
}

export interface FMSynthParams {
  harmonicity: number;
  modulationIndex: number;
  detune: number; // In cents
  carrier: {
    type: OscillatorType;
    envelope: {
      attack: number;
      decay: number;
      sustain: number;
      release: number;
    };
  };
  modulator: {
    type: OscillatorType;
    envelope: {
      attack: number;
      decay: number;
      sustain: number;
      release: number;
    };
  };
}

export interface PolySynthParams {
  polyphony: number;
  detune: number; // Overall detune for the PolySynth

  // Voice characteristics (applied to each Tone.Synth voice)
  oscillator: {
    type: OscillatorType;
  };
  amplitudeEnvelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  filter: {
    type: FilterType;
    rolloff: FilterRollOff;
    Q: number;
  };
  filterEnvelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    baseFrequency: number; // Cutoff for the filter, modulated by this envelope
    octaves: number; // Modulation amount
    exponent: number;
  };
  // portamento?: number; // Optional: portamento for voices, could be added later
}


export interface SynthParameterCollection {
  activeSynthType: SupportedSynthType;
  BasicSynth: BasicSynthParams;
  MonoSynth: MonoSynthParams;
  FMSynth: FMSynthParams;
  PolySynth: PolySynthParams;
}

export interface CcAutomationEvent {
  time: number; // Time in beats from the beginning of the automation
  value: number; // MIDI CC value (0-127)
}

export interface CcAutomationData {
  cc: number; // The MIDI CC number this automation targets
  events: CcAutomationEvent[];
  prompt: string; // The prompt used to generate this automation
  bars: number; // The number of bars this automation covers
  depth?: number; // Modulation depth/scale (0-1, default 1)
  offset?: number; // Value offset (-127 to 127, default 0)
}


export interface Track {
  id: string;
  name: string;
  type: TrackType;
  channel: number; // MIDI channel (1-16)
  isLoading: boolean;
  error: string | null;
  isMuted: boolean;
  isProgressionChaining: boolean; // For per-track pattern chaining
  octaveShift?: number;
  synthRole?: SynthRole; // Added for synth tracks

  patternHistory: PatternHistoryEntry[];
  currentPatternIndex: number;

  synthParams?: SynthParameterCollection;

  // CC Automation Data - now an array for multiple lanes
  ccAutomationData?: (CcAutomationData | null)[];
  isGeneratingCc?: boolean[]; // True if CC automation is currently being generated for a lane
  ccError?: (string | null)[]; // Error message if CC automation generation failed for a lane
}

export interface MidiDevice {
  id: string;
  name: string;
}

export interface DrumMapping {
  [key: string]: number;
}

export interface VisualNote {
  x: number;
  y: number;
  width: number;
  height: number;
  isDrum?: boolean;
  isActive?: boolean;
  originalIndex?: number; // Added for synth note tracking
  velocity?: number; // Added for synth note velocity display/edit
}

export interface MIDIOptions {
  sysex?: boolean;
  software?: boolean;
}

export interface MIDIPortEventMap {
  "statechange": MIDIConnectionEvent;
}

export interface MIDIPort extends EventTarget {
  readonly id: string;
  readonly manufacturer?: string | null;
  readonly name?: string | null;
  readonly type: "input" | "output";
  readonly version?: string | null;
  readonly state: "connected" | "disconnected";
  readonly connection: "open" | "closed" | "pending";
  onstatechange: ((this: MIDIPort, ev: MIDIConnectionEvent) => any) | null;
  open(): Promise<MIDIPort>;
  close(): Promise<MIDIPort>;
  addEventListener<K extends keyof MIDIPortEventMap>(type: K, listener: (this: MIDIPort, ev: MIDIPortEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof MIDIPortEventMap>(type: K, listener: (this: MIDIPort, ev: MIDIPortEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

export interface MIDIMessageEvent extends Event {
  readonly data: Uint8Array;
  readonly receivedTime: number;
}

export interface MIDIInputEventMap extends MIDIPortEventMap {
  "midimessage": MIDIMessageEvent;
}

export interface MIDIInput extends MIDIPort {
  readonly type: "input";
  onmidimessage: ((this: MIDIInput, ev: MIDIMessageEvent) => any) | null;
  addEventListener<K extends keyof MIDIInputEventMap>(type: K, listener: (this: MIDIInput, ev: MIDIInputEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof MIDIInputEventMap>(type: K, listener: (this: MIDIInput, ev: MIDIInputEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

export interface MIDIOutput extends MIDIPort {
  readonly type: "output";
  send(data: number[] | Uint8Array, timestamp?: number): void;
  clear(): void;
}

export interface MIDIAccessEventMap {
  "statechange": MIDIConnectionEvent;
}
export interface MIDIAccess extends EventTarget {
  readonly inputs: ReadonlyMap<string, MIDIInput>;
  readonly outputs: ReadonlyMap<string, MIDIOutput>;
  readonly sysexEnabled: boolean;
  onstatechange: ((this: MIDIAccess, ev: MIDIConnectionEvent) => any) | null;
  addEventListener<K extends keyof MIDIAccessEventMap>(type: K, listener: (this: MIDIAccess, ev: MIDIAccessEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof MIDIAccessEventMap>(type: K, listener: (this: MIDIAccess, ev: MIDIAccessEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

export interface MIDIConnectionEvent extends Event {
  readonly port: MIDIPort;
}
