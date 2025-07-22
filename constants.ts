

import { type DrumMapping, type SynthParameterCollection, type BasicSynthParams, type MonoSynthParams, type FMSynthParams, type PolySynthParams, OscillatorType, FilterType, FilterRollOff, SupportedSynthType, SynthRole } from './types';

export const ROLAND_TR8S_MAP: DrumMapping = {
  BD: 36, // Bass Drum
  SD: 38, // Snare Drum
  LT: 43, // Low Tom (was 41)
  MT: 47, // Mid Tom (was 45)
  HT: 50, // Hi Tom (was 48)
  RS: 37, // Rim Shot
  HC: 39, // Hand Clap
  CH: 42, // Closed Hi-hat
  OH: 46, // Open Hi-hat
  CC: 49, // Crash Cymbal (was CY)
  RC: 51, // Ride Cymbal (was RD)
};

export const REVERSE_ROLAND_TR8S_MAP: { [note: number]: string } = Object.entries(ROLAND_TR8S_MAP)
  .reduce((acc, [name, note]) => {
    acc[note] = name;
    return acc;
  }, {} as { [note: number]: string });

// Define a preferred order for drum instruments in the grid visualizer
export const DRUM_GRID_ORDERED_INSTRUMENTS: number[] = [
  ROLAND_TR8S_MAP.BD,
  ROLAND_TR8S_MAP.SD,
  ROLAND_TR8S_MAP.RS,
  ROLAND_TR8S_MAP.HC,
  ROLAND_TR8S_MAP.CH,
  ROLAND_TR8S_MAP.OH,
  ROLAND_TR8S_MAP.LT,
  ROLAND_TR8S_MAP.MT,
  ROLAND_TR8S_MAP.HT,
  ROLAND_TR8S_MAP.CC,
  ROLAND_TR8S_MAP.RC,
];


export const MIDI_CHANNELS = Array.from({ length: 16 }, (_, i) => i + 1);

export const DEFAULT_BARS = 4; // Changed from 1 to 4
export const MAX_BARS = 16;
export const MAX_PATTERN_HISTORY = 10;
export const DEFAULT_MASTER_PROMPT_BARS = 4;
export const NUM_CC_LANES = 3;

export const NOTE_HEIGHT_SYNTH = 6; // Used for small visualizer, related to PITCH_RANGE_SYNTH
export const STEPS_PER_BAR = 16;
export const DRUM_NOTE_SIZE = 10;
export const DRUM_ACTIVE_NOTE_SIZE = 14;

// For small visualizers in TrackCard
export const DEFAULT_BAR_WIDTH = 256; // Pixel width per bar for small visualizers
export const DEFAULT_DRUM_VIEW_HEIGHT = 80;
export const DEFAULT_SYNTH_VIEW_HEIGHT = 160;


// For FullscreenVisualizer
export const PIANO_KEY_WIDTH = 40; // For synth piano roll
export const DRUM_GRID_INSTRUMENT_LABEL_WIDTH = 80; // Width for instrument names column
export const DRUM_GRID_HEADER_HEIGHT = 20; // Height for beat numbers if we add them

export const EDIT_MODE_DEFAULT_PROMPT = "Manual Edit (Fullscreen)";
export const EDIT_MODE_DEFAULT_VELOCITY = 100;
export const EDIT_MODE_DEFAULT_DURATION_16TH = 0.25; // 16th note

// Synth Visualizer Piano Roll constants
export const PITCH_RANGE_SYNTH = 24; // Number of semitones displayed (e.g., 2 octaves)
export const LOWEST_SYNTH_NOTE = 48; // MIDI C3, the lowest note on the piano roll when octaveShift (or view scroll) is 0

// Velocity Editing Constants
export const VELOCITY_LANE_HEIGHT = 60; // Height of the velocity editing lane
export const VELOCITY_MARKER_LINE_WIDTH = 3; // Width of the lollipop stem
export const VELOCITY_MARKER_HEAD_RADIUS = 5; // Radius of the lollipop head


export const DEFAULT_BASIC_SYNTH_PARAMS: BasicSynthParams = {
  oscillator: {
    type: 'sawtooth' as OscillatorType,
    detune: 0,
  },
  amplitudeEnvelope: {
    attack: 0.01,
    decay: 0.1,
    sustain: 0.8,
    release: 0.5,
  },
  filter: {
    type: 'lowpass' as FilterType,
    frequency: 1200,
    Q: 1,
  },
  filterEnvelope: {
    attack: 0.05,
    decay: 0.2,
    sustain: 0.5,
    release: 0.8,
    baseFrequency: 200,
    octaves: 3,
  },
};

export const DEFAULT_MONOSYNTH_PARAMS: MonoSynthParams = {
  oscillatorType: 'sawtooth' as OscillatorType,
  detune: 0,
  portamento: 0.05,
  amplitudeEnvelope: {
    attack: 0.01,
    decay: 0.1,
    sustain: 0.9,
    release: 1,
  },
  filter: {
    type: 'lowpass' as FilterType,
    rolloff: -12 as FilterRollOff,
    Q: 1,
  },
  filterEnvelope: {
    attack: 0.06,
    decay: 0.2,
    sustain: 0.5,
    release: 2,
    baseFrequency: 200,
    octaves: 3.5,
    exponent: 2,
  },
};

export const DEFAULT_FMSYNTH_PARAMS: FMSynthParams = {
  harmonicity: 3,
  modulationIndex: 10,
  detune: 0,
  carrier: {
    type: 'sine' as OscillatorType,
    envelope: {
      attack: 0.01,
      decay: 0.1,
      sustain: 1,
      release: 0.5,
    },
  },
  modulator: {
    type: 'square' as OscillatorType,
    envelope: {
      attack: 0.01,
      decay: 0.1,
      sustain: 1,
      release: 0.5,
    },
  },
};

export const DEFAULT_POLYSYNTH_PARAMS: PolySynthParams = {
  polyphony: 8,
  detune: 0,
  oscillator: {
    type: 'sawtooth' as OscillatorType,
  },
  amplitudeEnvelope: {
    attack: 0.01,
    decay: 0.1,
    sustain: 0.9,
    release: 0.5,
  },
  filter: {
    type: 'lowpass' as FilterType,
    rolloff: -12 as FilterRollOff,
    Q: 1,
  },
  filterEnvelope: {
    attack: 0.05,
    decay: 0.2,
    sustain: 0.5,
    release: 1,
    baseFrequency: 1000,
    octaves: 2.5,
    exponent: 2,
  },
};

export const DEFAULT_SYNTH_PARAMETER_COLLECTION: SynthParameterCollection = {
  activeSynthType: 'BasicSynth' as SupportedSynthType,
  BasicSynth: { ...DEFAULT_BASIC_SYNTH_PARAMS },
  MonoSynth: { ...DEFAULT_MONOSYNTH_PARAMS },
  FMSynth: { ...DEFAULT_FMSYNTH_PARAMS },
  PolySynth: { ...DEFAULT_POLYSYNTH_PARAMS },
};

export const DEFAULT_SYNTH_ROLE = SynthRole.LEAD_MELODY;

export const SYNTH_ROLE_OPTIONS: { value: SynthRole; label: string }[] = [
  { value: SynthRole.BASSLINE, label: 'Bassline' },
  { value: SynthRole.LEAD_MELODY, label: 'Lead Melody' },
  { value: SynthRole.PAD_CHORDS, label: 'Pad / Chords' },
  { value: SynthRole.ARPEGGIO, label: 'Arpeggio' },
  { value: SynthRole.PLUCKS, label: 'Plucks' },
  { value: SynthRole.RHYTHMIC_SEQUENCE, label: 'Rhythmic Sequence' },
  { value: SynthRole.ATMOSPHERIC_FX, label: 'Atmospheric / FX' },
  { value: SynthRole.GENERAL_SYNTH, label: 'General Synth' },
];

export const SYNTH_ROLE_LABELS: Record<SynthRole, string> = 
  SYNTH_ROLE_OPTIONS.reduce((acc, curr) => {
    acc[curr.value] = curr.label;
    return acc;
  }, {} as Record<SynthRole, string>);
