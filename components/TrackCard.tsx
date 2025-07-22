

import React, { useState, useEffect, useRef } from 'react';
import { type Track, TrackType, type PatternHistoryEntry, type SynthParameterCollection, SupportedSynthType, SynthRole, CcAutomationData } from '../types';
import { MidiChannelSelector } from './MidiChannelSelector';
import { OctaveControl } from './OctaveControl';
import { PatternVisualizer } from './PatternVisualizer';
import { SynthConfigEditor } from './SynthConfigEditor';
import { CcAutomationVisualizer } from './CcAutomationVisualizer';
import { DownloadIcon } from './icons/DownloadIcon';
import { SpeakerWaveIcon } from './icons/SpeakerWaveIcon';
import { SpeakerXMarkIcon } from './icons/SpeakerXMarkIcon';
import { ExpandIcon } from './icons/ExpandIcon'; 
import { Knob } from './Knob';
import { DEFAULT_BARS, MAX_BARS, DEFAULT_SYNTH_PARAMETER_COLLECTION, SYNTH_ROLE_OPTIONS, DEFAULT_SYNTH_ROLE, NUM_CC_LANES } from '../constants';
import { ToggleSwitch } from './ToggleSwitch';

const DEBOUNCE_DELAY = 400; // ms

interface TrackCardProps {
  track: Track;
  onGeneratePattern: (prompt: string, bars: number) => void;
  onModifyPattern: (prompt: string) => void; 
  onUpdateChannel: (channel: number) => void;
  onUpdatePrompt: (prompt: string) => void;
  onDownloadPattern: () => void;
  onToggleMute: () => void;
  currentAbsoluteStep: number; 
  bpm: number;
  onUpdateOctaveShift?: (newShift: number) => void;
  onUpdateSynthRole?: (newRole: SynthRole) => void;
  onSwitchPatternHistory: (newIndex: number) => void;
  onReorderPatternHistory: (trackId: string, sourceIndex: number, destIndex: number) => void;
  onChangeSynthType?: (newType: SupportedSynthType) => void;
  onUpdateSynthParam?: (synthType: SupportedSynthType, relativePath: string, value: any) => void;
  onGenerateCcAutomation?: (prompt: string, ccNumber: number, bars: number, laneIndex: number) => void;
  onUpdateCcAutomationParams?: (laneIndex: number, params: { depth?: number, offset?: number }) => void;
  isPatternSwitchPending?: boolean;
  pendingPatternHistoryIndex?: number | null;
  onSetFullscreen: (trackId: string) => void; 
  onToggleProgression: (trackId: string) => void;
  isAppPreviewMode: boolean;
}

type EditorTab = "Prompt" | "CC Automation" | "Oscillator" | "Filter" | "Envelopes"; 

const laneColors = ['border-teal-400', 'border-purple-400', 'border-yellow-400'];
const laneButtonColors = ['bg-teal-500/80 hover:bg-teal-500', 'bg-purple-500/80 hover:bg-purple-500', 'bg-yellow-500/80 hover:bg-yellow-500'];
const laneActiveButtonColors = ['bg-teal-500 shadow-lg shadow-teal-500/20', 'bg-purple-500 shadow-lg shadow-purple-500/20', 'bg-yellow-500 shadow-lg shadow-yellow-500/20'];

export const TrackCard: React.FC<TrackCardProps> = ({
  track,
  onGeneratePattern,
  onModifyPattern, 
  onUpdateChannel,
  onUpdatePrompt, 
  onDownloadPattern,
  onToggleMute,
  currentAbsoluteStep, 
  bpm,
  onUpdateOctaveShift,
  onUpdateSynthRole,
  onSwitchPatternHistory,
  onReorderPatternHistory,
  onChangeSynthType,
  onUpdateSynthParam,
  onGenerateCcAutomation,
  onUpdateCcAutomationParams,
  isPatternSwitchPending,
  pendingPatternHistoryIndex,
  onSetFullscreen, 
  onToggleProgression,
  isAppPreviewMode,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  const getDefaultPromptPlaceholder = () => {
    const nameLower = track.name.toLowerCase();
    const synthRole = track.synthRole || DEFAULT_SYNTH_ROLE;

    if (track.type === TrackType.DRUM) {
        return "e.g., 'Funky 4-bar breakbeat with ghost snares', 'Minimal techno kick & hi-hat groove (2 bars)', 'Heavy metal double bass pattern with crash cymbals on downbeats'";
    } else if (track.type === TrackType.SYNTH) {
        switch (synthRole) {
            case SynthRole.BASSLINE:
                return "e.g., 'Subby sine wave bassline in A minor (1 bar)', 'Jumping 8th note synth bass for a chorus (2 bars)', 'Funky Moog-style bass'";
            case SynthRole.LEAD_MELODY:
                return "e.g., 'Soaring lead synth melody in G major (4 bars)', 'Catchy 16th note arpeggiated hook', 'Simple pentatonic melody for a verse'";
            case SynthRole.PAD_CHORDS:
                return "e.g., 'Lush ambient pad in D major (8 bars)', 'Driving minor chord stabs for a verse', 'Evolving textured soundscape for an intro'";
            case SynthRole.ARPEGGIO:
                return "e.g., 'Fast 16th note arpeggio on Cmin7 (2 bars)', 'Slowly evolving arpeggiated texture', 'Bouncy major key arpeggio'";
            case SynthRole.PLUCKS:
                return "e.g., 'Short, percussive pluck melody (1 bar)', 'Echoing pluck chords', 'Delicate glass-like plucks'";
            case SynthRole.RHYTHMIC_SEQUENCE:
                 return "e.g., 'Hypnotic 16th note rhythmic synth sequence', 'Aggressive filter-modulated sequence', 'Minimalist rhythmic pulses'";
            case SynthRole.ATMOSPHERIC_FX:
                return "e.g., 'Ethereal rising sound effect (4 bars)', 'Dark, detuned drone', 'Sci-fi inspired textural sweep'";
            case SynthRole.GENERAL_SYNTH:
            default:
                if (nameLower.includes("bass")) return "e.g., 'Subby sine wave bassline in A minor (1 bar)'";
                if (nameLower.includes("lead") || nameLower.includes("melody")) return "e.g., 'Soaring lead synth melody in G major (4 bars)'";
                if (nameLower.includes("pad") || nameLower.includes("chord")) return "e.g., 'Lush ambient pad in D major (8 bars)'";
                return "e.g., 'Plucky arpeggio in C minor (2 bars)', 'Warm evolving pad chords for a bridge', 'Aggressive acid techno sequence'";
        }
    }
    return "Enter a prompt for the AI...";
  };
  
  let activePatternEntry: PatternHistoryEntry | undefined | null = null;
  let visualizerCurrentStep = -1;

  if (track.isProgressionChaining) {
      const historyWithBars = track.patternHistory.map(p => ({ ...p, bars: p.bars > 0 ? p.bars : DEFAULT_BARS }));
      const totalProgressionSteps = historyWithBars.reduce((sum, p) => sum + p.bars * 16, 0);
      
      if (totalProgressionSteps > 0) {
          const currentGlobalStepInProgression = currentAbsoluteStep % totalProgressionSteps;
          let cumulativeSteps = 0;
          for (const entry of historyWithBars) {
              const patternSteps = entry.bars * 16;
              if (currentGlobalStepInProgression >= cumulativeSteps && currentGlobalStepInProgression < cumulativeSteps + patternSteps) {
                  activePatternEntry = entry;
                  visualizerCurrentStep = currentGlobalStepInProgression - cumulativeSteps;
                  break;
              }
              cumulativeSteps += patternSteps;
          }
      }
  } else {
      activePatternEntry = track.patternHistory[track.currentPatternIndex];
      if (activePatternEntry) {
          const patternSteps = (activePatternEntry.bars > 0 ? activePatternEntry.bars : DEFAULT_BARS) * 16;
          if (patternSteps > 0) {
              visualizerCurrentStep = currentAbsoluteStep % patternSteps;
          }
      }
  }

  const [displayPromptValue, setDisplayPromptValue] = useState(activePatternEntry?.prompt ?? '');
  const [numBars, setNumBars] = useState<number>(activePatternEntry?.bars ?? DEFAULT_BARS);
  const [activeEditorTab, setActiveEditorTab] = useState<EditorTab>("Prompt");

  // State for CC Automation Tab
  const [activeCcLaneIndex, setActiveCcLaneIndex] = useState(0);
  const [ccLanePrompts, setCcLanePrompts] = useState<string[]>(Array(NUM_CC_LANES).fill(''));
  const [ccLaneNumbers, setCcLaneNumbers] = useState<string[]>(['74', '1', '71']);

  useEffect(() => {
    // This effect syncs the local editor state (prompt, bars, CC lanes) when the
    // underlying track data changes (e.g., switching patterns). It avoids using
    // currentAbsoluteStep as a dependency to prevent wiping user input during playback.
    
    const patternForEditing = track.patternHistory[track.currentPatternIndex];
    
    // Sync main prompt and bars from the currently *selected* pattern.
    setDisplayPromptValue(patternForEditing?.prompt ?? '');
    setNumBars(patternForEditing?.bars ?? DEFAULT_BARS);

    // Sync CC automation prompts and numbers using functional updates to avoid stale state.
    setCcLanePrompts(currentPrompts => {
        const newPrompts = [...currentPrompts];
        let changed = false;
        // Sync with existing data
        track.ccAutomationData?.forEach((data, index) => {
            if (index < NUM_CC_LANES) {
                const newPrompt = data?.prompt ?? '';
                if (newPrompts[index] !== newPrompt) {
                    newPrompts[index] = newPrompt;
                    changed = true;
                }
            }
        });
        // Ensure array is correct length, filling with empty strings if needed
        for (let i = track.ccAutomationData?.length || 0; i < NUM_CC_LANES; i++) {
            if (newPrompts[i] !== '') {
                newPrompts[i] = '';
                changed = true;
            }
        }
        return changed ? newPrompts.slice(0, NUM_CC_LANES) : currentPrompts;
    });
    
    setCcLaneNumbers(currentNumbers => {
        const newNumbers = [...currentNumbers];
        const defaultNumbers = ['74', '1', '71'];
        let changed = false;
        // Sync with existing data
        track.ccAutomationData?.forEach((data, index) => {
            if (index < NUM_CC_LANES) {
                const newNumber = data ? data.cc.toString() : defaultNumbers[index];
                if (newNumbers[index] !== newNumber) {
                    newNumbers[index] = newNumber;
                    changed = true;
                }
            }
        });
         // Fill remaining with defaults
        for (let i = track.ccAutomationData?.length || 0; i < NUM_CC_LANES; i++) {
            if (newNumbers[i] !== defaultNumbers[i]) {
                newNumbers[i] = defaultNumbers[i];
                changed = true;
            }
        }
        return changed ? newNumbers.slice(0, NUM_CC_LANES) : currentNumbers;
    });

    // Reset editor tab if a drum track is shown or preview mode is off for synth-specific tabs.
    if (track.type === TrackType.DRUM && activeEditorTab !== "Prompt") {
      setActiveEditorTab("Prompt");
    } else if (!isAppPreviewMode && (activeEditorTab === 'Oscillator' || activeEditorTab === 'Filter' || activeEditorTab === 'Envelopes')) {
      setActiveEditorTab('Prompt');
    }
    
  }, [track.patternHistory, track.currentPatternIndex, track.ccAutomationData, track.type, activeEditorTab, isAppPreviewMode]);


  useEffect(() => {
    const currentAppPrompt = track.patternHistory[track.currentPatternIndex]?.prompt ?? '';
    if (displayPromptValue !== currentAppPrompt) {
      const handler = setTimeout(() => {
        onUpdatePrompt(displayPromptValue); 
      }, DEBOUNCE_DELAY);
      return () => clearTimeout(handler);
    }
  }, [displayPromptValue, onUpdatePrompt, track.patternHistory, track.currentPatternIndex]);


  const currentPatternForDisplay = activePatternEntry ? activePatternEntry.pattern : null;
  const currentBarsForPatternDisplay = activePatternEntry ? activePatternEntry.bars : DEFAULT_BARS;

  const handleGenerate = () => onGeneratePattern(displayPromptValue, numBars);
  const handleModify = () => {
    if (currentPatternForDisplay) onModifyPattern(displayPromptValue); 
    else onGeneratePattern(displayPromptValue, numBars);
  };
  
  const handleLocalPromptInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => setDisplayPromptValue(e.target.value);
  const handleBarsChange = (e: React.ChangeEvent<HTMLInputElement>) => { let v = parseInt(e.target.value,10); if(isNaN(v))v=DEFAULT_BARS; v=Math.max(1,Math.min(v,MAX_BARS)); setNumBars(v);};
  

  const editorTabs: EditorTab[] = ["Prompt", "CC Automation", "Oscillator", "Filter", "Envelopes"];
  const synthParamsCollection = track.synthParams || DEFAULT_SYNTH_PARAMETER_COLLECTION;
  const activeSynthType = synthParamsCollection.activeSynthType;
  // @ts-ignore
  const paramsForActiveType = synthParamsCollection[activeSynthType];
  
  const handleCcGenerateClick = () => {
        if (onGenerateCcAutomation) {
            const prompt = ccLanePrompts[activeCcLaneIndex];
            const ccStr = ccLaneNumbers[activeCcLaneIndex];
            if (prompt.trim() && ccStr !== '') {
                onGenerateCcAutomation(prompt, parseInt(ccStr, 10), currentBarsForPatternDisplay, activeCcLaneIndex);
            }
        }
  };
  
  const handleCcLanePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newPrompts = [...ccLanePrompts];
      newPrompts[activeCcLaneIndex] = e.target.value;
      setCcLanePrompts(newPrompts);
  };

  const handleCcLaneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      const newNumbers = [...ccLaneNumbers];
      if(v==='') {
          newNumbers[activeCcLaneIndex] = '';
          setCcLaneNumbers(newNumbers);
          return;
      }
      const nV=parseInt(v,10);
      if(!isNaN(nV) && nV >=0 && nV <=127) newNumbers[activeCcLaneIndex] = nV.toString();
      else if (nV < 0) newNumbers[activeCcLaneIndex] = '0';
      else if (nV > 127) newNumbers[activeCcLaneIndex] = '127';
      setCcLaneNumbers(newNumbers);
  };

  const handleDragStart = (e: React.DragEvent<HTMLButtonElement>, originalIndex: number) => {
    if (track.patternHistory.length < 2) return;
    setDraggedIndex(originalIndex);
    e.dataTransfer.setData('text/plain', originalIndex.toString());
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
        (e.target as HTMLButtonElement).classList.add('opacity-40');
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLButtonElement>) => {
    (e.target as HTMLButtonElement).classList.remove('opacity-40');
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault(); 
  };

  const handleDragEnter = (e: React.DragEvent<HTMLButtonElement>, index: number) => {
    if (draggedIndex === null || draggedIndex === index) return;
    e.preventDefault();
    setDragOverIndex(index);
  };
  
  const handleDragLeaveContainer = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLButtonElement>, targetOriginalIndex: number) => {
    if (draggedIndex === null) return;
    e.preventDefault();
    
    if (draggedIndex !== targetOriginalIndex) {
        onReorderPatternHistory(track.id, draggedIndex, targetOriginalIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };


  return (
    <div className="bg-neutral-800/40 backdrop-blur-md border border-white/10 rounded-2xl shadow-xl flex flex-col space-y-3 h-full p-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
            <button onClick={onToggleMute} title={track.isMuted ? "Unmute Track" : "Mute Track"} className={`p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-900 focus:ring-orange-400 ${track.isMuted ? "bg-red-600/80 hover:bg-red-600" : "bg-white/10 hover:bg-white/20"}`}>
                {track.isMuted ? <SpeakerXMarkIcon className="w-5 h-5 text-white" /> : <SpeakerWaveIcon className="w-5 h-5 text-white" />}
            </button>
            <h2 className="text-xl font-semibold text-white">{track.name}</h2>
             <button onClick={() => onSetFullscreen(track.id)} title="Fullscreen Pattern View" className="p-2 rounded-lg transition-colors bg-white/10 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-900 focus:ring-orange-400" aria-label="Toggle fullscreen pattern view">
                <ExpandIcon className="w-4 h-4 text-white" />
            </button>
        </div>
        <div className="flex items-center space-x-2">
            <span className="text-neutral-400 text-sm">Ch</span>
            <MidiChannelSelector channel={track.channel} onChange={onUpdateChannel} />
        </div>
      </div>
      
      {track.type === TrackType.SYNTH && onUpdateSynthRole && (
        <div className="flex items-center space-x-2">
          <label htmlFor={`synth-role-${track.id}`} className="text-sm text-neutral-300 whitespace-nowrap">Role:</label>
          <select
            id={`synth-role-${track.id}`}
            value={track.synthRole || DEFAULT_SYNTH_ROLE}
            onChange={(e) => onUpdateSynthRole(e.target.value as SynthRole)}
            className="flex-grow bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-lg focus:ring-2 focus:ring-orange-500/50 focus:outline-none text-sm appearance-none"
            aria-label="Select synth track role"
          >
            {SYNTH_ROLE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      )}


      {track.type === TrackType.SYNTH && (
        <div className="flex space-x-1 border-b border-white/10 pb-2 mb-2">
          {editorTabs.map(tabName => {
            if (!isAppPreviewMode && (tabName === 'Oscillator' || tabName === 'Filter' || tabName === 'Envelopes')) {
                return null;
            }
            return (
                <button key={tabName} onClick={() => setActiveEditorTab(tabName)}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-orange-400/50
                            ${activeEditorTab === tabName ? 'bg-orange-500 text-white' : 'text-neutral-400 hover:bg-white/10 hover:text-white'}`}>
                {tabName}
                </button>
            );
          })}
        </div>
      )}

      {(() => {
        if (activeEditorTab === "Prompt" || track.type === TrackType.DRUM) {
          return ( 
            <>
              <textarea value={displayPromptValue} onChange={handleLocalPromptInputChange} placeholder={getDefaultPromptPlaceholder()} className="w-full h-24 p-2 bg-black/30 border border-white/10 text-neutral-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none placeholder-neutral-400 resize-none text-sm"/>
              <div className="flex justify-between items-center space-x-2">
                <div className="flex items-center space-x-2">
                  <label htmlFor={`bars-${track.id}`} className="text-sm text-neutral-300">Bars (new):</label>
                  <input type="number" id={`bars-${track.id}`} value={numBars} onChange={handleBarsChange} min="1" max={MAX_BARS} className="w-16 bg-black/30 border border-white/10 text-white p-1 rounded-md focus:ring-1 focus:ring-orange-500 focus:outline-none text-center"/>
                </div>
                {track.type === TrackType.SYNTH && onUpdateOctaveShift && (<div className="flex items-center space-x-1"><span className="text-neutral-400 text-sm">Octave</span><OctaveControl currentShift={track.octaveShift || 0} onShiftChange={onUpdateOctaveShift} /></div>)}
              </div>
              <div className="flex space-x-2">
                <button onClick={handleModify} disabled={track.isLoading || !currentPatternForDisplay} className="flex-1 bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:bg-neutral-600 disabled:cursor-not-allowed">
                  {track.isLoading && currentPatternForDisplay ? 'Modifying...' : 'Modify Pattern'}
                </button>
                <button onClick={handleGenerate} disabled={track.isLoading} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:bg-orange-500/50 disabled:cursor-not-allowed">
                  {track.isLoading && !currentPatternForDisplay ? 'Generating...' : 'Generate New'}
                </button>
              </div>
            </>
          );
        } else if (activeEditorTab === "CC Automation" && track.type === TrackType.SYNTH && onGenerateCcAutomation && onUpdateCcAutomationParams) {
          const defaultPrompts = [
              "e.g., 'Slowly open filter cutoff (CC 74) over the whole pattern'",
              "e.g., 'Fast sine LFO on mod wheel (CC 1) for 1 bar'",
              "e.g., 'Random steps on CC 71 (Resonance) every beat'"
          ];
          const isLoading = track.isGeneratingCc?.[activeCcLaneIndex] || false;
          const error = track.ccError?.[activeCcLaneIndex] || null;

          return ( 
            <div className="bg-black/20 p-3 rounded-lg min-h-[280px] space-y-3 flex flex-col justify-between">
                <div>
                    <h4 className="text-sm text-neutral-300 uppercase tracking-wider text-center">CC Automation (for current pattern's {currentBarsForPatternDisplay} bars)</h4>
                    {/* Lane Selector */}
                    <div className="flex justify-center space-x-2 my-2">
                        {Array.from({ length: NUM_CC_LANES }).map((_, index) => (
                            <button key={index} onClick={() => setActiveCcLaneIndex(index)}
                                className={`px-4 py-1.5 rounded-lg font-semibold text-white transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-800 focus:ring-orange-400
                                ${activeCcLaneIndex === index ? laneActiveButtonColors[index] : 'bg-white/10 hover:bg-white/20'}`}>
                                L{index + 1}
                            </button>
                        ))}
                    </div>
                    {/* Active Lane Editor */}
                    <div className={`p-2 rounded-lg border ${laneColors[activeCcLaneIndex]} bg-opacity-20 ${laneColors[activeCcLaneIndex].replace('border-','bg-')}/20 space-y-2`}>
                        <div className="flex items-center space-x-2">
                            <label htmlFor={`cc-number-${track.id}-${activeCcLaneIndex}`} className="text-sm text-neutral-300 whitespace-nowrap font-semibold">CC#:</label>
                            <input type="number" id={`cc-number-${track.id}-${activeCcLaneIndex}`} value={ccLaneNumbers[activeCcLaneIndex]} onChange={handleCcLaneNumberChange} min="0" max="127" className="w-16 bg-black/30 border border-white/10 text-white p-1 rounded-md focus:ring-1 focus:ring-orange-500 focus:outline-none text-center text-sm" aria-label={`MIDI CC Number for lane ${activeCcLaneIndex + 1}`}/>
                        </div>
                        <textarea value={ccLanePrompts[activeCcLaneIndex]} onChange={handleCcLanePromptChange} placeholder={defaultPrompts[activeCcLaneIndex]} className="w-full h-16 p-2 bg-black/30 border border-white/10 text-neutral-200 rounded-md focus:ring-2 focus:ring-orange-500 focus:outline-none placeholder-neutral-400 resize-none text-xs" aria-label={`CC Automation Prompt for lane ${activeCcLaneIndex + 1}`}/>
                        <button onClick={handleCcGenerateClick} disabled={isLoading || !ccLanePrompts[activeCcLaneIndex].trim() || ccLaneNumbers[activeCcLaneIndex] === ''} className={`w-full ${laneButtonColors[activeCcLaneIndex]} text-white font-semibold py-1.5 px-3 rounded-lg transition-colors disabled:bg-neutral-600 disabled:cursor-not-allowed text-sm`}>
                            {isLoading ? `Generating L${activeCcLaneIndex+1}...` : `Generate L${activeCcLaneIndex+1}`}
                        </button>
                         {error && <p className="text-red-400 text-xs text-center">{error}</p>}
                    </div>
                </div>
                
                {/* Modulation Knobs */}
                <div className="mt-3">
                     <h4 className="text-xs text-neutral-400 uppercase tracking-wider mb-1.5 text-center">Modulation Controls</h4>
                     <div className="grid grid-cols-3 gap-x-2 justify-items-center bg-black/20 p-2 rounded-lg">
                        {Array.from({ length: NUM_CC_LANES }).map((_, index) => (
                           <div key={`mod-controls-${index}`} className={`flex flex-col items-center space-y-2 p-1 rounded-lg ${laneColors[index]}`}>
                               <Knob label="Depth" value={track.ccAutomationData?.[index]?.depth ?? 1} min={0} max={1} step={0.01} onChange={(newDepth) => onUpdateCcAutomationParams && onUpdateCcAutomationParams(index, { depth: newDepth })}/>
                               <Knob label="Offset" value={track.ccAutomationData?.[index]?.offset ?? 0} min={-127} max={127} step={1} onChange={(newOffset) => onUpdateCcAutomationParams && onUpdateCcAutomationParams(index, { offset: newOffset })}/>
                           </div>
                        ))}
                    </div>
                </div>
            </div>
          );
        } else if (isAppPreviewMode && track.type === TrackType.SYNTH && (activeEditorTab === "Oscillator" || activeEditorTab === "Filter" || activeEditorTab === "Envelopes") && paramsForActiveType && onUpdateSynthParam && onChangeSynthType) {
          return <SynthConfigEditor activeSynthType={activeSynthType} paramsForActiveType={paramsForActiveType as any} onChangeSynthType={onChangeSynthType} onUpdateSynthParam={(relativePath, value) => onUpdateSynthParam(activeSynthType, relativePath, value)} activeTab={activeEditorTab as "Oscillator" | "Filter" | "Envelopes"}/>;
        } return null; 
      })()}
      
      <button onClick={onDownloadPattern} disabled={!currentPatternForDisplay} className="w-full bg-blue-600/80 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:bg-neutral-600 disabled:cursor-not-allowed flex items-center justify-center space-x-2">
        <DownloadIcon className="w-4 h-4"/> 
        <span>Download Pattern</span>
      </button>

      {track.error && <p className="text-red-400 text-sm mt-2">{track.error}</p>}
      
      <div className="flex-grow bg-black/40 p-2 rounded-lg min-h-[120px] overflow-x-auto overflow-y-hidden">
        {activeEditorTab === "CC Automation" && track.type === TrackType.SYNTH && track.ccAutomationData && track.ccAutomationData.some(d => d !== null) ? (
          <CcAutomationVisualizer automationData={track.ccAutomationData} currentPlayStep={visualizerCurrentStep} />
        ) : currentPatternForDisplay ? (
          <PatternVisualizer pattern={currentPatternForDisplay} trackType={track.type} bars={currentBarsForPatternDisplay} currentPlayStep={visualizerCurrentStep} octaveShift={track.type === TrackType.SYNTH ? (track.octaveShift || 0) : undefined}/>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-400">
            {track.isLoading ? 'Generating...' : (activeEditorTab === "CC Automation" ? 'Generate CC automation to visualize.' : 'No pattern.')}
          </div>
        )}
      </div>

      {track.patternHistory && track.patternHistory.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/10">
            <div className="flex justify-between items-center mb-1.5">
                 <p className="text-xs text-neutral-400 text-left">
                   {track.isProgressionChaining ? 'Pattern Chain' : 'Pattern Memory'}:
                   {isPatternSwitchPending && <span className="text-yellow-400"> (Switch Queued)</span>}
                 </p>
                 <ToggleSwitch 
                    label="Progression"
                    enabled={track.isProgressionChaining}
                    onChange={() => onToggleProgression(track.id)}
                    disabled={track.patternHistory.length < 2}
                 />
            </div>
          <div className="flex flex-wrap justify-start gap-1.5" onDragLeave={handleDragLeaveContainer} onDragOver={handleDragOver}>
            {[...track.patternHistory].reverse().map((_, index) => {
              const originalIndex = track.patternHistory.length - 1 - index;
              const isActive = originalIndex === track.currentPatternIndex && !track.isProgressionChaining;
              const canDrag = track.patternHistory.length > 1;

              let buttonClass = `w-7 h-7 text-xs rounded-full font-semibold transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-800 focus:ring-orange-400 disabled:opacity-50 disabled:cursor-not-allowed `;
              
              if (isActive) buttonClass += 'bg-orange-500 shadow-lg shadow-orange-500/20 hover:bg-orange-600 text-white';
              else if (isPatternSwitchPending && !isActive && pendingPatternHistoryIndex === originalIndex) buttonClass += 'bg-yellow-500 hover:bg-yellow-600 text-white ring-2 ring-yellow-400';
              else buttonClass += 'bg-white/10 hover:bg-white/20 text-neutral-200';

              if (canDrag) buttonClass += ' cursor-grab';
              if (draggedIndex === originalIndex) buttonClass += ' opacity-40';
              if (dragOverIndex === originalIndex && draggedIndex !== originalIndex) buttonClass += ' scale-110 ring-2 ring-yellow-400';
              
              const buttonTitle = track.isProgressionChaining
                ? `Pattern ${index + 1} in chain (Drag to reorder)`
                : `Switch to Pattern ${index + 1} (Click) or reorder (Drag)`;

              return (<button 
                key={`${track.id}-history-${originalIndex}`} 
                onClick={() => onSwitchPatternHistory(originalIndex)} 
                disabled={track.isProgressionChaining}
                title={buttonTitle}
                className={buttonClass}
                draggable={canDrag}
                onDragStart={(e) => handleDragStart(e, originalIndex)}
                onDragEnd={handleDragEnd}
                onDragEnter={(e) => handleDragEnter(e, originalIndex)}
                onDrop={(e) => handleDrop(e, originalIndex)}
              >
                {index + 1}
              </button>);
            })}
          </div>
        </div>
      )}
    </div>
  );
};