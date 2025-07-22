

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as R_ from 'tone';
import MidiWriter from 'midi-writer-js';
import { Header } from './components/Header';
import { TrackCard } from './components/TrackCard';
import { FullscreenVisualizer } from './components/FullscreenVisualizer'; 
import { PlusIcon } from './components/icons/PlusIcon';
import { type Track, type MidiNote, type MidiDevice, TrackType, type MIDIAccess, type MIDIInput, type MIDIOutput, type MIDIMessageEvent, type MIDIConnectionEvent, type PatternHistoryEntry, type SynthParameterCollection, OscillatorType, FilterType, SupportedSynthType, BasicSynthParams, MonoSynthParams, FMSynthParams, PolySynthParams, FilterRollOff, CcAutomationEvent, CcAutomationData, SynthRole } from './types';
import { generateMidiPattern, modifyMidiPattern, generateCcAutomation } from './services/geminiService';
import { ROLAND_TR8S_MAP, MAX_BARS, DEFAULT_BARS, MAX_PATTERN_HISTORY, DEFAULT_SYNTH_PARAMETER_COLLECTION, DEFAULT_BASIC_SYNTH_PARAMS, DEFAULT_MONOSYNTH_PARAMS, DEFAULT_FMSYNTH_PARAMS, DEFAULT_POLYSYNTH_PARAMS, DEFAULT_MASTER_PROMPT_BARS, EDIT_MODE_DEFAULT_PROMPT, DEFAULT_SYNTH_ROLE, SYNTH_ROLE_LABELS, NUM_CC_LANES } from './constants';

interface ActiveMidiNote {
  note: number;
  absoluteOffStep: number;
  channel: number;
}

let clockTickCounter = 0;
const MIN_OCTAVE_SHIFT = -2;
const MAX_OCTAVE_SHIFT = 2;
const MIDI_TICKS_PER_BEAT = 128; 

const drumSynthConfigs: Record<number, { type: 'membrane' | 'noise'; options: any; triggerDuration?: string | number }> = {
  [ROLAND_TR8S_MAP.BD]: { type: 'membrane', options: { pitchDecay: 0.005, octaves: 10, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 } }, triggerDuration: "32n" },
  [ROLAND_TR8S_MAP.LT]: { type: 'membrane', options: { pitchDecay: 0.008, octaves: 8, envelope: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.1 } }, triggerDuration: "32n" },
  [ROLAND_TR8S_MAP.MT]: { type: 'membrane', options: { pitchDecay: 0.01, octaves: 7, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 } }, triggerDuration: "32n" },
  [ROLAND_TR8S_MAP.HT]: { type: 'membrane', options: { pitchDecay: 0.015, octaves: 6, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.08 } }, triggerDuration: "32n" },
  [ROLAND_TR8S_MAP.SD]: { type: 'noise', options: { noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 } } }, 
  [ROLAND_TR8S_MAP.RS]: { type: 'noise', options: { noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 } } },
  [ROLAND_TR8S_MAP.HC]: { type: 'noise', options: { noise: { type: 'pink' }, envelope: { attack: 0.002, decay: 0.1, sustain: 0, release: 0.05 } } },
  [ROLAND_TR8S_MAP.CH]: { type: 'noise', options: { noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.05 } }, triggerDuration: "128n" },
  [ROLAND_TR8S_MAP.OH]: { type: 'noise', options: { noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.4 } } },
  [ROLAND_TR8S_MAP.CC]: { type: 'noise', options: { noise: { type: 'white' }, envelope: { attack: 0.005, decay: 1.0, sustain: 0, release: 1.5 } } },
  [ROLAND_TR8S_MAP.RC]: { type: 'noise', options: { noise: { type: 'white' }, envelope: { attack: 0.002, decay: 0.8, sustain: 0, release: 1.2, attackCurve: 'exponential' as any } } },
};
const defaultDrumSynthConfig = { type: 'membrane', options: { pitchDecay: 0.01, octaves: 6, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 } }, triggerDuration: "32n" };

type DrumKitInstruments = Map<number, R_.MembraneSynth | R_.NoiseSynth>;
export type AnyToneSynth = R_.Synth | R_.MonoSynth | R_.FMSynth | R_.PolySynth | R_.AMSynth; 
interface BasicSynthTrackInstruments {
  synth: R_.Synth;
  filter: R_.Filter;
  filterEnvelope: R_.FrequencyEnvelope;
}
type SynthTrackInstrument = AnyToneSynth | BasicSynthTrackInstruments; 
export type TrackInstrument = DrumKitInstruments | SynthTrackInstrument;

interface ExportedSessionState {
  tracks: Track[];
  bpm: number;
  isLooping: boolean;
  masterPrompt: string;
  masterPromptBars: number;
  stylePrompt: string;
  isPreviewMode: boolean;
  selectedInputId: string | null;
  selectedOutputId: string | null;
  appVersion: string;
}
const APP_SESSION_VERSION = "1.0.6"; // Incremented version for style prompt


const App: React.FC = () => {
  const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null);
  const [midiInputs, setMidiInputs] = useState<MidiDevice[]>([]);
  const [midiOutputs, setMidiOutputs] = useState<MidiDevice[]>([]);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(120);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  const toneStartedRef = useRef(false);
  const toneJsInstrumentsRef = useRef<Map<string, TrackInstrument>>(new Map());
  const toneJsPartsRef = useRef<Map<string, R_.Part>>(new Map());
  const lastSetupSynthParamsRef = useRef<Map<string, SynthParameterCollection | null>>(new Map()); 
  const visualizerSyncLoopRef = useRef<R_.Loop | null>(null);
  
  const [masterPrompt, setMasterPrompt] = useState<string>('');
  const [stylePrompt, setStylePrompt] = useState<string>('');
  const [masterPromptBars, setMasterPromptBars] = useState<number>(DEFAULT_MASTER_PROMPT_BARS);
  const [isGeneratingAll, setIsGeneratingAll] = useState<boolean>(false); // Used for both "Gen All" and "Pattern Progression"
  const [showMasterPrompt, setShowMasterPrompt] = useState<boolean>(false);

  const [fullscreenTrackId, setFullscreenTrackId] = useState<string | null>(null); 
  const liveEditingPatternRef = useRef<Map<string, { pattern: MidiNote[], bars: number } | null>>(new Map());


  const initialDrumTrack: Track = {
    id: 'drum-track-0',
    name: 'Drums',
    type: TrackType.DRUM,
    channel: 10,
    patternHistory: [],
    currentPatternIndex: 0,
    isLoading: false,
    error: null,
    isMuted: false,
    isProgressionChaining: false,
  };
  const initialSynthTrack: Track = {
    id: 'synth-track-1',
    name: 'Synth 1',
    type: TrackType.SYNTH,
    channel: 1,
    patternHistory: [],
    currentPatternIndex: 0,
    isLoading: false,
    error: null,
    isMuted: false,
    octaveShift: 0,
    synthRole: DEFAULT_SYNTH_ROLE,
    synthParams: JSON.parse(JSON.stringify(DEFAULT_SYNTH_PARAMETER_COLLECTION)), 
    ccAutomationData: Array(NUM_CC_LANES).fill(null),
    isGeneratingCc: Array(NUM_CC_LANES).fill(false),
    ccError: Array(NUM_CC_LANES).fill(null),
    isProgressionChaining: false,
  };

  const [tracks, setTracks] = useState<Track[]>([initialDrumTrack, initialSynthTrack]);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const absoluteStepRef = useRef<number>(0);
  const [displayStep, setDisplayStep] = useState<number>(0);
  const selectedOutputRef = useRef<MIDIOutput | null>(null);
  
  const activePlayingNotesRef = useRef<Map<string, Set<ActiveMidiNote>>>(new Map());
  const animationFrameIdRef = useRef<number | null>(null);
  const lastStepTimeRef = useRef<number>(0);
  const [isExternalClock, setIsExternalClock] = useState(false);
  const midiClockTickTimesRef = useRef<number[]>([]);
  const PPQN = 24; 

  const pendingPatternHistorySwitchRef = useRef<Map<string, number> | null>(null);
  const tracksRef = useRef(tracks);
  useEffect(() => {
      tracksRef.current = tracks;
  }, [tracks]);

    const getCombinedMasterContext = useCallback(() => {
    const parts = [];
    if (stylePrompt && stylePrompt.trim() !== '') {
        parts.push(`Style/Genre: ${stylePrompt.trim()}`);
    }
    if (showMasterPrompt && masterPrompt && masterPrompt.trim() !== '') {
        parts.push(`Master Prompt: ${masterPrompt.trim()}`);
    }
    return parts.join(' | ');
  }, [stylePrompt, showMasterPrompt, masterPrompt]);


  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && fullscreenTrackId) {
         // FullscreenVisualizer now handles ESC internally
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fullscreenTrackId]);


  const ensureToneStarted = async () => {
    if (!toneStartedRef.current && R_.context.state !== 'running') {
      await R_.start();
      console.log("Tone.js started");
      toneStartedRef.current = true;
    }
  };

  useEffect(() => {
    if (midiAccess && selectedOutputId) {
      selectedOutputRef.current = midiAccess.outputs.get(selectedOutputId) || null;
    } else {
      selectedOutputRef.current = null;
    }
  }, [midiAccess, selectedOutputId]);

  const sendAllNotesOff = useCallback(() => {
    if (selectedOutputRef.current && !isPreviewMode) { // Ensure not in preview mode
      activePlayingNotesRef.current.forEach((notes, trackId) => {
        const track = tracksRef.current.find(t => t.id === trackId); 
        if(track){
            notes.forEach(activeNote => {
                selectedOutputRef.current?.send([0x80 + (activeNote.channel - 1), activeNote.note, 0]);
            });
        }
      });
      activePlayingNotesRef.current.clear();
      for (let i = 0; i < 16; i++) {
        selectedOutputRef.current?.send([0xB0 + i, 123, 0]); 
      }
    }
  }, [isPreviewMode]); 

  const disposeTrackInstrument = useCallback((instrumentOrKit: TrackInstrument | undefined) => {
    if (!instrumentOrKit) return;
    if (instrumentOrKit instanceof Map) { 
      instrumentOrKit.forEach(drumSynth => {
        if (drumSynth && typeof drumSynth.dispose === 'function' && !drumSynth.disposed) {
          drumSynth.dispose();
        }
      });
    } else if (
      typeof instrumentOrKit === 'object' && instrumentOrKit !== null &&
      'synth' in instrumentOrKit && 'filter' in instrumentOrKit && 'filterEnvelope' in instrumentOrKit 
    ) { 
      const basicSynthWrapper = instrumentOrKit as BasicSynthTrackInstruments;
      if (basicSynthWrapper.synth && typeof basicSynthWrapper.synth.dispose === 'function' && !(basicSynthWrapper.synth as any).disposed) basicSynthWrapper.synth.dispose();
      if (basicSynthWrapper.filter && typeof basicSynthWrapper.filter.dispose === 'function' && !(basicSynthWrapper.filter as any).disposed) basicSynthWrapper.filter.dispose();
      if (basicSynthWrapper.filterEnvelope && typeof basicSynthWrapper.filterEnvelope.dispose === 'function' && !(basicSynthWrapper.filterEnvelope as any).disposed) basicSynthWrapper.filterEnvelope.dispose();
    } else if (typeof instrumentOrKit === 'object' && instrumentOrKit !== null && 'dispose' in instrumentOrKit) { 
      const standaloneSynth = instrumentOrKit as AnyToneSynth; 
      if (standaloneSynth instanceof R_.PolySynth && typeof standaloneSynth.releaseAll === 'function') standaloneSynth.releaseAll();
      if (typeof standaloneSynth.dispose === 'function' && !(standaloneSynth as any).disposed) standaloneSynth.dispose();
    }
  }, []);


  const stopAllAudioPreview = useCallback(() => {
    R_.Transport.stop();
    R_.Transport.cancel(); 
    toneJsPartsRef.current.forEach(part => {
      part.stop(0); part.clear(); part.dispose();
    });
    toneJsPartsRef.current.clear();
    toneJsInstrumentsRef.current.forEach(disposeTrackInstrument);
    toneJsInstrumentsRef.current.clear();
    lastSetupSynthParamsRef.current.clear();
    if (visualizerSyncLoopRef.current) {
      visualizerSyncLoopRef.current.stop(0).dispose();
      visualizerSyncLoopRef.current = null;
    }
  }, [disposeTrackInstrument]);

  const initMidi = useCallback(async () => {
    if (navigator.requestMIDIAccess) {
      try {
        const access = (await navigator.requestMIDIAccess({ sysex: false })) as MIDIAccess;
        setMidiAccess(access); setGlobalError(null);
        const inputs: MidiDevice[] = []; access.inputs.forEach(input => inputs.push({ id: input.id, name: input.name || 'Unknown Input' }));
        setMidiInputs(inputs); if (inputs.length > 0 && !selectedInputId) setSelectedInputId(inputs[0].id);
        const outputs: MidiDevice[] = []; access.outputs.forEach(output => outputs.push({ id: output.id, name: output.name || 'Unknown Output' }));
        setMidiOutputs(outputs); if (outputs.length > 0 && !selectedOutputId) setSelectedOutputId(outputs[0].id);
        access.onstatechange = (event: MIDIConnectionEvent) => {
          const updatedInputsList: MidiDevice[] = []; access.inputs.forEach(input => updatedInputsList.push({ id: input.id, name: input.name || 'Unknown Input'}));
          setMidiInputs(updatedInputsList);
          const updatedOutputsList: MidiDevice[] = []; access.outputs.forEach(output => updatedOutputsList.push({ id: output.id, name: output.name || 'Unknown Output'}));
          setMidiOutputs(updatedOutputsList);
          if (!updatedInputsList.find(i => i.id === selectedInputId) && updatedInputsList.length > 0) setSelectedInputId(updatedInputsList[0].id);
          if (selectedInputId && !updatedInputsList.find(i => i.id === selectedInputId)) setSelectedInputId(null);
          if (!updatedOutputsList.find(o => o.id === selectedOutputId) && updatedOutputsList.length > 0) setSelectedOutputId(updatedOutputsList[0].id);
          if (selectedOutputId && !updatedOutputsList.find(o => o.id === selectedOutputId)) { setSelectedOutputId(null); selectedOutputRef.current = null; if (!isPreviewMode) sendAllNotesOff(); }
        };
      } catch (error) { console.error('Could not access MIDI devices.', error); setGlobalError('Could not access MIDI devices.'); }
    } else { setGlobalError('WebMIDI API not supported.'); }
  }, [selectedInputId, selectedOutputId, sendAllNotesOff, isPreviewMode]);

  useEffect(() => { initMidi(); }, [initMidi]);

  const processMidiStep = useCallback((currentAbsoluteStep: number, timestamp?: number) => {
    if (isPreviewMode || !selectedOutputRef.current) return;
    
    // De-queue notes that should end on this step
    activePlayingNotesRef.current.forEach((trackNotes, trackId) => {
        const notesToRemoveFromActiveSet: ActiveMidiNote[] = [];
        trackNotes.forEach(activeNote => {
            if (activeNote.absoluteOffStep === currentAbsoluteStep) {
                selectedOutputRef.current?.send([0x80 + (activeNote.channel - 1), activeNote.note, 0], timestamp);
                notesToRemoveFromActiveSet.push(activeNote);
            }
        });
        notesToRemoveFromActiveSet.forEach(n => trackNotes.delete(n));
    });

    tracksRef.current.forEach(track => { 
        if (track.isMuted) return;

        let patternForStep: MidiNote[] | null = null;
        let trackLocalStep: number = 0;
        let noteStartStepInPattern: number;

        const liveEditData = liveEditingPatternRef.current.get(track.id);
        if (liveEditData && fullscreenTrackId === track.id) {
            patternForStep = liveEditData.pattern;
            const trackTotalSteps = liveEditData.bars * 16;
            trackLocalStep = trackTotalSteps > 0 ? currentAbsoluteStep % trackTotalSteps : 0;
        } else if (track.isProgressionChaining) {
            const historyWithBars = track.patternHistory.map(p => ({ ...p, bars: p.bars > 0 ? p.bars : DEFAULT_BARS }));
            const totalProgressionSteps = historyWithBars.reduce((sum, p) => sum + p.bars * 16, 0);

            if (totalProgressionSteps > 0) {
                const currentGlobalStepInProgression = currentAbsoluteStep % totalProgressionSteps;
                let cumulativeSteps = 0;
                for (const entry of historyWithBars) {
                    const patternSteps = entry.bars * 16;
                    if (currentGlobalStepInProgression >= cumulativeSteps && currentGlobalStepInProgression < cumulativeSteps + patternSteps) {
                        patternForStep = entry.pattern;
                        trackLocalStep = currentGlobalStepInProgression - cumulativeSteps;
                        break;
                    }
                    cumulativeSteps += patternSteps;
                }
            }
        } else {
            const historyEntry = track.patternHistory[track.currentPatternIndex];
            if (historyEntry) {
                patternForStep = historyEntry.pattern;
                const trackBarsForStep = (typeof historyEntry.bars === 'number' && historyEntry.bars > 0) ? historyEntry.bars : DEFAULT_BARS;
                const trackTotalSteps = trackBarsForStep * 16;
                trackLocalStep = trackTotalSteps > 0 ? currentAbsoluteStep % trackTotalSteps : 0;
            }
        }
        
        if (!patternForStep) return;

        let trackActiveNotes = activePlayingNotesRef.current.get(track.id);
        if (!trackActiveNotes) {
            trackActiveNotes = new Set();
            activePlayingNotesRef.current.set(track.id, trackActiveNotes);
        }

        patternForStep.forEach(note => {
            noteStartStepInPattern = Math.floor(note.time * 4); 
            if (noteStartStepInPattern === trackLocalStep) {
                let finalNote = note.note;
                if (track.type === TrackType.SYNTH && typeof track.octaveShift === 'number') {
                    finalNote += (track.octaveShift * 12);
                }
                finalNote = Math.max(0, Math.min(127, finalNote));
                selectedOutputRef.current?.send([0x90 + (track.channel - 1), finalNote, note.velocity], timestamp);
                const noteDurationSteps = Math.floor(note.duration * 4); 
                trackActiveNotes!.add({ note: finalNote, absoluteOffStep: currentAbsoluteStep + noteDurationSteps, channel: track.channel });
            }
        });

        if (track.type === TrackType.SYNTH && Array.isArray(track.ccAutomationData)) {
            track.ccAutomationData.forEach(ccData => {
                if (ccData && ccData.events) {
                    const automationTotalSteps = ccData.bars * 16;
                    const currentAutomationLocalStep = automationTotalSteps > 0 ? currentAbsoluteStep % automationTotalSteps : 0;
                    ccData.events.forEach(event => {
                        const eventStep = Math.floor(event.time * 4);
                        if (eventStep === currentAutomationLocalStep) {
                            let value = event.value;
                            const depth = ccData.depth ?? 1;
                            const offset = ccData.offset ?? 0;
                            const midpoint = 63.5;
                            value = midpoint + (value - midpoint) * depth;
                            value += offset;
                            value = Math.max(0, Math.min(127, Math.round(value)));
                            selectedOutputRef.current?.send([0xB0 + (track.channel - 1), ccData.cc, value], timestamp);
                        }
                    });
                }
            });
        }
    });
  }, [isPreviewMode, fullscreenTrackId]);

  const handleMidiMessage = useCallback((event: MIDIMessageEvent) => {
    if (isPreviewMode) {
      const [command] = event.data;
      if (command === 0xFC && isPlaying) setIsPlaying(false); 
      return;
    }
    const [command] = event.data;
    if (command === 0xF8 && selectedInputId) { 
        setIsExternalClock(true);
        const now = event.receivedTime || performance.now();
        midiClockTickTimesRef.current.push(now);
        if (midiClockTickTimesRef.current.length > PPQN * 2) midiClockTickTimesRef.current.shift();
        if (midiClockTickTimesRef.current.length >= PPQN) { 
            const diffs = []; for (let i = 1; i < midiClockTickTimesRef.current.length; i++) diffs.push(midiClockTickTimesRef.current[i] - midiClockTickTimesRef.current[i-1]);
            if (diffs.length > PPQN/2) { 
                const lastIndex = midiClockTickTimesRef.current.length - 1; const firstIndexInWindow = Math.max(0, lastIndex - (PPQN -1));
                const timeForWindow = midiClockTickTimesRef.current[lastIndex] - midiClockTickTimesRef.current[firstIndexInWindow];
                const ticksInWindow = lastIndex - firstIndexInWindow;
                if (timeForWindow > 0 && ticksInWindow >= PPQN/2) { 
                   const currentCalcBpm = (ticksInWindow / PPQN) * (60000 / timeForWindow);
                   setBpm(prevBpm => Math.round(currentCalcBpm * 0.2 + prevBpm * 0.8)); 
                }
            }
        }
        clockTickCounter++;
        if (clockTickCounter % (PPQN / 4) === 0) { 
            if (isPlaying) {
                const currentAbsoluteStepForLogic = absoluteStepRef.current;
                processMidiStep(currentAbsoluteStepForLogic, event.receivedTime);
                const nextStep = currentAbsoluteStepForLogic + 1;
                absoluteStepRef.current = nextStep;
                setDisplayStep(nextStep);
                
                const anyTrackChaining = tracksRef.current.some(t => t.isProgressionChaining);
                if (!anyTrackChaining) {
                    const loopEndStep = Math.max(16, ...tracksRef.current.map(t => {
                        const livePatternData = liveEditingPatternRef.current.get(t.id);
                        if (livePatternData && fullscreenTrackId === t.id) return livePatternData.bars * 16;
                        const currentEntry = t.patternHistory[t.currentPatternIndex];
                        const tb = (currentEntry && typeof currentEntry.bars === 'number' && currentEntry.bars > 0) ? currentEntry.bars : DEFAULT_BARS;
                        return currentEntry && currentEntry.pattern ? tb * 16 : 0;
                    }));
                    
                    const currentLoopStepForLogic = loopEndStep > 0 ? currentAbsoluteStepForLogic % loopEndStep : currentAbsoluteStepForLogic;
                     if (loopEndStep > 0 && currentLoopStepForLogic === loopEndStep - 1 && pendingPatternHistorySwitchRef.current && pendingPatternHistorySwitchRef.current.size > 0) {
                        const switchesToProcess = new Map(pendingPatternHistorySwitchRef.current); pendingPatternHistorySwitchRef.current = new Map(); 
                        const channelsToReset = new Set<number>();
                        setTracks(prevTracks => prevTracks.map(t => {
                            if (switchesToProcess.has(t.id)) {
                                const newIndexForTrack = switchesToProcess.get(t.id)!;
                                if (newIndexForTrack >= 0 && newIndexForTrack < t.patternHistory.length) {
                                     if (!isPreviewMode && selectedOutputRef.current) { channelsToReset.add(t.channel); activePlayingNotesRef.current.delete(t.id); }
                                    return { ...t, currentPatternIndex: newIndexForTrack, error: null };
                                }
                            } return t;
                        }));
                        if (!isPreviewMode && selectedOutputRef.current) channelsToReset.forEach(channel => selectedOutputRef.current?.send([0xB0 + (channel - 1), 123, 0], event.receivedTime));
                    }
                }
            }
        }
    } else if (command === 0xFA) { setIsExternalClock(true); absoluteStepRef.current = 0; setDisplayStep(0); clockTickCounter = 0; sendAllNotesOff(); setIsPlaying(true); processMidiStep(0, event.receivedTime); absoluteStepRef.current = 1; setDisplayStep(1); midiClockTickTimesRef.current = []; 
    } else if (command === 0xFB) { setIsExternalClock(true); setIsPlaying(true); midiClockTickTimesRef.current = []; 
    } else if (command === 0xFC) { setIsExternalClock(false); setIsPlaying(false); sendAllNotesOff(); midiClockTickTimesRef.current = []; clockTickCounter = 0; pendingPatternHistorySwitchRef.current = null;
    }
  }, [selectedInputId, isPlaying, processMidiStep, sendAllNotesOff, isPreviewMode, fullscreenTrackId]);

  useEffect(() => {
    const currentInput = midiAccess?.inputs.get(selectedInputId || '');
    if (currentInput) { currentInput.onmidimessage = handleMidiMessage; return () => { if(currentInput) currentInput.onmidimessage = null; }; }
  }, [midiAccess, selectedInputId, handleMidiMessage]);

  const setupToneTrack = useCallback((track: Track, temporaryPattern?: MidiNote[], temporaryBars?: number, overridePatternIndex?: number) => {
    let newInstrument: TrackInstrument | undefined; let shouldRecreateInstrument = true;
    
    let patternToUse: MidiNote[] | null = null;
    let barsToUse: number = DEFAULT_BARS;

    if (temporaryPattern) {
        patternToUse = temporaryPattern;
        barsToUse = temporaryBars || DEFAULT_BARS;
    } else if (track.isProgressionChaining) {
        // Previewing progression chaining is complex because Tone.Part needs a single loop.
        // For now, we'll just play the first pattern in the history for preview.
        const firstEntry = track.patternHistory[0];
        if (firstEntry) {
            patternToUse = firstEntry.pattern;
            barsToUse = firstEntry.bars > 0 ? firstEntry.bars : DEFAULT_BARS;
        }
    } else {
        const patternIdxToUse = overridePatternIndex !== undefined ? overridePatternIndex : track.currentPatternIndex;
        const currentHistoryEntry = track.patternHistory[patternIdxToUse];
        if (currentHistoryEntry) {
            patternToUse = currentHistoryEntry.pattern;
            barsToUse = currentHistoryEntry.bars > 0 ? currentHistoryEntry.bars : DEFAULT_BARS;
        }
    }

    if (!patternToUse || patternToUse.length === 0) {
      disposeTrackInstrument(toneJsInstrumentsRef.current.get(track.id));
      toneJsInstrumentsRef.current.delete(track.id); lastSetupSynthParamsRef.current.delete(track.id);
      const oldPart = toneJsPartsRef.current.get(track.id); if (oldPart) { oldPart.stop(0).clear().dispose(); toneJsPartsRef.current.delete(track.id); } return;
    }
    
    if (track.type === TrackType.SYNTH && track.synthParams) {
      const newParams = track.synthParams; const lastParams = lastSetupSynthParamsRef.current.get(track.id);
      const existingInstrument = toneJsInstrumentsRef.current.get(track.id) as SynthTrackInstrument | undefined;
      if (existingInstrument && lastParams && newParams.activeSynthType === lastParams.activeSynthType) {
        shouldRecreateInstrument = false;
        if (newParams.activeSynthType === 'PolySynth' && existingInstrument instanceof R_.PolySynth && newParams.PolySynth.polyphony !== lastParams.PolySynth.polyphony) shouldRecreateInstrument = true;
      }
      if (shouldRecreateInstrument) {
        disposeTrackInstrument(existingInstrument); const collectionParams = newParams; const activeType = collectionParams.activeSynthType;
        let createdToneJsSynth: AnyToneSynth | BasicSynthTrackInstruments | undefined;
        switch(activeType) {
          case 'BasicSynth': { const params = collectionParams.BasicSynth; const synth = new R_.Synth({ oscillator: { type: params.oscillator.type }, envelope: params.amplitudeEnvelope }); synth.detune.value = params.oscillator.detune; const basicFilter = new R_.Filter(params.filter.frequency, params.filter.type); basicFilter.Q.value = params.filter.Q; const filterEnvelope = new R_.FrequencyEnvelope(params.filterEnvelope); filterEnvelope.connect(basicFilter.frequency); synth.connect(basicFilter); basicFilter.toDestination(); createdToneJsSynth = { synth, filter: basicFilter, filterEnvelope: filterEnvelope }; break; }
          case 'MonoSynth': { const params = collectionParams.MonoSynth; let r = Number(params.filter.rolloff); if (![-12, -24, -48, -96].includes(r)) r = -12; createdToneJsSynth = new R_.MonoSynth({ oscillator: {type: params.oscillatorType }, detune: params.detune, portamento: params.portamento, envelope: params.amplitudeEnvelope, filter: { type: params.filter.type, Q: params.filter.Q, rolloff: r as R_.FilterRollOff }, filterEnvelope: params.filterEnvelope, }).toDestination(); break; }
          case 'FMSynth': { const params = collectionParams.FMSynth; createdToneJsSynth = new R_.FMSynth({ harmonicity: params.harmonicity, modulationIndex: params.modulationIndex, detune: params.detune, oscillator: { type: params.carrier.type }, envelope: params.carrier.envelope, modulation: { type: params.modulator.type }, modulationEnvelope: params.modulator.envelope, }).toDestination(); break; }
          case 'PolySynth': { const params = collectionParams.PolySynth; let r = Number(params.filter.rolloff); if (![-12, -24, -48, -96].includes(r)) r = -12; const opts: Partial<R_.PolySynthOptions<R_.MonoSynth>> = { maxPolyphony: params.polyphony, voice: R_.MonoSynth, options: { detune: params.detune, oscillator: { type: params.oscillator.type }, envelope: params.amplitudeEnvelope, filter: { type: params.filter.type, Q: params.filter.Q, rolloff: r as R_.FilterRollOff }, filterEnvelope: params.filterEnvelope, }}; createdToneJsSynth = new R_.PolySynth(opts).toDestination(); break; }
          default: const params = collectionParams.BasicSynth; const synth = new R_.Synth({ oscillator: { type: params.oscillator.type }, envelope: params.amplitudeEnvelope }); const fF = new R_.Filter(params.filter.frequency, params.filter.type); fF.Q.value = params.filter.Q; const fFe = new R_.FrequencyEnvelope(params.filterEnvelope); fFe.connect(fF.frequency); synth.connect(fF); fF.toDestination(); createdToneJsSynth = { synth, filter: fF, filterEnvelope: fFe }; 
        }
        if (createdToneJsSynth) { newInstrument = createdToneJsSynth; toneJsInstrumentsRef.current.set(track.id, newInstrument); lastSetupSynthParamsRef.current.set(track.id, JSON.parse(JSON.stringify(newParams))); }
      } else if (existingInstrument) { newInstrument = existingInstrument; if(!temporaryPattern) lastSetupSynthParamsRef.current.set(track.id, JSON.parse(JSON.stringify(newParams)));}
      if (newInstrument) { const targetVolume = track.isMuted ? -Infinity : 0; if ('synth' in newInstrument) (newInstrument as BasicSynthTrackInstruments).synth.volume.value = targetVolume; else (newInstrument as AnyToneSynth).volume.value = targetVolume; }
    } else if (track.type === TrackType.DRUM) {
      disposeTrackInstrument(toneJsInstrumentsRef.current.get(track.id)); const trackSpecificDrumSynths: DrumKitInstruments = new Map();
      const uniqueNotesInPattern = new Set(patternToUse.map(n => n.note));
      uniqueNotesInPattern.forEach(midiNote => {
        const config = drumSynthConfigs[midiNote] || defaultDrumSynthConfig; let synthInstance: R_.MembraneSynth | R_.NoiseSynth;
        if (config.type === 'membrane') synthInstance = new R_.MembraneSynth(config.options).toDestination(); else synthInstance = new R_.NoiseSynth(config.options).toDestination();
        synthInstance.volume.value = track.isMuted ? -Infinity : 0; trackSpecificDrumSynths.set(midiNote, synthInstance);
      });
      newInstrument = trackSpecificDrumSynths; toneJsInstrumentsRef.current.set(track.id, newInstrument);
      if(!temporaryPattern) lastSetupSynthParamsRef.current.delete(track.id); 
    }
    const oldPart = toneJsPartsRef.current.get(track.id); if (oldPart) { oldPart.stop(0).clear().dispose(); toneJsPartsRef.current.delete(track.id); }
    const validNotes = patternToUse.filter(note => note && typeof note.note === 'number' && typeof note.velocity === 'number' && typeof note.time === 'number' && typeof note.duration === 'number' && isFinite(note.note) && isFinite(note.velocity) && isFinite(note.time) && isFinite(note.duration) && note.time >= 0 && note.duration > 0 && note.note >= 0 && note.note <= 127 && note.velocity >= 0 && note.velocity <= 127);
    if (validNotes.length === 0 || !newInstrument) return; 
    const sortedValidNotes = [...validNotes].sort((a, b) => a.time - b.time);
    const currentTransportBpm = R_.Transport.bpm.value; const sixteenthNoteDurationSecs = (60 / currentTransportBpm) / 4;
    if (!isFinite(sixteenthNoteDurationSecs) || sixteenthNoteDurationSecs <= 0) return;

    if (track.type === TrackType.SYNTH && newInstrument && ! (newInstrument instanceof Map)) {
        const events = sortedValidNotes.map(note => {
            let finalNoteMidi = note.note + (track.octaveShift || 0) * 12; finalNoteMidi = Math.max(0, Math.min(127, finalNoteMidi));
            const noteName = R_.Frequency(finalNoteMidi, "midi").toNote();
            const timeInSeconds = note.time * 4 * sixteenthNoteDurationSecs; const durationInSeconds = note.duration * 4 * sixteenthNoteDurationSecs;
            if (!isFinite(timeInSeconds) || !isFinite(durationInSeconds) || durationInSeconds <=0) return null;
            return { time: timeInSeconds, note: noteName, duration: durationInSeconds, velocity: note.velocity / 127 };
        }).filter(event => event !== null) as Array<{ time: number; note: string; duration: number; velocity: number; }>;
        
        if (events.length > 0) {
            const TIME_EPSILON = 1e-5; // Increased epsilon
            for (let i = 1; i < events.length; i++) {
                 if (events[i].time <= events[i-1].time) {
                     events[i].time = events[i-1].time + TIME_EPSILON;
                 }
            }
            const part = new R_.Part((time, value: any) => {
            if (track.isMuted) return; const liveSynthInstrument = toneJsInstrumentsRef.current.get(track.id) as SynthTrackInstrument | undefined; if (!liveSynthInstrument) return;
            if ('synth' in liveSynthInstrument && 'filter' in liveSynthInstrument) { liveSynthInstrument.synth.triggerAttackRelease(value.note, value.duration, time, value.velocity); liveSynthInstrument.filterEnvelope.triggerAttackRelease(value.duration, time); } 
            else { (liveSynthInstrument as AnyToneSynth).triggerAttackRelease(value.note, value.duration, time, value.velocity); }
            }, events).start(0); part.loop = true; part.loopEnd = `${barsToUse}m`; toneJsPartsRef.current.set(track.id, part);
        }
    } else if (track.type === TrackType.DRUM && newInstrument && (newInstrument instanceof Map)) {
        let events = sortedValidNotes.map(note => {
            const timeInSeconds = note.time * 4 * sixteenthNoteDurationSecs; const durationInSeconds = note.duration * 4 * sixteenthNoteDurationSecs;
            if (!isFinite(timeInSeconds) || !isFinite(durationInSeconds) || durationInSeconds <=0) return null;
            return { time: timeInSeconds, midiNote: note.note, eventDurationSeconds: durationInSeconds, velocity: note.velocity / 127 };
        }).filter(event => event !== null) as { time: number; midiNote: number; eventDurationSeconds: number; velocity: number; }[];
        
        if (events.length > 0) {
            const TIME_EPSILON = 1e-5; // Increased epsilon
            for (let i = 1; i < events.length; i++) {
                 if (events[i].time <= events[i-1].time) {
                     events[i].time = events[i-1].time + TIME_EPSILON;
                 }
            }
            const part = new R_.Part((time, value: any) => {
            if (track.isMuted) return; const kitInstruments = toneJsInstrumentsRef.current.get(track.id) as DrumKitInstruments | undefined; if (!kitInstruments) return;
            const specificDrumSynth = kitInstruments.get(value.midiNote); if (!specificDrumSynth) return; const config = drumSynthConfigs[value.midiNote] || defaultDrumSynthConfig;
            if (specificDrumSynth instanceof R_.MembraneSynth) { const noteName = R_.Frequency(value.midiNote, "midi").toNote(); specificDrumSynth.triggerAttackRelease(noteName, config.triggerDuration || "32n", time, value.velocity); } 
            else if (specificDrumSynth instanceof R_.NoiseSynth) { const durationToUse = config.triggerDuration || value.eventDurationSeconds; specificDrumSynth.triggerAttackRelease(durationToUse, time, value.velocity); }
            }, events).start(0); part.loop = true; part.loopEnd = `${barsToUse}m`; toneJsPartsRef.current.set(track.id, part);
        }
    }
  }, [disposeTrackInstrument]); 

  const anyTrackChaining = tracks.some(t => t.isProgressionChaining);

  useEffect(() => {
    if (isPreviewMode) {
      ensureToneStarted().then(() => {
        R_.Transport.bpm.value = bpm;
        R_.Transport.loop = isLooping && !anyTrackChaining;

        let calculatedMaxBars = 0;
        
        if (anyTrackChaining) {
             R_.Transport.loop = false; // Never loop in preview if any track is chaining
             calculatedMaxBars = Math.max(...tracks.filter(t => t.isProgressionChaining).map(t => {
                 return t.patternHistory.reduce((sum, p) => sum + (p.bars > 0 ? p.bars : DEFAULT_BARS), 0);
             }));
        } else {
             tracks.forEach(track => { 
                setupToneTrack(track, undefined, undefined, undefined); 
                const currentHistoryEntry = track.patternHistory[track.currentPatternIndex];
                if (currentHistoryEntry?.pattern?.length) {
                    calculatedMaxBars = Math.max(calculatedMaxBars, currentHistoryEntry.bars > 0 ? currentHistoryEntry.bars : DEFAULT_BARS);
                }
            });
            if (tracks.every(t => !t.patternHistory[t.currentPatternIndex]?.pattern?.length)) calculatedMaxBars = 0;
        }
        
        calculatedMaxBars = Math.max(DEFAULT_BARS, calculatedMaxBars);
        let transportLoopEndNotation = `${calculatedMaxBars}m`;
        try { R_.Time(transportLoopEndNotation).valueOf(); } 
        catch (e) { transportLoopEndNotation = `${DEFAULT_BARS}m`; }
        R_.Transport.loopEnd = transportLoopEndNotation;
      });
    } else { stopAllAudioPreview(); }
  }, [isPreviewMode, tracks, bpm, isLooping, setupToneTrack, stopAllAudioPreview, anyTrackChaining]);


  useEffect(() => {
    if (isPreviewMode) {
      if (isPlaying) {
        ensureToneStarted().then(() => {
          if (R_.Transport.state !== 'started') R_.Transport.start(R_.now());
          if (!visualizerSyncLoopRef.current) {
            visualizerSyncLoopRef.current = new R_.Loop(time => {
              R_.Draw.schedule(() => {
                const totalSecondsElapsed = R_.Transport.seconds;
                if (typeof totalSecondsElapsed === 'number' && isFinite(totalSecondsElapsed)) {
                    const currentAbsoluteSixteenth = Math.floor(totalSecondsElapsed * (R_.Transport.bpm.value / 60) * 4);
                    if (isFinite(currentAbsoluteSixteenth)) {
                         absoluteStepRef.current = currentAbsoluteSixteenth;
                         setDisplayStep(currentAbsoluteSixteenth);
                    }
                }
                
                if (!anyTrackChaining && R_.Transport.loop) {
                    const transportLoopEndSixteenths = R_.Time(R_.Transport.loopEnd).toTicks() / (R_.Transport.PPQ / 4); 
                    if (transportLoopEndSixteenths > 0 && Math.floor(R_.Transport.progress * transportLoopEndSixteenths) === 0 && pendingPatternHistorySwitchRef.current?.size > 0) { 
                        const switchesToProcess = new Map(pendingPatternHistorySwitchRef.current); pendingPatternHistorySwitchRef.current = new Map(); 
                        setTracks(prevTracks => prevTracks.map(t => {
                            if (switchesToProcess.has(t.id)) {
                                const newIndexForTrack = switchesToProcess.get(t.id)!;
                                if (newIndexForTrack >= 0 && newIndexForTrack < t.patternHistory.length) return { ...t, currentPatternIndex: newIndexForTrack, error: null };
                            } return t;
                        }));
                    }
                }

              }, time);
            }, "16n").start(0);
          }
        });
      } else { 
        if (R_.Transport.state === 'started') R_.Transport.pause();
        if (visualizerSyncLoopRef.current) { visualizerSyncLoopRef.current.stop(0).dispose(); visualizerSyncLoopRef.current = null; }
      }
    } else { // MIDI Output Mode
      if (isPlaying && !isExternalClock) {
        lastStepTimeRef.current = performance.now();
        const scheduler = () => {
          if (!isPlaying || isExternalClock || isPreviewMode) { if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current); animationFrameIdRef.current = null; return; }
          
          const nextAbsoluteStepToProcess = absoluteStepRef.current;
          const now = performance.now(); const stepDurationMs = (60000 / bpm) / 4;
          if (now - lastStepTimeRef.current >= stepDurationMs) {
            const targetStepTimestamp = lastStepTimeRef.current + stepDurationMs * Math.floor((now - lastStepTimeRef.current) / stepDurationMs);

            processMidiStep(nextAbsoluteStepToProcess, targetStepTimestamp);
            lastStepTimeRef.current = targetStepTimestamp;
            const nextStep = nextAbsoluteStepToProcess + 1;
            absoluteStepRef.current = nextStep;
            setDisplayStep(nextStep);

            if (!anyTrackChaining) {
                const loopEndStepForNormalMode = Math.max(16, ...tracksRef.current.map(t => {
                    if (t.isProgressionChaining) return 0; // Exclude from loop calculation
                    const livePatternData = liveEditingPatternRef.current.get(t.id);
                    if (livePatternData && fullscreenTrackId === t.id) return livePatternData.bars * 16;
                    const currentEntry = t.patternHistory[t.currentPatternIndex];
                    const tb = (currentEntry && typeof currentEntry.bars === 'number' && currentEntry.bars > 0) ? currentEntry.bars : DEFAULT_BARS;
                    return currentEntry && currentEntry.pattern ? tb * 16 : 0;
                }));

                const currentLocalStepForLogic = loopEndStepForNormalMode > 0 ? nextAbsoluteStepToProcess % loopEndStepForNormalMode : nextAbsoluteStepToProcess;
                
                if (loopEndStepForNormalMode > 0 && currentLocalStepForLogic === loopEndStepForNormalMode - 1 && pendingPatternHistorySwitchRef.current?.size > 0) {
                    const switchesToProcess = new Map(pendingPatternHistorySwitchRef.current); pendingPatternHistorySwitchRef.current = new Map(); 
                    const channelsToReset = new Set<number>();
                    setTracks(prevTracks => prevTracks.map(t => {
                        if (switchesToProcess.has(t.id)) {
                            const newIndexForTrack = switchesToProcess.get(t.id)!;
                            if (newIndexForTrack >= 0 && newIndexForTrack < t.patternHistory.length) {
                               if (!isPreviewMode && selectedOutputRef.current) { channelsToReset.add(t.channel); activePlayingNotesRef.current.delete(t.id); }
                                return { ...t, currentPatternIndex: newIndexForTrack, error: null };
                            }
                        } return t;
                    }));
                    if (!isPreviewMode && selectedOutputRef.current) channelsToReset.forEach(channel => selectedOutputRef.current?.send([0xB0 + (channel - 1), 123, 0]));
                }
            }
          }
          animationFrameIdRef.current = requestAnimationFrame(scheduler);
        };
        animationFrameIdRef.current = requestAnimationFrame(scheduler);
      } else { 
         if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current); animationFrameIdRef.current = null;
         if (!isExternalClock && !isPreviewMode) sendAllNotesOff();
      }
    }
    return () => { 
        if (isPreviewMode && visualizerSyncLoopRef.current) { visualizerSyncLoopRef.current.stop(0).dispose(); visualizerSyncLoopRef.current = null; }
        if (animationFrameIdRef.current) { cancelAnimationFrame(animationFrameIdRef.current); animationFrameIdRef.current = null; }
    };
  }, [isPlaying, isPreviewMode, isExternalClock, bpm, processMidiStep, sendAllNotesOff, fullscreenTrackId, anyTrackChaining]);


  const handlePlayToggle = async () => {
    if (isPlaying) { 
      setIsPlaying(false);
      pendingPatternHistorySwitchRef.current = null;
    } else { 
       if (visualizerSyncLoopRef.current && R_.Transport.state === 'paused') {
          // just resume
       } else {
          absoluteStepRef.current = 0; 
          setDisplayStep(0);
       }
       if (isPreviewMode) await ensureToneStarted();
       setIsPlaying(true);
    }
  };
  
  const handlePreviewModeToggle = () => {
    const switchingToPreview = !isPreviewMode; const wasPlaying = isPlaying;
    setIsPlaying(false); pendingPatternHistorySwitchRef.current = null;
    if (switchingToPreview) { sendAllNotesOff(); liveEditingPatternRef.current.clear(); } 
    else { 
        stopAllAudioPreview(); 
        if (fullscreenTrackId) {
            const trackToEdit = tracksRef.current.find(t => t.id === fullscreenTrackId);
            if (trackToEdit) {
                const currentEntry = trackToEdit.patternHistory[trackToEdit.currentPatternIndex];
                liveEditingPatternRef.current.set(fullscreenTrackId, { pattern: JSON.parse(JSON.stringify(currentEntry?.pattern || [])), bars: currentEntry?.bars || DEFAULT_BARS });
            }
        }
    }
    setIsPreviewMode(switchingToPreview);
    absoluteStepRef.current = 0;
    setDisplayStep(0);
    if (wasPlaying) setTimeout(() => setIsPlaying(true), 150);
  };

  useEffect(() => { return () => { 
      if (!isPreviewMode && selectedOutputRef.current) sendAllNotesOff();
      stopAllAudioPreview(); toneStartedRef.current = false; 
      pendingPatternHistorySwitchRef.current = null;
      liveEditingPatternRef.current.clear();
    };
  }, [isPreviewMode, sendAllNotesOff, stopAllAudioPreview]);

  const handleGeneratePattern = async (trackId: string, userPrompt: string, barsToGenerate: number, masterContext?: string, isChainedGeneration: boolean = false) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, isLoading: true, error: null } : t));
    try {
      const currentTrack = tracksRef.current.find(t => t.id === trackId)!;
      let finalUserPrompt = userPrompt;
      if (currentTrack.type === TrackType.SYNTH && currentTrack.synthRole && currentTrack.synthRole !== SynthRole.GENERAL_SYNTH) {
        const roleLabel = SYNTH_ROLE_LABELS[currentTrack.synthRole] || "Synth";
        finalUserPrompt = `For a ${roleLabel.toLowerCase()} role: ${userPrompt}`;
      }
      const generatedNotes = await generateMidiPattern(finalUserPrompt, currentTrack.type, barsToGenerate, currentTrack.type === TrackType.DRUM ? ROLAND_TR8S_MAP : undefined, masterContext);
      const newHistoryEntry: PatternHistoryEntry = { pattern: generatedNotes, bars: barsToGenerate, prompt: userPrompt }; // Store original user prompt
      const currentlyPlaying = isPlaying; 

      setTracks(prev => prev.map(t => {
        if (t.id === trackId) {
          const wasHistoryEmpty = t.patternHistory.length === 0;
          let finalPatternHistory = [newHistoryEntry, ...t.patternHistory].slice(0, MAX_PATTERN_HISTORY);
          let newCurrentPatternIndex = 0; 
          if (!isChainedGeneration && currentlyPlaying && !wasHistoryEmpty) {
            newCurrentPatternIndex = t.currentPatternIndex + 1; 
          }
          return { ...t, patternHistory: finalPatternHistory, currentPatternIndex: newCurrentPatternIndex, isLoading: false, error: null };
        } return t;
      }));

      if (!isChainedGeneration && currentlyPlaying && !anyTrackChaining) {
        if (!pendingPatternHistorySwitchRef.current) pendingPatternHistorySwitchRef.current = new Map();
        pendingPatternHistorySwitchRef.current.set(trackId, 0); 
      }
      return 0; // Return the new pattern index (always 0 when a new pattern is added to the front)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error.';
      setTracks(prev => prev.map(t => t.id === trackId ? { ...t, isLoading: false, error: errorMessage } : t));
      throw error; 
    }
  };
  
  const handleMasterPromptChange = (prompt: string) => setMasterPrompt(prompt);
  const handleStylePromptChange = (prompt: string) => setStylePrompt(prompt);
  const handleMasterPromptBarsChange = (newBars: number) => setMasterPromptBars(Math.max(1, Math.min(newBars, MAX_BARS)));

  const handleGenerateAllFromMaster = async () => {
    const combinedContext = getCombinedMasterContext();
    if (!combinedContext.trim() && !showMasterPrompt) { setGlobalError("Style/Genre must be filled, or Master Prompt must be enabled and filled."); return; }
    if (showMasterPrompt && !masterPrompt.trim()) { setGlobalError("Master prompt cannot be empty when it is enabled."); return; }
    setGlobalError(null); setIsGeneratingAll(true);
    if (isPlaying) setIsPlaying(false); 
    setTracks(prevTracks => prevTracks.map(t => ({ ...t, isLoading: true, error: null })));
    const barsToGenerate = masterPromptBars; 
    const generationPromises = tracksRef.current.map(track => { 
      let userRolePrompt = ""; 
      if (track.type === TrackType.DRUM) {
        userRolePrompt = `Generate a ${barsToGenerate}-bar drum pattern.`;
      } else if (track.type === TrackType.SYNTH) {
        let roleHint = "";
        if (track.synthRole && track.synthRole !== SynthRole.GENERAL_SYNTH && SYNTH_ROLE_LABELS[track.synthRole]) {
          roleHint = `${SYNTH_ROLE_LABELS[track.synthRole].toLowerCase()}`;
        } else {
            const nameLower = track.name.toLowerCase();
            if (nameLower.includes("bass")) roleHint = "bassline synth";
            else if (nameLower.includes("lead") || nameLower.includes("melody")) roleHint = "lead synth melody";
            else if (nameLower.includes("pad") || nameLower.includes("chord")) roleHint = "synth chord progression or pad";
            else roleHint = "supporting synth";
        }
        userRolePrompt = `Generate a ${barsToGenerate}-bar ${roleHint} pattern.`;
      }
      return handleGeneratePattern(track.id, userRolePrompt, barsToGenerate, combinedContext, false) 
        .catch(e => ({ trackId: track.id, error: e instanceof Error ? e.message : "Unknown error during master generation." }));
    });
    await Promise.allSettled(generationPromises);
    setIsGeneratingAll(false);
  };

  const handleModifyPattern = async (trackId: string, userPromptFromCard: string, masterContext?: string) => {
    const trackIndex = tracksRef.current.findIndex(t => t.id === trackId);
    if (trackIndex === -1) return;
    const currentTrack = tracksRef.current[trackIndex];
    const currentHistoryEntry = currentTrack.patternHistory[currentTrack.currentPatternIndex];
    if (!currentHistoryEntry || !currentHistoryEntry.pattern) {
        setTracks(prev => prev.map(t => t.id === trackId ? { ...t, error: "No pattern to modify." } : t));
        return;
    }
    const currentPatternBars = (typeof currentHistoryEntry.bars === 'number' && currentHistoryEntry.bars > 0) ? currentHistoryEntry.bars : DEFAULT_BARS;
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, isLoading: true, error: null } : t));

    let promptForGemini = userPromptFromCard;
    if (currentTrack.type === TrackType.SYNTH && currentTrack.synthRole && currentTrack.synthRole !== SynthRole.GENERAL_SYNTH) {
        const roleLabel = SYNTH_ROLE_LABELS[currentTrack.synthRole] || "Synth";
        promptForGemini = `For a ${roleLabel.toLowerCase()} role: ${userPromptFromCard}`;
    }

    try {
        const modifiedNotes = await modifyMidiPattern(promptForGemini, currentHistoryEntry.pattern, currentTrack.type, currentPatternBars, masterContext, currentTrack.type === TrackType.DRUM ? ROLAND_TR8S_MAP : undefined);
        const newHistoryEntry: PatternHistoryEntry = { pattern: modifiedNotes, bars: currentPatternBars, prompt: userPromptFromCard };
        const currentlyPlaying = isPlaying;
        setTracks(prev => prev.map(t => {
            if (t.id === trackId) {
                let finalPatternHistory = [newHistoryEntry, ...t.patternHistory].slice(0, MAX_PATTERN_HISTORY);
                let newCurrentPatternIndex = 0;
                if (currentlyPlaying && !anyTrackChaining) newCurrentPatternIndex = t.currentPatternIndex + 1;
                return { ...t, patternHistory: finalPatternHistory, currentPatternIndex: newCurrentPatternIndex, isLoading: false, error: null };
            }
            return t;
        }));
        if (currentlyPlaying && !anyTrackChaining) {
            if (!pendingPatternHistorySwitchRef.current) pendingPatternHistorySwitchRef.current = new Map();
            pendingPatternHistorySwitchRef.current.set(trackId, 0);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error.';
        setTracks(prev => prev.map(t => t.id === trackId ? { ...t, isLoading: false, error: errorMessage } : t));
    }
  };


  const handleGenerateCcAutomation = async (trackId: string, userPrompt: string, ccNumber: number, bars: number, laneIndex: number) => {
    setTracks(prev => prev.map(t => {
        if (t.id === trackId) {
            const newIsGeneratingCc = [...(t.isGeneratingCc || Array(NUM_CC_LANES).fill(false))];
            newIsGeneratingCc[laneIndex] = true;
            const newCcError = [...(t.ccError || Array(NUM_CC_LANES).fill(null))];
            newCcError[laneIndex] = null;
            return { ...t, isGeneratingCc: newIsGeneratingCc, ccError: newCcError };
        } return t;
    }));

    try {
        const currentTrack = tracksRef.current.find(t => t.id === trackId)!;
        let finalUserPrompt = userPrompt;
        if (currentTrack.type === TrackType.SYNTH && currentTrack.synthRole && currentTrack.synthRole !== SynthRole.GENERAL_SYNTH) {
            const roleLabel = SYNTH_ROLE_LABELS[currentTrack.synthRole] || "Synth";
            finalUserPrompt = `For a synth with a ${roleLabel.toLowerCase()} role: ${userPrompt}`;
        }
        const generatedEvents = await generateCcAutomation(finalUserPrompt, ccNumber, bars);
        const sortedEvents = generatedEvents.sort((a,b) => a.time - b.time);

        setTracks(prev => prev.map(t => {
            if (t.id === trackId) {
                const newCcAutomationData = [...(t.ccAutomationData || Array(NUM_CC_LANES).fill(null))];
                newCcAutomationData[laneIndex] = { cc: ccNumber, events: sortedEvents, prompt: userPrompt, bars: bars, depth: 1, offset: 0 };
                const newIsGeneratingCc = [...(t.isGeneratingCc || Array(NUM_CC_LANES).fill(false))];
                newIsGeneratingCc[laneIndex] = false;
                const newCcError = [...(t.ccError || Array(NUM_CC_LANES).fill(null))];
                newCcError[laneIndex] = null;
                return { ...t, ccAutomationData: newCcAutomationData, isGeneratingCc: newIsGeneratingCc, ccError: newCcError };
            }
            return t;
        }));
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error generating CC automation.';
        setTracks(prev => prev.map(t => {
            if (t.id === trackId) {
                const newIsGeneratingCc = [...(t.isGeneratingCc || Array(NUM_CC_LANES).fill(false))];
                newIsGeneratingCc[laneIndex] = false;
                const newCcError = [...(t.ccError || Array(NUM_CC_LANES).fill(null))];
                newCcError[laneIndex] = errorMessage;
                return { ...t, isGeneratingCc: newIsGeneratingCc, ccError: newCcError };
            }
            return t;
        }));
    }
};

  const handleUpdateCcAutomationParams = (trackId: string, laneIndex: number, params: { depth?: number, offset?: number }) => {
    setTracks(prevTracks => prevTracks.map(t => {
        if (t.id === trackId && t.ccAutomationData && t.ccAutomationData[laneIndex]) {
            const newCcAutomationData = [...t.ccAutomationData];
            const updatedLaneData = { ...newCcAutomationData[laneIndex]! };
            if (params.depth !== undefined) updatedLaneData.depth = Math.max(0, Math.min(1, params.depth));
            if (params.offset !== undefined) updatedLaneData.offset = Math.max(-127, Math.min(127, Math.round(params.offset)));
            newCcAutomationData[laneIndex] = updatedLaneData;
            return { ...t, ccAutomationData: newCcAutomationData };
        } return t;
    }));
  };

  const updateTrackChannel = (trackId: string, channel: number) => setTracks(prev => prev.map(t => t.id === trackId ? { ...t, channel } : t));
  const updateTrackPromptInAppState = useCallback((trackId: string, newPrompt: string) => {
     setTracks(prev => prev.map(t => {
       if (t.id === trackId && t.patternHistory[t.currentPatternIndex]) {
         const newPatternHistory = [...t.patternHistory]; const currentEntry = newPatternHistory[t.currentPatternIndex];
         if (currentEntry.prompt !== newPrompt) { newPatternHistory[t.currentPatternIndex] = { ...currentEntry, prompt: newPrompt }; return { ...t, patternHistory: newPatternHistory };}
       } return t;
     }));
  }, []); 
  const handleUpdateTrackOctaveShift = (trackId: string, newShift: number) => setTracks(prevTracks => prevTracks.map(t => (t.id === trackId && t.type === TrackType.SYNTH) ? { ...t, octaveShift: Math.max(MIN_OCTAVE_SHIFT, Math.min(MAX_OCTAVE_SHIFT, newShift)) } : t));
  const handleUpdateTrackSynthRole = (trackId: string, role: SynthRole) => {
    setTracks(prevTracks => prevTracks.map(t => (t.id === trackId && t.type === TrackType.SYNTH) ? { ...t, synthRole: role } : t));
  };
  const handleToggleTrackMute = (trackId: string) => {
    setTracks(prevTracks => prevTracks.map(t => {
        if (t.id === trackId) {
          const newMutedState = !t.isMuted;
          if (isPreviewMode) { 
            const instrumentOrKit = toneJsInstrumentsRef.current.get(trackId);
            if (instrumentOrKit) {
              const targetVolume = newMutedState ? -Infinity : 0;
              if (instrumentOrKit instanceof Map) instrumentOrKit.forEach(synth => synth.volume.value = targetVolume);
              else if ('synth' in instrumentOrKit && 'filter' in instrumentOrKit) (instrumentOrKit as BasicSynthTrackInstruments).synth.volume.value = targetVolume;
              else if ('volume' in instrumentOrKit) (instrumentOrKit as AnyToneSynth).volume.value = targetVolume;
            }
          } else { 
            if (newMutedState) { 
                const trackToMute = tracksRef.current.find(tr => tr.id === trackId);
                if (trackToMute && selectedOutputRef.current) {
                    const activeNotesOnTrack = activePlayingNotesRef.current.get(trackId);
                    if (activeNotesOnTrack) { activeNotesOnTrack.forEach(activeNote => selectedOutputRef.current?.send([0x80 + (activeNote.channel - 1), activeNote.note, 0])); activeNotesOnTrack.clear(); }
                    selectedOutputRef.current?.send([0xB0 + (trackToMute.channel - 1), 123, 0]);
                }
            }
          } return { ...t, isMuted: newMutedState };
        } return t;
      }));
  };
  const handleChangeSynthType = (trackId: string, newType: SupportedSynthType) => {
    setTracks(prevTracks => prevTracks.map(t => {
        if (t.id === trackId && t.type === TrackType.SYNTH && t.synthParams) {
          if (t.synthParams.activeSynthType === newType) return t; 
          let newSynthParams = { ...t.synthParams, activeSynthType: newType };
          if (!newSynthParams[newType]) {
            let defaultParamsForNewType;
            if (newType === 'BasicSynth') defaultParamsForNewType = DEFAULT_BASIC_SYNTH_PARAMS; else if (newType === 'MonoSynth') defaultParamsForNewType = DEFAULT_MONOSYNTH_PARAMS;
            else if (newType === 'FMSynth') defaultParamsForNewType = DEFAULT_FMSYNTH_PARAMS; else if (newType === 'PolySynth') defaultParamsForNewType = DEFAULT_POLYSYNTH_PARAMS;
            else defaultParamsForNewType = DEFAULT_BASIC_SYNTH_PARAMS;
            newSynthParams = { ...newSynthParams, [newType]: JSON.parse(JSON.stringify(defaultParamsForNewType))};
          } return { ...t, synthParams: newSynthParams };
        } return t;
      }));
  };
 const handleUpdateSynthParam = (trackId: string, synthType: SupportedSynthType, relativePath: string, value: any) => {
    setTracks(prevTracks => prevTracks.map(t => {
        if (t.id === trackId && t.type === TrackType.SYNTH && t.synthParams && t.synthParams[synthType]) {
          const paramsForType = { ...t.synthParams[synthType] } as any; const keys = relativePath.split('.'); let currentLevel = paramsForType;
          keys.forEach((key, index) => {
            if (index === keys.length - 1) currentLevel[key] = value;
            else { if (typeof currentLevel[key] !== 'object' || currentLevel[key] === null) currentLevel[key] = {}; else currentLevel[key] = {...currentLevel[key]}; currentLevel = currentLevel[key];}
          });
          return { ...t, synthParams: { ...t.synthParams, [synthType]: paramsForType } };
        } return t;
      }));
    if (isPreviewMode) {
      const liveInstrument = toneJsInstrumentsRef.current.get(trackId); if (!liveInstrument) return;
      if (synthType === 'PolySynth' && relativePath === 'polyphony') { const track = tracksRef.current.find(t => t.id === trackId); if(track) setupToneTrack(track, undefined, undefined, undefined); return; }
      let finalValue = value; if ((synthType === 'MonoSynth' || synthType === 'PolySynth') && relativePath.endsWith('filter.rolloff')) { let numericRolloff = Number(value); if (![-12, -24, -48, -96].includes(numericRolloff)) numericRolloff = -12; finalValue = numericRolloff;}
      let setterObject: any = {}; let currentSetterLevel = setterObject; const keys = relativePath.split('.');
      keys.forEach((key, index) => { if (index === keys.length - 1) currentSetterLevel[key] = finalValue; else { currentSetterLevel[key] = {}; currentSetterLevel = currentSetterLevel[key]; }});
      try {
        if (liveInstrument instanceof R_.FMSynth) {
            const fmSynth = liveInstrument as R_.FMSynth; let fmSetterObject = {}; const [p1, p2, p3] = relativePath.split('.');
            if (p1 === 'harmonicity') fmSetterObject = { harmonicity: finalValue }; else if (p1 === 'modulationIndex') fmSetterObject = { modulationIndex: finalValue }; else if (p1 === 'detune') fmSetterObject = { detune: finalValue };
            else if (p1 === 'carrier') { if (p2 === 'type') fmSetterObject = { oscillator: { type: finalValue as OscillatorType } }; else if (p2 === 'envelope' && p3) fmSetterObject = { envelope: { [p3]: finalValue } }; } 
            else if (p1 === 'modulator') { if (p2 === 'type') fmSetterObject = { modulation: { type: finalValue as OscillatorType } }; else if (p2 === 'envelope' && p3) fmSetterObject = { modulationEnvelope: { [p3]: finalValue } };}
            if (Object.keys(fmSetterObject).length > 0) fmSynth.set(fmSetterObject); else fmSynth.set(setterObject); 
        } else if (liveInstrument instanceof R_.MonoSynth || liveInstrument instanceof R_.PolySynth) (liveInstrument as R_.MonoSynth | R_.PolySynth).set(setterObject);
        else if ('synth' in liveInstrument && 'filter' in liveInstrument) { 
            const basicSynthWrapper = liveInstrument as BasicSynthTrackInstruments; const [p1] = keys;
            if (p1 === 'oscillator' || p1 === 'amplitudeEnvelope') basicSynthWrapper.synth.set(setterObject);
            else if (p1 === 'filter' && setterObject.filter) basicSynthWrapper.filter.set(setterObject.filter);
            else if (p1 === 'filterEnvelope' && setterObject.filterEnvelope) basicSynthWrapper.filterEnvelope.set(setterObject.filterEnvelope);
            else basicSynthWrapper.synth.set(setterObject); 
        } else (liveInstrument as any).set(setterObject);
      } catch (e) { console.error(`Error live updating ${relativePath} for ${synthType} to ${finalValue}:`, e, setterObject, liveInstrument); }
    }
  };
  const addSynthTrack = () => {
    const newTrackId = `synth-track-${Date.now()}`; const newTrackNumber = tracksRef.current.filter(t => t.type === TrackType.SYNTH).length + 1; 
    const usedChannels = new Set(tracksRef.current.map(t => t.channel)); let nextChannel = 1;
    for (let i = 1; i <=16; i++) { if (i !== 10 && !usedChannels.has(i)) { nextChannel = i; break; } if (i === 16) { for (let j = 1; j <= 16; j++) if(j !== 10 && !usedChannels.has(j)) { nextChannel = j; break; }} if(usedChannels.has(nextChannel) || nextChannel === 10 && usedChannels.size >=15) { for (let j = 1; j <= 16; j++) if(!usedChannels.has(j)) { nextChannel = j; break; }} if(usedChannels.has(nextChannel)) nextChannel = (tracksRef.current.length % 15) + (tracksRef.current.length % 15 >= 9 ? 2 : 1); }
    const newSynthTrack: Track = { id: newTrackId, name: `Synth ${newTrackNumber}`, type: TrackType.SYNTH, channel: nextChannel, patternHistory: [], currentPatternIndex: 0, isLoading: false, error: null, isMuted: false, octaveShift: 0, synthRole: DEFAULT_SYNTH_ROLE, synthParams: JSON.parse(JSON.stringify(DEFAULT_SYNTH_PARAMETER_COLLECTION)), ccAutomationData: Array(NUM_CC_LANES).fill(null), isGeneratingCc: Array(NUM_CC_LANES).fill(false), ccError: Array(NUM_CC_LANES).fill(null), isProgressionChaining: false };
    setTracks(prev => [...prev, newSynthTrack]);
  };
  const handleDownloadPattern = (trackId: string) => {
    const track = tracksRef.current.find(t => t.id === trackId);
    if (track && track.patternHistory[track.currentPatternIndex]?.pattern) {
      const currentEntry = track.patternHistory[track.currentPatternIndex]; let patternToDownload = currentEntry.pattern!;
      if (track.type === TrackType.SYNTH && typeof track.octaveShift === 'number' && track.octaveShift !== 0) patternToDownload = patternToDownload.map(note => ({ ...note, note: Math.max(0, Math.min(127, note.note + (track.octaveShift! * 12))) }));
      const midiTrack = new MidiWriter.Track(); midiTrack.setTempo(bpm); midiTrack.setTimeSignature(4, 4); 
      patternToDownload.forEach(note => {
        const startTick = Math.round(note.time * MIDI_TICKS_PER_BEAT); const durationInTicks = Math.round(note.duration * MIDI_TICKS_PER_BEAT); const scaledVelocity = Math.max(1, Math.round((note.velocity / 127) * 100));
        const noteEvent = new MidiWriter.NoteEvent({ pitch: [note.note], duration: 'T' + durationInTicks, startTick: startTick, velocity: scaledVelocity, channel: track.channel, });
        midiTrack.addEvent(noteEvent);
      });
      const writer = new MidiWriter.Writer([midiTrack]); const byteArray = writer.buildFile(); const blob = new Blob([byteArray], { type: 'audio/midi' }); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${track.name.toLowerCase().replace(/\s+/g, '_')}_pattern_v${track.currentPatternIndex + 1}.mid`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } else setTracks(prev => prev.map(t => t.id === trackId ? {...t, error: "No pattern to download."} : t))
  };
  const handleSwitchPatternHistory = (trackId: string, newIndex: number) => {
    if (isPlaying && !anyTrackChaining) {
      if (!pendingPatternHistorySwitchRef.current) pendingPatternHistorySwitchRef.current = new Map();
      pendingPatternHistorySwitchRef.current.set(trackId, newIndex);
    } else {
      setTracks(prevTracks => prevTracks.map(t => (t.id === trackId && newIndex >= 0 && newIndex < t.patternHistory.length) ? { ...t, currentPatternIndex: newIndex, error: null } : t ));
      if (pendingPatternHistorySwitchRef.current) { pendingPatternHistorySwitchRef.current.delete(trackId); if (pendingPatternHistorySwitchRef.current.size === 0) pendingPatternHistorySwitchRef.current = null; }
    }
  };
  const handleReorderPatternHistory = (trackId: string, sourceIndex: number, destinationIndex: number) => {
    setTracks(prevTracks => {
        const trackToUpdateIndex = prevTracks.findIndex(t => t.id === trackId);
        if (trackToUpdateIndex === -1) return prevTracks;

        const trackToUpdate = prevTracks[trackToUpdateIndex];
        const newHistory = Array.from(trackToUpdate.patternHistory);
        const [removed] = newHistory.splice(sourceIndex, 1);
        newHistory.splice(destinationIndex, 0, removed);

        const newTracks = [...prevTracks];
        newTracks[trackToUpdateIndex] = {
            ...trackToUpdate,
            patternHistory: newHistory,
        };
        return newTracks;
    });
  };
  const handleSetFullscreenTrack = (newFullscreenTrackId: string | null) => {
    const trackIdThatWasPreviouslyFullscreen = fullscreenTrackId; setFullscreenTrackId(newFullscreenTrackId); 
    if (newFullscreenTrackId === null && trackIdThatWasPreviouslyFullscreen !== null) {
      const trackToResetAudioOrMidi = tracksRef.current.find(t => t.id === trackIdThatWasPreviouslyFullscreen);
      if (trackToResetAudioOrMidi) {
        if (isPreviewMode && toneStartedRef.current) setupToneTrack(trackToResetAudioOrMidi, undefined, undefined, undefined); 
        else if (!isPreviewMode && selectedOutputRef.current) {
            const activeNotesOnTrack = activePlayingNotesRef.current.get(trackIdThatWasPreviouslyFullscreen);
            if (activeNotesOnTrack) { activeNotesOnTrack.forEach(activeNote => selectedOutputRef.current?.send([0x80 + (activeNote.channel - 1), activeNote.note, 0])); activeNotesOnTrack.clear(); }
            selectedOutputRef.current?.send([0xB0 + (trackToResetAudioOrMidi.channel - 1), 123, 0]);
        }
      } liveEditingPatternRef.current.delete(trackIdThatWasPreviouslyFullscreen);
    } else if (newFullscreenTrackId !== null) {
      const trackToEdit = tracksRef.current.find(t => t.id === newFullscreenTrackId);
      if (trackToEdit) {
        const currentEntry = trackToEdit.patternHistory[trackToEdit.currentPatternIndex];
        if (currentEntry) liveEditingPatternRef.current.set(newFullscreenTrackId, { pattern: JSON.parse(JSON.stringify(currentEntry.pattern || [])), bars: currentEntry.bars || DEFAULT_BARS });
        else liveEditingPatternRef.current.set(newFullscreenTrackId, { pattern: [], bars: DEFAULT_BARS });
      }
    }
  };
  const handleSaveEditedPattern = (trackId: string, newPattern: MidiNote[], bars: number, promptToSave: string) => {
    const currentlyPlaying = isPlaying;
    const isAnyChaining = anyTrackChaining;

    setTracks(prev => prev.map(t => {
      if (t.id === trackId) {
        const newHistoryEntry: PatternHistoryEntry = { pattern: newPattern, bars, prompt: promptToSave };
        let finalPatternHistory = [newHistoryEntry, ...t.patternHistory].slice(0, MAX_PATTERN_HISTORY);
        
        let newCurrentPatternIndex = 0; 
        if (currentlyPlaying && !isAnyChaining) {
            newCurrentPatternIndex = t.currentPatternIndex + 1; 
        }
        
        return { ...t, patternHistory: finalPatternHistory, currentPatternIndex: newCurrentPatternIndex, isLoading: false, error: null };
      } return t;
    }));
    
    if (currentlyPlaying && !isAnyChaining) {
      if (!pendingPatternHistorySwitchRef.current) pendingPatternHistorySwitchRef.current = new Map();
      pendingPatternHistorySwitchRef.current.set(trackId, 0); 
    }

    liveEditingPatternRef.current.delete(trackId); 
  };
  const handleUpdateLivePreviewPattern = useCallback((trackId: string, newLivePattern: MidiNote[], newBarsForLivePattern: number) => {
      const track = tracksRef.current.find(t => t.id === trackId); if (!track) return;
      const oldLivePatternData = liveEditingPatternRef.current.get(trackId); const previousNotesFromLiveEdit = oldLivePatternData ? oldLivePatternData.pattern : [];
      liveEditingPatternRef.current.set(trackId, { pattern: newLivePattern, bars: newBarsForLivePattern });
      if (isPreviewMode) { if (toneStartedRef.current && isPlaying) setupToneTrack(track, newLivePattern, newBarsForLivePattern, undefined); } 
      else { 
          const notesTrulyRemovedFromLiveEdit: MidiNote[] = [];
          previousNotesFromLiveEdit.forEach(oldNote => {
            const stillExistsInNewLive = newLivePattern.some(newNote => newNote.note === oldNote.note && Math.abs(newNote.time - oldNote.time) < 0.001 && Math.abs(newNote.duration - oldNote.duration) < 0.001);
            if (!stillExistsInNewLive) notesTrulyRemovedFromLiveEdit.push(oldNote);
          });
          if (notesTrulyRemovedFromLiveEdit.length > 0 && selectedOutputRef.current) {
            const trackActiveMidiNotesSet = activePlayingNotesRef.current.get(trackId);
            if (trackActiveMidiNotesSet) {
              const notesToTurnOffInMidi = new Set<ActiveMidiNote>();
              notesTrulyRemovedFromLiveEdit.forEach(removedNoteInfo => {
                let finalRemovedNotePitch = removedNoteInfo.note; if (track.type === TrackType.SYNTH && typeof track.octaveShift === 'number') finalRemovedNotePitch += (track.octaveShift * 12);
                finalRemovedNotePitch = Math.max(0, Math.min(127, finalRemovedNotePitch));
                trackActiveMidiNotesSet.forEach(activeMidiNoteInstance => { if (activeMidiNoteInstance.note === finalRemovedNotePitch) { selectedOutputRef.current?.send([0x80 + (track.channel - 1), finalRemovedNotePitch, 0]); notesToTurnOffInMidi.add(activeMidiNoteInstance);}});
              });
              notesToTurnOffInMidi.forEach(n => trackActiveMidiNotesSet.delete(n));
            }
          }
      }
  }, [isPreviewMode, isPlaying, setupToneTrack]);

  const handleGeneratePatternProgression = async () => {
    const combinedContext = getCombinedMasterContext();
    const canProceed = combinedContext.trim() || tracksRef.current.some(t => {
        const currentPattern = t.patternHistory[t.currentPatternIndex];
        return currentPattern?.prompt?.trim();
    });

    if (!canProceed) {
        setGlobalError("Style/Genre or Master prompt is empty, and no tracks have current prompts. Pattern Progression needs at least one prompt source.");
        return;
    }

    const tracksWithPatterns = tracksRef.current.filter(track => {
      const currentEntry = track.patternHistory[track.currentPatternIndex];
      return currentEntry && currentEntry.pattern && currentEntry.pattern.length > 0;
    });

    if (tracksWithPatterns.length === 0) {
      setGlobalError("No tracks have active patterns to create a progression from. Please generate some patterns first.");
      setIsGeneratingAll(false); 
      return;
    }

    if (isPlaying) { setIsPlaying(false); await new Promise(r => setTimeout(r, 50)); } 
    
    setIsGeneratingAll(true); 
    setGlobalError(null);

    interface ProgressionSectionDefinition { id: string; name: string; lengthBars: number; intensity: string, promptFragment: string; }

    const quickStructure: ProgressionSectionDefinition[] = [
        { id: 'intro', name: 'Intro', lengthBars: 4, intensity: 'low', promptFragment: "a sparse, atmospheric introduction" },
        { id: 'verse1', name: 'Verse 1', lengthBars: 8, intensity: 'medium', promptFragment: "a developing first verse section" },
        { id: 'chorus1', name: 'Chorus 1', lengthBars: 8, intensity: 'high', promptFragment: "an energetic chorus section" },
        { id: 'outro', name: 'Outro', lengthBars: 4, intensity: 'calm', promptFragment: "a fading outro section" },
    ];
    
    // Reverse the structure so patterns are added to history in the correct final order (intro will be last added, so at index 0)
    const reversedStructure = [...quickStructure].reverse();
    
    for (const track of tracksWithPatterns) {
        setTracks(prev => prev.map(t => t.id === track.id ? { ...t, isLoading: true, error: null } : t));
        const generationPromisesForTrack = reversedStructure.map(sectionDef => {
            const currentTrackPatternEntry = track.patternHistory[track.currentPatternIndex];
            const barsToGenerateForThisTrack = (currentTrackPatternEntry && currentTrackPatternEntry.bars > 0) ? currentTrackPatternEntry.bars : sectionDef.lengthBars;
            let sectionSpecificUserPrompt = "";
            let effectiveMasterContext = combinedContext.trim() ? combinedContext : undefined;
            const trackExistingPrompt = currentTrackPatternEntry?.prompt?.trim();
            let roleInfoForPrompt = "";
            if (track.type === TrackType.SYNTH && track.synthRole && track.synthRole !== SynthRole.GENERAL_SYNTH) {
                roleInfoForPrompt = `(role: ${SYNTH_ROLE_LABELS[track.synthRole].toLowerCase()}) `;
            }
            let rolePrefix = "";
            if (track.type === TrackType.SYNTH && track.synthRole && track.synthRole !== SynthRole.GENERAL_SYNTH) {
                rolePrefix = `For a ${SYNTH_ROLE_LABELS[track.synthRole].toLowerCase()} part on track "${track.name}", create `;
            } else {
                rolePrefix = `For track "${track.name}", create `;
            }
            if (effectiveMasterContext) {
                sectionSpecificUserPrompt = `${rolePrefix}${sectionDef.promptFragment || `a ${sectionDef.intensity} intensity pattern`} for a ${sectionDef.name} section. This pattern should be ${barsToGenerateForThisTrack} bars long.`;
            } else {
                 sectionSpecificUserPrompt = trackExistingPrompt 
                    ? `The track "${track.name}" ${roleInfoForPrompt}currently has a style described as: "${trackExistingPrompt}". Create a new ${barsToGenerateForThisTrack}-bar pattern for a ${sectionDef.name} section that fits this style, with ${sectionDef.promptFragment || `${sectionDef.intensity} intensity`}. This new pattern should complement or evolve from the track's existing style.`
                    : `For track "${track.name}" ${roleInfoForPrompt}, create a generic ${barsToGenerateForThisTrack}-bar pattern for a ${sectionDef.name} section with ${sectionDef.promptFragment || `${sectionDef.intensity} intensity`}.`;
            }
            return handleGeneratePattern(track.id, sectionSpecificUserPrompt, barsToGenerateForThisTrack, effectiveMasterContext, true)
                .catch(error => console.error(`Progression Gen Failed for track ${track.id} in section ${sectionDef.name}:`, error));
        });
        await Promise.allSettled(generationPromisesForTrack);
        setTracks(prev => prev.map(t => t.id === track.id ? { ...t, isLoading: false, error: null, isProgressionChaining: true, currentPatternIndex: 0 } : t));
    }
    
    setIsGeneratingAll(false);
    setGlobalError("Pattern Progression Created & Enabled!");
    setTimeout(() => setGlobalError(null), 4000);
  };

  const handleToggleTrackProgression = (trackId: string) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, isProgressionChaining: !t.isProgressionChaining } : t));
  };


  const handleExportState = useCallback(() => {
    const sessionState: ExportedSessionState = {
      tracks: tracksRef.current.map(track => {
        // Exclude transient state properties from JSON
        const { isGeneratingCc, ccError, ...serializableTrack } = track;
        let finalCcAutomationData = null;
        if (Array.isArray(serializableTrack.ccAutomationData)) {
            finalCcAutomationData = serializableTrack.ccAutomationData.map(d => {
                if (!d) return null;
                return {
                    ...d,
                    depth: typeof d.depth === 'number' ? d.depth : 1,
                    offset: typeof d.offset === 'number' ? d.offset : 0,
                };
            });
        }
        return { ...serializableTrack, ccAutomationData: finalCcAutomationData, synthRole: serializableTrack.synthRole || DEFAULT_SYNTH_ROLE } as Track; 
      }),
      bpm, isLooping, masterPrompt, masterPromptBars, stylePrompt, isPreviewMode, selectedInputId, selectedOutputId,
      appVersion: APP_SESSION_VERSION,
    };
    const jsonString = JSON.stringify(sessionState, null, 2); const blob = new Blob([jsonString], { type: 'application/json' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'ai-midi-session.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    setGlobalError(null);
  }, [tracksRef, bpm, isLooping, masterPrompt, masterPromptBars, isPreviewMode, selectedInputId, selectedOutputId, stylePrompt]);

  const handleImportState = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonString = e.target?.result as string; const importedState = JSON.parse(jsonString) as ExportedSessionState;
        if (!importedState || typeof importedState !== 'object' || !Array.isArray(importedState.tracks) || typeof importedState.bpm !== 'number' || typeof importedState.isLooping !== 'boolean' || typeof importedState.masterPrompt !== 'string' || typeof importedState.masterPromptBars !== 'number' || typeof importedState.isPreviewMode !== 'boolean') throw new Error("Invalid session file structure.");
        if (isPlaying) setIsPlaying(false); pendingPatternHistorySwitchRef.current = null; if (!isPreviewMode) sendAllNotesOff(); stopAllAudioPreview(); 
        const validatedTracks = importedState.tracks.map(track => {
            
            let automationDataArray: (CcAutomationData | null)[] = Array(NUM_CC_LANES).fill(null);

            if (track.ccAutomationData) {
                const sourceData = Array.isArray(track.ccAutomationData) 
                    ? track.ccAutomationData 
                    : [track.ccAutomationData]; 

                automationDataArray = sourceData.slice(0, NUM_CC_LANES).map(d => {
                    if (!d) return null;
                    let finalDepth = 1; if (typeof d.depth === 'number') finalDepth = d.depth;
                    let finalOffset = 0; if (typeof d.offset === 'number') finalOffset = Math.round(d.offset);
                    return { ...d, depth: finalDepth, offset: finalOffset };
                });
                
                while (automationDataArray.length < NUM_CC_LANES) {
                    automationDataArray.push(null);
                }
            }

            const synthRole = track.synthRole && Object.values(SynthRole).includes(track.synthRole) ? track.synthRole : DEFAULT_SYNTH_ROLE;
            return {
                ...track,
                synthRole,
                patternHistory: Array.isArray(track.patternHistory) ? track.patternHistory : [],
                currentPatternIndex: Math.min(track.currentPatternIndex, Math.max(0, (Array.isArray(track.patternHistory) ? track.patternHistory.length : 0) -1)),
                ccAutomationData: automationDataArray,
                isProgressionChaining: track.isProgressionChaining || false,
                isGeneratingCc: Array(NUM_CC_LANES).fill(false),
                ccError: Array(NUM_CC_LANES).fill(null),
                isLoading: false,
                error: null,
            };
        });
        setTracks(JSON.parse(JSON.stringify(validatedTracks))); setBpm(importedState.bpm); setIsLooping(importedState.isLooping); setMasterPrompt(importedState.masterPrompt); setMasterPromptBars(importedState.masterPromptBars); setStylePrompt(importedState.stylePrompt || ''); setIsPreviewMode(importedState.isPreviewMode); setSelectedInputId(importedState.selectedInputId); setSelectedOutputId(importedState.selectedOutputId);
        absoluteStepRef.current = 0;
        setDisplayStep(0);
        liveEditingPatternRef.current.clear(); setFullscreenTrackId(null); lastSetupSynthParamsRef.current.clear(); 
        setGlobalError(null); alert("Session imported successfully!");
      } catch (error) { console.error("Error importing session:", error); setGlobalError(`Failed to import session: ${(error as Error).message}`); alert(`Error importing session: ${(error as Error).message}`);} 
      finally { if (event.target) event.target.value = ''; }
    };
    reader.readAsText(file);
  }, [isPlaying, isPreviewMode, sendAllNotesOff, stopAllAudioPreview]);


  const fullscreenTrack = fullscreenTrackId ? tracks.find(t => t.id === fullscreenTrackId) : null;
  const footerStatusText = isPreviewMode ? "Audio Preview Mode." : "MIDI Output Mode.";
  const combinedContext = getCombinedMasterContext();

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-900 via-black to-neutral-800 text-neutral-300 flex flex-col p-4 space-y-4 relative">
      {!fullscreenTrackId && (
          <Header
            midiInputs={midiInputs} midiOutputs={midiOutputs} selectedInputId={selectedInputId} selectedOutputId={selectedOutputId}
            onInputSelect={setSelectedInputId} onOutputSelect={(id) => { if (!isPreviewMode) sendAllNotesOff(); setSelectedOutputId(id); }}
            isPlaying={isPlaying} onPlayToggle={handlePlayToggle} bpm={bpm}
            onBpmChange={(newBpm) => { if (isPreviewMode || !isExternalClock) setBpm(newBpm); }}
            isLooping={isLooping} onLoopToggle={() => setIsLooping(p => !p)}
            onDownloadAllPatterns={() => tracksRef.current.forEach(t => { if (t.patternHistory[t.currentPatternIndex]?.pattern) handleDownloadPattern(t.id); })} 
            isPreviewMode={isPreviewMode} onPreviewModeToggle={handlePreviewModeToggle}
            isExternalClockActive={isExternalClock}
            masterPrompt={masterPrompt} onMasterPromptChange={handleMasterPromptChange}
            stylePrompt={stylePrompt} onStylePromptChange={handleStylePromptChange}
            masterPromptBars={masterPromptBars} onMasterPromptBarsChange={handleMasterPromptBarsChange}
            onGenerateAllFromMaster={handleGenerateAllFromMaster} isGeneratingAll={isGeneratingAll}
            onExportState={handleExportState} onImportState={handleImportState}
            onGeneratePatternProgression={handleGeneratePatternProgression}
            showMasterPrompt={showMasterPrompt}
            onToggleMasterPrompt={setShowMasterPrompt}
          />
      )}
      {globalError && !fullscreenTrackId && <div className="bg-red-700 p-3 rounded-lg text-white text-center shadow-lg">{globalError}</div>}

      {fullscreenTrack ? (
        <FullscreenVisualizer
            track={fullscreenTrack} currentAbsoluteStep={displayStep} bpm={bpm} 
            onClose={() => handleSetFullscreenTrack(null)}
            onGeneratePattern={(prompt, bars) => handleGeneratePattern(fullscreenTrack.id, prompt, bars, combinedContext)}
            onModifyPattern={(prompt) => handleModifyPattern(fullscreenTrack.id, prompt, combinedContext)}
            onUpdateOctaveShift={fullscreenTrack.type === TrackType.SYNTH ? (newShift) => handleUpdateTrackOctaveShift(fullscreenTrack.id, newShift) : undefined}
            onSaveEditedPattern={handleSaveEditedPattern}
            isAppPlaying={isPlaying} isAppPreviewMode={isPreviewMode}
            onUpdateLivePreviewPattern={(pattern, bars) => handleUpdateLivePreviewPattern(fullscreenTrack.id, pattern, bars)}
        />
      ) : (
        <main className="flex-grow grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tracks.map(track => (
            <TrackCard
              key={track.id} track={track}
              onGeneratePattern={(prompt, bars) => handleGeneratePattern(track.id, prompt, bars, combinedContext)}
              onModifyPattern={(prompt) => handleModifyPattern(track.id, prompt, combinedContext)} 
              onUpdateChannel={(channel) => updateTrackChannel(track.id, channel)}
              onUpdatePrompt={(prompt) => updateTrackPromptInAppState(track.id, prompt)}
              onDownloadPattern={() => handleDownloadPattern(track.id)}
              onToggleMute={() => handleToggleTrackMute(track.id)}
              currentAbsoluteStep={displayStep} bpm={bpm} 
              onUpdateOctaveShift={track.type === TrackType.SYNTH ? (newShift) => handleUpdateTrackOctaveShift(track.id, newShift) : undefined}
              onUpdateSynthRole={track.type === TrackType.SYNTH ? (role) => handleUpdateTrackSynthRole(track.id, role) : undefined}
              onSwitchPatternHistory={(newIndex) => handleSwitchPatternHistory(track.id, newIndex)}
              onReorderPatternHistory={(trackId, source, dest) => handleReorderPatternHistory(trackId, source, dest)}
              onChangeSynthType={track.type === TrackType.SYNTH ? (newType) => handleChangeSynthType(track.id, newType) : undefined}
              onUpdateSynthParam={track.type === TrackType.SYNTH ? (synthType, path, value) => handleUpdateSynthParam(track.id, synthType, path, value) : undefined}
              onGenerateCcAutomation={track.type === TrackType.SYNTH ? (prompt, cc, bars, laneIndex) => handleGenerateCcAutomation(track.id, prompt, cc, bars, laneIndex) : undefined}
              onUpdateCcAutomationParams={track.type === TrackType.SYNTH ? (laneIndex, params) => handleUpdateCcAutomationParams(track.id, laneIndex, params) : undefined}
              isPatternSwitchPending={!anyTrackChaining && !!pendingPatternHistorySwitchRef.current?.has(track.id)}
              pendingPatternHistoryIndex={pendingPatternHistorySwitchRef.current?.get(track.id) ?? null}
              onSetFullscreen={() => handleSetFullscreenTrack(track.id)}
              onToggleProgression={() => handleToggleTrackProgression(track.id)}
              isAppPreviewMode={isPreviewMode}
            />
          ))}
          <div className="flex items-center justify-center bg-white/5 rounded-2xl border-2 border-dashed border-neutral-700 hover:border-orange-500/50 transition-colors min-h-[400px]">
            <button onClick={addSynthTrack} className="p-8 group" aria-label="Add new synth track">
              <PlusIcon className="w-16 h-16 text-neutral-600 group-hover:text-orange-500 transition-colors" />
            </button>
          </div>
        </main>
      )}
      {!fullscreenTrackId && (
        <footer className="text-center text-neutral-500 text-sm p-2">
            {footerStatusText}
            {!anyTrackChaining && pendingPatternHistorySwitchRef.current?.size > 0 && isPlaying && 
              <span className="text-orange-400 ml-2">
                (Pattern switch queued for: { Array.from(pendingPatternHistorySwitchRef.current.keys()).map(trackId => tracks.find(t => t.id === trackId)?.name).filter(Boolean).join(', ')})
              </span>}
        </footer>
      )}
    </div>
  );
};

export default App;