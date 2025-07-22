



import React, { useEffect, useRef, useState, useCallback } from 'react';
import { type Track, TrackType, PatternHistoryEntry, MidiNote } from '../types';
import { PatternVisualizer } from './PatternVisualizer';
import { DrumGridVisualizer } from './DrumGridVisualizer';
import { OctaveControl } from './OctaveControl';
import { CompressIcon } from './icons/CompressIcon';
import { SaveIcon } from './icons/SaveIcon';
import { TrashIcon } from './icons/TrashIcon';
import { DEFAULT_BARS, PIANO_KEY_WIDTH, DRUM_GRID_INSTRUMENT_LABEL_WIDTH, MAX_BARS, EDIT_MODE_DEFAULT_PROMPT, VELOCITY_LANE_HEIGHT, STEPS_PER_BAR } from '../constants';

interface FullscreenVisualizerProps {
  track: Track;
  currentAbsoluteStep: number;
  bpm: number;
  onClose: () => void;
  onGeneratePattern: (prompt: string, bars: number) => void;
  onModifyPattern: (prompt: string) => void;
  onUpdateOctaveShift?: (newShift: number) => void;
  onSaveEditedPattern: (trackId: string, newPattern: MidiNote[], bars: number, prompt: string) => void;
  isAppPlaying: boolean; 
  isAppPreviewMode: boolean;
  onUpdateLivePreviewPattern: (livePattern: MidiNote[], bars: number) => void;
}

export const FullscreenVisualizer: React.FC<FullscreenVisualizerProps> = ({
  track,
  currentAbsoluteStep,
  // bpm, 
  onClose,
  onGeneratePattern,
  onModifyPattern, 
  onUpdateOctaveShift,
  onSaveEditedPattern,
  isAppPlaying,
  isAppPreviewMode,
  onUpdateLivePreviewPattern,
}) => {
  const visualizerWrapperRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const [localPrompt, setLocalPrompt] = useState(''); 
  const [numBarsForGeneration, setNumBarsForGeneration] = useState<number>(DEFAULT_BARS);
  
  const [editingPattern, setEditingPattern] = useState<MidiNote[] | null>(null);
  const [initialPatternForComparison, setInitialPatternForComparison] = useState<MidiNote[] | null>(null);
  const [currentPatternBars, setCurrentPatternBars] = useState<number>(DEFAULT_BARS);

  useEffect(() => {
    const currentHistoryEntry = track.patternHistory[track.currentPatternIndex];
    if (currentHistoryEntry) {
      const activePattern = currentHistoryEntry.pattern || [];
      const activeBars = currentHistoryEntry.bars || DEFAULT_BARS;
      const activePrompt = currentHistoryEntry.prompt || '';

      setEditingPattern(JSON.parse(JSON.stringify(activePattern)));
      setInitialPatternForComparison(JSON.parse(JSON.stringify(activePattern)));
      setCurrentPatternBars(activeBars);
      setLocalPrompt(activePrompt); 
      setNumBarsForGeneration(activeBars); 
    } else {
      const emptyPattern: MidiNote[] = [];
      setEditingPattern([...emptyPattern]);
      setInitialPatternForComparison([...emptyPattern]);
      setCurrentPatternBars(DEFAULT_BARS);
      setLocalPrompt('');
      setNumBarsForGeneration(DEFAULT_BARS);
    }
  }, [track.id, track.patternHistory, track.currentPatternIndex, track.name]);


  useEffect(() => {
    const calculateDimensions = () => {
      if (visualizerWrapperRef.current) {
        const parentWidth = visualizerWrapperRef.current.clientWidth || window.innerWidth * 0.9;
        const parentHeight = visualizerWrapperRef.current.clientHeight || window.innerHeight * 0.9;
        setDimensions({ width: parentWidth, height: parentHeight });
      } else {
        setDimensions({ width: window.innerWidth * 0.9, height: window.innerHeight * 0.9 });
      }
    };
    calculateDimensions();
    window.addEventListener('resize', calculateDimensions);
    
    // Auto-scroll logic
    const scrollInterval = setInterval(() => {
        if (isAppPlaying && scrollContainerRef.current) {
             const patternTotalSteps = currentPatternBars * 16;
             if (patternTotalSteps <= 0) return;
             const localCurrentPlayStepForScroll = currentAbsoluteStep % patternTotalSteps;
             
             const svgViewportWidth = dimensions.width - 20; 
             let targetViewportGridWidth: number;
             if (track.type === TrackType.SYNTH) targetViewportGridWidth = svgViewportWidth - PIANO_KEY_WIDTH;
             else targetViewportGridWidth = svgViewportWidth - DRUM_GRID_INSTRUMENT_LABEL_WIDTH;
             
             const stepsToDisplayInViewport = STEPS_PER_BAR * 2; 
             const stepWidth = Math.max(1, targetViewportGridWidth / stepsToDisplayInViewport);
             
             const currentScrollX = scrollContainerRef.current.scrollLeft;
             const scrollWidth = scrollContainerRef.current.scrollWidth;
             const clientWidth = scrollContainerRef.current.clientWidth;

             if (scrollWidth > clientWidth) {
                 const playheadXPosition = localCurrentPlayStepForScroll * stepWidth;
                 const targetScrollLeft = playheadXPosition - (clientWidth / 4);
                 
                 if (playheadXPosition < currentScrollX || playheadXPosition > currentScrollX + clientWidth * 0.9) {
                    scrollContainerRef.current.scrollTo({
                        left: Math.max(0, targetScrollLeft),
                        behavior: 'smooth'
                    });
                 }
             }
        }
    }, 500);

    return () => {
        window.removeEventListener('resize', calculateDimensions);
        clearInterval(scrollInterval);
    }
  }, [isAppPlaying, currentAbsoluteStep, currentPatternBars, dimensions.width, track.type]);

  const handleLocalPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalPrompt(e.target.value);
  };

  const handleNumBarsForGenerationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val)) val = DEFAULT_BARS;
    val = Math.max(1, Math.min(val, MAX_BARS)); 
    setNumBarsForGeneration(val);
  };

  const handleGenerate = () => {
    onGeneratePattern(localPrompt, numBarsForGeneration);
  };

  const handleModify = () => { 
    if (editingPattern && editingPattern.length > 0) {
      onModifyPattern(localPrompt);
    } else {
      onGeneratePattern(localPrompt, numBarsForGeneration);
    }
  };
  
  const handleUpdateEditingPattern = useCallback((newPattern: MidiNote[]) => {
    setEditingPattern(newPattern);
  }, []);

  const handleUpdateNoteVelocity = useCallback((noteIndex: number, newVelocity: number) => {
    setEditingPattern(prevPattern => {
      if (!prevPattern) return null;
      const newPattern = prevPattern.map((note, index) => {
        if (index === noteIndex) {
          return { ...note, velocity: Math.max(0, Math.min(127, Math.round(newVelocity))) };
        }
        return note;
      });
      return newPattern;
    });
  }, []);


  useEffect(() => {
    if (editingPattern !== null) { 
        onUpdateLivePreviewPattern(editingPattern, currentPatternBars);
    }
  }, [editingPattern, currentPatternBars, onUpdateLivePreviewPattern]);


  const handleSaveAndClose = useCallback(() => {
    if (editingPattern && initialPatternForComparison) {
      const hasChanged = JSON.stringify(editingPattern) !== JSON.stringify(initialPatternForComparison);
      const wasNotEmpty = initialPatternForComparison.length > 0;
      const isEmptyNow = editingPattern.length === 0;
      const significantChange = hasChanged || (wasNotEmpty && isEmptyNow);

      if (significantChange) {
        onSaveEditedPattern(track.id, editingPattern, currentPatternBars, localPrompt || EDIT_MODE_DEFAULT_PROMPT);
      }
    }
    onClose(); 
  }, [track.id, editingPattern, initialPatternForComparison, currentPatternBars, onSaveEditedPattern, onClose, localPrompt]);
  
  const handleDiscardAndClose = useCallback(() => {
    onClose();
  }, [onClose]);

   useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation(); 
        handleDiscardAndClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleDiscardAndClose]);


  if (!track) return null;
  
  const scrollContainerDirectPadding = 8; 
  const svgViewportWidth = dimensions.width - (scrollContainerDirectPadding * 2);
  const controlPanelApproxHeight = 160; 
  const mainVisualizerAreaHeight = dimensions.height - controlPanelApproxHeight; 

  let targetViewportGridWidthForChildren: number;
  if (track.type === TrackType.SYNTH) {
    targetViewportGridWidthForChildren = svgViewportWidth - PIANO_KEY_WIDTH;
  } else { 
    targetViewportGridWidthForChildren = svgViewportWidth - DRUM_GRID_INSTRUMENT_LABEL_WIDTH;
  }
  targetViewportGridWidthForChildren = Math.max(100, targetViewportGridWidthForChildren);
  
  const patternTotalSteps = currentPatternBars * 16;
  const localCurrentPlayStep = patternTotalSteps > 0 ? currentAbsoluteStep % patternTotalSteps : -1;

  const renderLoadingOrNoDataState = () => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center z-50 p-4 text-white">
      <h2 className="text-3xl font-bold mb-4">{track.name}</h2>
      {track.isLoading ? (
         <p className="text-xl mb-4">Loading pattern...</p>
      ) : (
         <p className="text-xl mb-4">Pattern data is initializing or unavailable.</p>
      )}
      <button
        onClick={handleDiscardAndClose} 
        className="mt-6 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center space-x-2"
        aria-label="Close fullscreen view"
      >
        <CompressIcon className="w-5 h-5" />
        <span>Close</span>
      </button>
    </div>
  );
  
  if (editingPattern === null || (track.isLoading && !editingPattern && !initialPatternForComparison)) {
      return renderLoadingOrNoDataState();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex flex-col z-40 p-2 sm:p-4" >
      <div ref={visualizerWrapperRef} className="w-full h-full max-w-full max-h-full flex flex-col bg-neutral-900/80 border border-white/10 p-3 sm:p-5 rounded-2xl shadow-2xl">
        <div className="w-full flex justify-between items-start mb-3 flex-wrap gap-2">
            <div className="flex items-center space-x-4">
                <h2 className="text-2xl font-bold text-white">{track.name}</h2>
                {track.type === TrackType.SYNTH && onUpdateOctaveShift && (
                    <OctaveControl currentShift={track.octaveShift || 0} onShiftChange={onUpdateOctaveShift} />
                )}
            </div>
             <div className="flex items-center space-x-2">
                <button onClick={handleSaveAndClose} className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg flex items-center space-x-2 transition-colors focus:outline-none focus:ring-2 focus:ring-green-400">
                    <SaveIcon className="w-5 h-5" />
                    <span>Save Edits</span>
                </button>
                 <button onClick={handleDiscardAndClose} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg flex items-center space-x-2 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400">
                    <TrashIcon className="w-5 h-5" />
                    <span>Discard</span>
                </button>
                 <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-orange-400">
                    <CompressIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
        
        <div ref={scrollContainerRef} className="flex-grow w-full overflow-auto rounded-lg" style={{ padding: `${scrollContainerDirectPadding}px` }}>
            {editingPattern && (track.type === TrackType.SYNTH ? (
                <PatternVisualizer 
                    pattern={editingPattern} trackType={track.type} bars={currentPatternBars}
                    currentPlayStep={localCurrentPlayStep}
                    octaveShift={track.type === TrackType.SYNTH ? (track.octaveShift || 0) : undefined}
                    containerHeight={mainVisualizerAreaHeight} 
                    targetViewportGridWidth={targetViewportGridWidthForChildren}
                    isEditModeActive={true}
                    onUpdatePatternForEdit={handleUpdateEditingPattern}
                    onUpdateNoteVelocity={handleUpdateNoteVelocity}
                />
            ) : (
                <DrumGridVisualizer
                    pattern={editingPattern} bars={currentPatternBars}
                    currentPlayStep={localCurrentPlayStep}
                    containerHeight={mainVisualizerAreaHeight}
                    targetViewportGridWidth={targetViewportGridWidthForChildren}
                    isEditModeActive={true}
                    onUpdatePatternForEdit={handleUpdateEditingPattern}
                    onUpdateNoteVelocity={handleUpdateNoteVelocity}
                />
            ))}
        </div>
        
        {/* Control Panel */}
        <div className="w-full flex flex-col md:flex-row items-center gap-4 pt-4 mt-2 border-t border-white/20">
            <textarea
                value={localPrompt} onChange={handleLocalPromptChange}
                placeholder={`Prompt to modify pattern... or generate new if empty.`}
                className="flex-grow w-full md:w-auto h-24 md:h-full p-2 bg-black/30 border border-white/10 text-neutral-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none placeholder-neutral-400 resize-none text-sm"
            />
            <div className="flex flex-col items-stretch space-y-2">
                <div className="flex items-center justify-between space-x-2">
                    <label htmlFor={`fs-bars-${track.id}`} className="text-sm text-neutral-300">Bars (for new):</label>
                    <input type="number" id={`fs-bars-${track.id}`} value={numBarsForGeneration} onChange={handleNumBarsForGenerationChange} min="1" max={MAX_BARS} className="w-16 bg-black/30 border border-white/10 text-white p-1 rounded-md focus:ring-1 focus:ring-orange-500 focus:outline-none text-center"/>
                </div>
                 <button onClick={handleModify} disabled={track.isLoading} className="flex-1 bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:bg-neutral-600 disabled:cursor-not-allowed">
                    {track.isLoading ? 'Modifying...' : 'Modify Pattern'}
                </button>
                <button onClick={handleGenerate} disabled={track.isLoading} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:bg-orange-500/50 disabled:cursor-not-allowed">
                    {track.isLoading ? 'Generating...' : 'Generate New'}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};