import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import * as R_ from 'tone'; // For R_.Frequency
import { type MidiNote, TrackType, type VisualNote } from '../types';
import { 
  STEPS_PER_BAR, DRUM_NOTE_SIZE, DRUM_ACTIVE_NOTE_SIZE, DEFAULT_BARS,
  DEFAULT_BAR_WIDTH, DEFAULT_DRUM_VIEW_HEIGHT, DEFAULT_SYNTH_VIEW_HEIGHT,
  PIANO_KEY_WIDTH, EDIT_MODE_DEFAULT_VELOCITY, EDIT_MODE_DEFAULT_DURATION_16TH,
  LOWEST_SYNTH_NOTE, PITCH_RANGE_SYNTH, VELOCITY_LANE_HEIGHT,
  VELOCITY_MARKER_LINE_WIDTH, VELOCITY_MARKER_HEAD_RADIUS
} from '../constants';

interface PatternVisualizerProps {
  pattern: MidiNote[];
  trackType: TrackType;
  bars: number;
  currentPlayStep: number;
  octaveShift?: number;
  containerHeight?: number; 
  targetViewportGridWidth?: number; 
  isEditModeActive?: boolean; 
  onUpdatePatternForEdit?: (newPattern: MidiNote[]) => void;
  onUpdateNoteVelocity?: (noteIndex: number, newVelocity: number) => void;
}

interface MouseDownInfo {
  type: 'new' | 'existing' | 'dragging-new' | 'dragging-existing' | 'velocity-drag';
  startStep: number; // For 'new' and 'dragging-new', this is the initial step. For 'existing'/'dragging-existing', it's the original start step of the note.
  currentStep?: number; // For 'dragging-new', the current end step.
  noteMidi: number; // Base MIDI note (unshifted). For 'new', it's the target. For 'existing', it's the original.
  visualNoteMidi?: number; // Visual MIDI note on piano roll (for 'new' type)
  originalPatternIndex?: number; // Index in 'pattern' array if 'existing' or 'dragging-existing'
  initialClientX: number;
  initialClientY: number;
  initialNoteTime?: number; // For 'existing'/'dragging-existing', original time of the note.
  initialNotePitch?: number; // For 'existing'/'dragging-existing', original base MIDI pitch of the note.
  velocityDragState?: { // Store velocity drag info separately
    noteIndex: number;
    initialMouseY: number;
    initialVelocity: number;
  };
}


export const PatternVisualizer: React.FC<PatternVisualizerProps> = ({
  pattern: currentPatternFromProps, // Renamed to avoid conflict with local editingPattern state if used
  trackType,
  bars,
  currentPlayStep,
  octaveShift = 0,
  containerHeight, 
  targetViewportGridWidth,
  isEditModeActive: isEditModeActiveProp, 
  onUpdatePatternForEdit,
  onUpdateNoteVelocity,
}) => {
  const safeBars = (typeof bars === 'number' && bars > 0) ? bars : DEFAULT_BARS;
  const totalSteps = STEPS_PER_BAR * safeBars;
  const svgRef = useRef<SVGSVGElement>(null);
  
  const [mouseDownInfo, setMouseDownInfo] = useState<MouseDownInfo | null>(null);

  let svgWidth: number;
  let mainGridHeight: number; 
  let totalSvgHeight: number; 
  let gridStartX: number; 
  let gridContentWidth: number; 
  let stepWidth: number;
  let synthRowHeight: number = 0;
  let derivedIsEditModeActive: boolean;

  const isFullscreenContext = typeof containerHeight === 'number' && typeof targetViewportGridWidth === 'number';
  const showVelocityLane = isFullscreenContext && onUpdateNoteVelocity && trackType === TrackType.SYNTH;


  if (isFullscreenContext) {
    derivedIsEditModeActive = isEditModeActiveProp === undefined ? true : isEditModeActiveProp; 
    mainGridHeight = containerHeight; 
    gridStartX = trackType === TrackType.SYNTH ? PIANO_KEY_WIDTH : 0;
    
    const stepsToDisplayInViewport = STEPS_PER_BAR * 2; 
    stepWidth = targetViewportGridWidth / stepsToDisplayInViewport;
    stepWidth = Math.max(1, stepWidth); 

    gridContentWidth = totalSteps * stepWidth; 
    svgWidth = gridStartX + gridContentWidth; 
    if (trackType === TrackType.SYNTH) {
      synthRowHeight = Math.max(1, mainGridHeight / PITCH_RANGE_SYNTH);
    }
    totalSvgHeight = showVelocityLane ? mainGridHeight + VELOCITY_LANE_HEIGHT : mainGridHeight;

  } else { 
    derivedIsEditModeActive = false; 
    mainGridHeight = trackType === TrackType.DRUM ? DEFAULT_DRUM_VIEW_HEIGHT : DEFAULT_SYNTH_VIEW_HEIGHT;
    gridStartX = trackType === TrackType.SYNTH ? PIANO_KEY_WIDTH : 0; 
    
    const totalDefaultContentWidth = safeBars * DEFAULT_BAR_WIDTH;
    stepWidth = totalSteps > 0 ? totalDefaultContentWidth / totalSteps : (DEFAULT_BAR_WIDTH / STEPS_PER_BAR);
    gridContentWidth = totalDefaultContentWidth;
    svgWidth = gridStartX + gridContentWidth;
    if (trackType === TrackType.SYNTH) {
      synthRowHeight = Math.max(1, mainGridHeight / PITCH_RANGE_SYNTH);
    }
    totalSvgHeight = mainGridHeight; 
  }

  const shiftedNotesForDisplay = useMemo(() => {
    if (trackType !== TrackType.SYNTH || !currentPatternFromProps) return [];
    return currentPatternFromProps.map((n, index) => ({
        ...n,
        originalIndex: index, 
        note: Math.max(0, Math.min(127, n.note + (octaveShift * 12))),
    }));
  }, [currentPatternFromProps, octaveShift, trackType]);


  const viewLowestMidiNote = useMemo(() => {
    if (trackType !== TrackType.SYNTH || shiftedNotesForDisplay.length === 0) {
        return LOWEST_SYNTH_NOTE; 
    }
    const notes = shiftedNotesForDisplay.map(n => n.note);
    let minActualNote = Math.min(...notes);
    let maxActualNote = Math.max(...notes);
    let newViewLowestMidiNote;
    const actualPatternSpread = maxActualNote - minActualNote + 1;

    if (actualPatternSpread <= PITCH_RANGE_SYNTH) {
        const padding = Math.floor((PITCH_RANGE_SYNTH - actualPatternSpread) / 2);
        newViewLowestMidiNote = minActualNote - padding;
    } else {
        newViewLowestMidiNote = minActualNote; 
    }
    newViewLowestMidiNote = Math.max(0, newViewLowestMidiNote);
    newViewLowestMidiNote = Math.min(newViewLowestMidiNote, 127 - PITCH_RANGE_SYNTH + 1);
    return newViewLowestMidiNote;
  }, [shiftedNotesForDisplay, trackType]);

  const visualNotes = useMemo(() => {
    if (!currentPatternFromProps) return [];
    if (trackType === TrackType.DRUM) { 
      const sortedUniqueNotes = Array.from(new Set(currentPatternFromProps.map(n => n.note))).sort((a, b) => a - b);
      const actualDrumLaneCount = sortedUniqueNotes.length > 0 ? sortedUniqueNotes.length : 1;
      const laneHeight = mainGridHeight / actualDrumLaneCount;
      const baseReferenceHeight = isFullscreenContext ? mainGridHeight : DEFAULT_DRUM_VIEW_HEIGHT;
      const scaleFactor = mainGridHeight / baseReferenceHeight; 
      const drumNoteSizeScaled = DRUM_NOTE_SIZE * Math.max(1, scaleFactor * (stepWidth / (DEFAULT_BAR_WIDTH/STEPS_PER_BAR))); 
      const drumActiveNoteSizeScaled = DRUM_ACTIVE_NOTE_SIZE * Math.max(1, scaleFactor * (stepWidth / (DEFAULT_BAR_WIDTH/STEPS_PER_BAR)));
      return currentPatternFromProps.reduce<VisualNote[]>((acc, note, originalIndex) => {
        const stepIndex = Math.floor(note.time * 4);
        const laneIndex = sortedUniqueNotes.indexOf(note.note);
        if (laneIndex !== -1 && stepIndex < totalSteps) {
          const isActive = currentPlayStep !== -1 && currentPlayStep === stepIndex;
          acc.push({
            x: stepIndex * stepWidth + stepWidth / 2, 
            y: laneIndex * laneHeight + laneHeight / 2, 
            width: isActive ? drumActiveNoteSizeScaled : drumNoteSizeScaled,
            height: isActive ? drumActiveNoteSizeScaled : drumNoteSizeScaled,
            isDrum: true,
            isActive: isActive,
            originalIndex: originalIndex,
            velocity: note.velocity,
          });
        }
        return acc;
      }, []);
    } else { // Synth Track
       if (!currentPatternFromProps || synthRowHeight <= 0) return [];
       return shiftedNotesForDisplay.map(processedNote => {
        let noteVisible = false;
        let yPosition = 0;
        const displayMidiNote = processedNote.note;
        if (displayMidiNote >= viewLowestMidiNote && displayMidiNote < viewLowestMidiNote + PITCH_RANGE_SYNTH) {
            noteVisible = true;
            const offsetInView = displayMidiNote - viewLowestMidiNote;
            yPosition = ((PITCH_RANGE_SYNTH - 1) - offsetInView) * synthRowHeight;
        }
        if (!noteVisible) return { x: -1, y: -1, width: 0, height: 0, isDrum: false, originalIndex: processedNote.originalIndex, velocity: processedNote.velocity };
        const x = (processedNote.time * 4) * stepWidth; 
        const width = (processedNote.duration * 4) * stepWidth;
        const noteStartStep = Math.floor(processedNote.time * 4);
        const noteEndStep = Math.floor((processedNote.time + processedNote.duration) * 4);
        const isActive = currentPlayStep !== -1 && currentPlayStep >= noteStartStep && currentPlayStep < noteEndStep;
        return { x, y: yPosition, width: Math.max(1, width - 0.5), height: synthRowHeight - 0.5, isActive, isDrum: false, originalIndex: processedNote.originalIndex, velocity: processedNote.velocity }; 
      }).filter(vNote => vNote.width > 0);
    }
  }, [currentPatternFromProps, trackType, mainGridHeight, isFullscreenContext, stepWidth, totalSteps, currentPlayStep, synthRowHeight, shiftedNotesForDisplay, viewLowestMidiNote, PITCH_RANGE_SYNTH, octaveShift]);


  const handleMouseDownOnGrid = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (!derivedIsEditModeActive || !onUpdatePatternForEdit || trackType !== TrackType.SYNTH || !synthRowHeight || !currentPatternFromProps || !svgRef.current) return;

    const target = event.target as SVGElement;
    if (target.closest('[data-velocity-control="true"]')) {
        return;
    }

    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const { x: svgX, y: svgY } = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    const clickXInGrid = svgX - gridStartX;
    const clickYInGrid = svgY;

    if (clickXInGrid < 0 || clickXInGrid > gridContentWidth || clickYInGrid < 0 || clickYInGrid > mainGridHeight) return;

    const stepIndex = Math.floor(clickXInGrid / stepWidth);
    const pitchIndexFromTop = Math.floor(clickYInGrid / synthRowHeight);
    
    const clickedVisualNoteMidi = (viewLowestMidiNote + PITCH_RANGE_SYNTH - 1) - pitchIndexFromTop;
    const baseNoteForAction = Math.max(0, Math.min(127, clickedVisualNoteMidi - (octaveShift * 12)));

    const existingNoteHit = visualNotes.find(vNote => {
        if (vNote.isDrum || vNote.x === -1) return false;
        return clickXInGrid >= vNote.x && clickXInGrid < vNote.x + vNote.width &&
               clickYInGrid >= vNote.y && clickYInGrid < vNote.y + vNote.height;
    });

    if (existingNoteHit && existingNoteHit.originalIndex !== undefined && currentPatternFromProps[existingNoteHit.originalIndex]) {
        const originalNote = currentPatternFromProps[existingNoteHit.originalIndex];
        setMouseDownInfo({ 
            type: 'existing', 
            startStep: Math.floor(originalNote.time * 4), // original start step of the note
            noteMidi: originalNote.note, // original base MIDI pitch
            originalPatternIndex: existingNoteHit.originalIndex, 
            initialClientX: event.clientX, 
            initialClientY: event.clientY,
            initialNoteTime: originalNote.time,
            initialNotePitch: originalNote.note 
        });
    } else {
        setMouseDownInfo({ 
            type: 'new', 
            startStep: stepIndex, 
            currentStep: stepIndex, 
            noteMidi: baseNoteForAction, 
            visualNoteMidi: clickedVisualNoteMidi, 
            initialClientX: event.clientX, 
            initialClientY: event.clientY 
        });
    }

  }, [derivedIsEditModeActive, onUpdatePatternForEdit, trackType, synthRowHeight, currentPatternFromProps, gridStartX, gridContentWidth, mainGridHeight, stepWidth, viewLowestMidiNote, octaveShift, visualNotes, PITCH_RANGE_SYNTH]);


  const handleGlobalMouseMove = useCallback((event: MouseEvent) => {
    if (!mouseDownInfo || !svgRef.current || !onUpdatePatternForEdit || !currentPatternFromProps) return;

    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const { x: currentSvgX, y: currentSvgY } = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    const DRAG_THRESHOLD = 3; // pixels

    if (mouseDownInfo.type === 'new' || mouseDownInfo.type === 'dragging-new') {
        const currentGridX = currentSvgX - gridStartX;
        const currentLiveStep = Math.max(0, Math.min(totalSteps - 1, Math.floor(currentGridX / stepWidth)));
        if (Math.abs(event.clientX - mouseDownInfo.initialClientX) > DRAG_THRESHOLD || 
            Math.abs(event.clientY - mouseDownInfo.initialClientY) > DRAG_THRESHOLD || 
            mouseDownInfo.type === 'dragging-new') {
            
            setMouseDownInfo(prev => {
                if (!prev) return null;
                return { 
                    ...prev, 
                    type: 'dragging-new', 
                    currentStep: Math.max(prev.startStep, currentLiveStep) 
                };
            });
        }
    } else if (mouseDownInfo.type === 'existing') {
        if (Math.abs(event.clientX - mouseDownInfo.initialClientX) > DRAG_THRESHOLD || 
            Math.abs(event.clientY - mouseDownInfo.initialClientY) > DRAG_THRESHOLD) {
            setMouseDownInfo(prev => prev ? { ...prev, type: 'dragging-existing' } : null);
            // First transition to dragging-existing, actual move logic will run on next mouse move event if type is 'dragging-existing'
        }
    } else if (mouseDownInfo.type === 'dragging-existing' && mouseDownInfo.originalPatternIndex !== undefined && mouseDownInfo.initialNoteTime !== undefined && mouseDownInfo.initialNotePitch !== undefined) {
        const updatedPattern = [...currentPatternFromProps];
        const noteToMove = updatedPattern[mouseDownInfo.originalPatternIndex];
        if (!noteToMove) {
             setMouseDownInfo(null); return;
        }

        const deltaX = event.clientX - mouseDownInfo.initialClientX;
        const deltaY = event.clientY - mouseDownInfo.initialClientY;

        const deltaSteps = Math.round(deltaX / stepWidth);
        const deltaPitches = Math.round(deltaY / synthRowHeight); // Negative deltaY means higher pitch

        let newTime = mouseDownInfo.initialNoteTime + (deltaSteps / 4);
        let newBasePitch = mouseDownInfo.initialNotePitch - deltaPitches; // -delta because Y is inverted

        newBasePitch = Math.max(0, Math.min(127, newBasePitch));
        const noteDurationInBeats = noteToMove.duration;
        newTime = Math.max(0, Math.min((totalSteps / 4) - noteDurationInBeats, newTime));
        // Ensure time is quantized to a reasonable grid, e.g., 16th notes (0.25 beats)
        newTime = Math.round(newTime * 4) / 4;


        if (noteToMove.time !== newTime || noteToMove.note !== newBasePitch) {
            noteToMove.time = newTime;
            noteToMove.note = newBasePitch;
            onUpdatePatternForEdit(updatedPattern);
        }

    } else if (mouseDownInfo.type === 'velocity-drag' && mouseDownInfo.velocityDragState && onUpdateNoteVelocity) {
        const { noteIndex, initialMouseY, initialVelocity } = mouseDownInfo.velocityDragState;
        const deltaY = event.clientY - initialMouseY;
        const velocityChange = (-deltaY / VELOCITY_LANE_HEIGHT) * 127;
        let newVelocity = initialVelocity + velocityChange;
        newVelocity = Math.max(0, Math.min(127, Math.round(newVelocity)));
        onUpdateNoteVelocity(noteIndex, newVelocity);
    }
  }, [mouseDownInfo, gridStartX, stepWidth, totalSteps, onUpdatePatternForEdit, currentPatternFromProps, synthRowHeight, onUpdateNoteVelocity]);

  const handleGlobalMouseUp = useCallback((event: MouseEvent) => {
    if (!mouseDownInfo || !onUpdatePatternForEdit || !currentPatternFromProps) {
        setMouseDownInfo(null);
        return;
    }

    if (mouseDownInfo.type === 'new') { 
        const newNote: MidiNote = { 
            note: mouseDownInfo.noteMidi, 
            velocity: EDIT_MODE_DEFAULT_VELOCITY, 
            time: mouseDownInfo.startStep / 4, 
            duration: EDIT_MODE_DEFAULT_DURATION_16TH 
        };
        onUpdatePatternForEdit([...currentPatternFromProps, newNote]);
    } else if (mouseDownInfo.type === 'dragging-new' && mouseDownInfo.currentStep !== undefined) {
        const durationSteps = mouseDownInfo.currentStep - mouseDownInfo.startStep + 1;
        if (durationSteps > 0) {
            const newNote: MidiNote = { 
                note: mouseDownInfo.noteMidi, 
                velocity: EDIT_MODE_DEFAULT_VELOCITY, 
                time: mouseDownInfo.startStep / 4, 
                duration: durationSteps * 0.25 
            };
            onUpdatePatternForEdit([...currentPatternFromProps, newNote]);
        }
    } else if (mouseDownInfo.type === 'existing' && mouseDownInfo.originalPatternIndex !== undefined) { 
        // This case means it was a click on an existing note without a drag that transitioned to 'dragging-existing'. So, delete.
        const newPattern = currentPatternFromProps.filter((_, idx) => idx !== mouseDownInfo.originalPatternIndex);
        onUpdatePatternForEdit(newPattern);
    } else if (mouseDownInfo.type === 'dragging-existing') {
        // The pattern was already updated during mouse move by onUpdatePatternForEdit.
        // No further action needed here for the pattern itself.
    }
    
    setMouseDownInfo(null);
  }, [mouseDownInfo, onUpdatePatternForEdit, currentPatternFromProps]);

  useEffect(() => {
    if (mouseDownInfo) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    } else {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [mouseDownInfo, handleGlobalMouseMove, handleGlobalMouseUp]);


  const handleVelocityMouseDown = (event: React.MouseEvent, noteOriginalIndex: number) => {
    if (!onUpdateNoteVelocity || !currentPatternFromProps || trackType !== TrackType.SYNTH) return;
    event.stopPropagation();
    const originalNote = currentPatternFromProps[noteOriginalIndex];
    if (!originalNote) return;

    setMouseDownInfo({
        type: 'velocity-drag',
        startStep: 0, 
        noteMidi: 0,  
        initialClientX: event.clientX,
        initialClientY: event.clientY,
        velocityDragState: {
            noteIndex: noteOriginalIndex,
            initialMouseY: event.clientY,
            initialVelocity: originalNote.velocity,
        }
    });
  };
  
  const getCursorStyle = () => {
    if (mouseDownInfo) {
        if (mouseDownInfo.type === 'new' || mouseDownInfo.type === 'dragging-new') return 'cursor-crosshair';
        if (mouseDownInfo.type === 'velocity-drag') return 'cursor-ns-resize';
        if (mouseDownInfo.type === 'dragging-existing') return 'cursor-grabbing'; // Or 'cursor-move'
    }
    if (derivedIsEditModeActive && trackType === TrackType.SYNTH) return 'cursor-pointer'; // Default for clickable grid
    return '';
  };


  return (
    <svg
      ref={svgRef}
      width={svgWidth}
      height={totalSvgHeight}
      viewBox={`0 0 ${svgWidth} ${totalSvgHeight}`}
      className={`bg-neutral-900/70 rounded-lg ${getCursorStyle()}`}
      aria-label={`Pattern visualization for ${safeBars} bars. ${trackType === TrackType.DRUM ? 'Drum track.' : 'Synth track (piano roll).'}${(trackType === TrackType.SYNTH && octaveShift !==0) ? ` Octave shift: ${octaveShift > 0 ? '+' : ''}${octaveShift}.` : ''}${derivedIsEditModeActive ? ' Edit mode active.' : ''}`}
      role="grid" 
      onMouseDown={trackType === TrackType.SYNTH && derivedIsEditModeActive ? handleMouseDownOnGrid : undefined}
    >
      {/* Piano Keys for SYNTH (occupy mainGridHeight) */}
      {trackType === TrackType.SYNTH && synthRowHeight > 0 && (
        <g aria-label="Piano keys" transform={`translate(0,0)`}>
          {Array.from({ length: PITCH_RANGE_SYNTH }).map((_, i) => {
            const midiNoteForKey = (viewLowestMidiNote + PITCH_RANGE_SYNTH - 1) - i; 
            if (midiNoteForKey < 0 || midiNoteForKey > 127) return null;
            const yPos = i * synthRowHeight;
            const isBlackKey = [1, 3, 6, 8, 10].includes(midiNoteForKey % 12);
            const keyFill = isBlackKey ? '#262626' : '#a3a3a3';
            const keyStroke = isBlackKey ? '#171717' : '#525252';
            let keyLabelText = null;
            if (midiNoteForKey % 12 === 0) { 
                try { keyLabelText = R_.Frequency(midiNoteForKey, "midi").toNote(); } catch(e) { /* ignore */ }
            }
            return (
              <React.Fragment key={`piano-key-${i}-${midiNoteForKey}`}>
                <rect x="0" y={yPos} width={PIANO_KEY_WIDTH} height={synthRowHeight} fill={keyFill} stroke={keyStroke} strokeWidth="0.5" aria-hidden="true"/>
                {keyLabelText && (
                  <text x={PIANO_KEY_WIDTH / 2} y={yPos + synthRowHeight / 2} fill={isBlackKey ? 'white' : 'black'} fontSize={Math.max(6, Math.min(10, synthRowHeight * 0.4))} textAnchor="middle" dominantBaseline="middle" pointerEvents="none" className="font-sans font-semibold" aria-hidden="true">
                    {keyLabelText}
                  </text>
                )}
              </React.Fragment>
            );
          })}
        </g>
      )}

      {/* Main Grid Area (notes) */}
      <g transform={`translate(${gridStartX}, 0)`} aria-label="Note grid">
        {Array.from({ length: totalSteps +1 }).map((_, i) => (
          <line key={`v-line-${i}`} x1={i * stepWidth} y1="0" x2={i * stepWidth} y2={mainGridHeight} stroke={i % STEPS_PER_BAR === 0 ? "rgba(255,255,255,0.15)" : (i % (STEPS_PER_BAR / 4) === 0 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)")} strokeWidth="1" shapeRendering="crispEdges" aria-hidden="true" pointerEvents="none" />
        ))}
        {trackType === TrackType.SYNTH && synthRowHeight > 0 &&
          Array.from({ length: PITCH_RANGE_SYNTH }).map((_, i) => {
            const yPos = (i + 1) * synthRowHeight; 
            if (yPos >= mainGridHeight) return null;
            const noteAtLineTop = (viewLowestMidiNote + PITCH_RANGE_SYNTH -1) - i;
            const isCLine = (noteAtLineTop % 12 === 0 && i !== 0);
            const strokeColor = isCLine ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)";
            const strokeW = isCLine ? "1" : "0.5";
            return (<line key={`synth-hline-${i}`} x1="0" y1={yPos} x2={gridContentWidth} y2={yPos} stroke={strokeColor} strokeWidth={strokeW} shapeRendering="crispEdges" aria-hidden="true" pointerEvents="none"/>);
        })}
        
        {visualNotes.map((vNote, index) =>
          vNote.isDrum ? (
            <circle key={`note-${index}-${vNote.x}-${vNote.y}`} cx={vNote.x} cy={vNote.y} r={vNote.width / 2} fill={vNote.isActive ? "rgba(251, 146, 60, 1)" : "rgba(168, 85, 247, 0.8)"} aria-label={vNote.isActive ? "Active drum hit" : "Drum hit"} pointerEvents="none"/>
          ) : (
            <rect 
              key={`note-${vNote.originalIndex}-${vNote.x}-${vNote.y}`} 
              x={vNote.x + 0.25} y={vNote.y + 0.25} 
              width={vNote.width} height={vNote.height} 
              fill={vNote.isActive ? "rgba(251, 146, 60, 1)" : "rgba(34, 211, 238, 0.8)"} 
              rx="2" ry="2" 
              shapeRendering="crispEdges" 
              aria-label={vNote.isActive ? "Active synth note" : "Synth note"} 
              className={derivedIsEditModeActive && trackType === TrackType.SYNTH && !(mouseDownInfo && mouseDownInfo.type === 'dragging-existing' && mouseDownInfo.originalPatternIndex === vNote.originalIndex) ? 'hover:stroke-cyan-300 hover:stroke-2' : ''}
              pointerEvents={derivedIsEditModeActive && trackType === TrackType.SYNTH ? "all" : "none"} // Needs 'all' for hover to work on existing notes for potential click/drag
            />
          )
        )}

        {trackType === TrackType.SYNTH && mouseDownInfo && (mouseDownInfo.type === 'new' || mouseDownInfo.type === 'dragging-new') && mouseDownInfo.currentStep !== undefined && mouseDownInfo.visualNoteMidi !== undefined && synthRowHeight > 0 && (
            (() => {
                const visualMidi = mouseDownInfo.visualNoteMidi!;
                if (visualMidi < viewLowestMidiNote || visualMidi >= viewLowestMidiNote + PITCH_RANGE_SYNTH) return null;

                const offsetInView = visualMidi - viewLowestMidiNote;
                const yPos = ((PITCH_RANGE_SYNTH - 1) - offsetInView) * synthRowHeight;
                const xPos = mouseDownInfo.startStep * stepWidth;
                const currentEndStep = mouseDownInfo.currentStep!;
                const ghostWidth = (currentEndStep - mouseDownInfo.startStep + 1) * stepWidth;

                return (
                    <rect
                        x={xPos + 0.25} y={yPos + 0.25}
                        width={Math.max(1, ghostWidth - 0.5)} height={synthRowHeight - 0.5}
                        fill="rgba(251, 146, 60, 0.4)" 
                        stroke="rgba(251, 146, 60, 0.7)"
                        strokeWidth="1.5"
                        rx="2" ry="2"
                        shapeRendering="crispEdges"
                        pointerEvents="none"
                        aria-label="Note creation preview"
                    />
                );
            })()
        )}


        {currentPlayStep !== -1 && totalSteps > 0 && stepWidth > 0 && currentPlayStep < totalSteps && (
          <line x1={currentPlayStep * stepWidth + stepWidth / 2} y1="0" x2={currentPlayStep * stepWidth + stepWidth / 2} y2={mainGridHeight} stroke="rgba(253, 224, 71, 0.8)" strokeWidth="2" shapeRendering="crispEdges" aria-label="Playhead position" pointerEvents="none" />
        )}
      </g>

      {showVelocityLane && trackType === TrackType.SYNTH && currentPatternFromProps && (
        <g transform={`translate(${gridStartX}, ${mainGridHeight})`} aria-label="Velocity editing lane">
          <rect x="0" y="0" width={gridContentWidth} height={VELOCITY_LANE_HEIGHT} fill="rgba(0,0,0,0.2)" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" shapeRendering="crispEdges" />
          {Array.from({ length: totalSteps + 1 }).map((_, i) => (
            <line key={`vel-vline-${i}`} x1={i * stepWidth} y1="0" x2={i * stepWidth} y2={VELOCITY_LANE_HEIGHT} stroke={i % STEPS_PER_BAR === 0 ? "rgba(255,255,255,0.1)" : (i % (STEPS_PER_BAR/4) === 0 ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.05)")} strokeWidth="0.5" shapeRendering="crispEdges" pointerEvents="none" />
          ))}
          {[0.25, 0.5, 0.75].map(frac => (
             <line key={`vel-hline-${frac}`} x1="0" y1={VELOCITY_LANE_HEIGHT * (1-frac)} x2={gridContentWidth} y2={VELOCITY_LANE_HEIGHT * (1-frac)} stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" strokeDasharray="2,2" pointerEvents="none"/>
          ))}
          {visualNotes.filter(vn => !vn.isDrum && vn.velocity !== undefined && vn.originalIndex !== undefined && currentPatternFromProps[vn.originalIndex] !== undefined).map((vNote) => {
            const noteData = currentPatternFromProps[vNote.originalIndex!]; 
            if(!noteData) return null;
            const noteVelocity = noteData.velocity;
            
            const lineX = vNote.x + (vNote.width > VELOCITY_MARKER_LINE_WIDTH * 2 ? vNote.width * 0.1 : VELOCITY_MARKER_LINE_WIDTH / 2) ; 
            const lineY2 = VELOCITY_LANE_HEIGHT - (noteVelocity / 127) * VELOCITY_LANE_HEIGHT; 
            const headCx = lineX;
            const headCy = lineY2;
            const colorIntensity = Math.min(255, 50 + Math.floor(noteVelocity * 1.6)); 
            const markerColor = `rgba(251, ${146 + Math.floor(colorIntensity/3)}, 60, 0.9)`;

            return (
              <g 
                key={`vel-marker-${vNote.originalIndex}`} 
                onMouseDown={(e) => handleVelocityMouseDown(e, vNote.originalIndex!)}
                className="cursor-ns-resize"
                aria-label={`Velocity for note at time ${noteData.time.toFixed(2)}, value ${noteVelocity}`}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={127}
                aria-valuenow={noteVelocity}
                data-velocity-control="true" 
              >
                <line
                  x1={lineX} y1={VELOCITY_LANE_HEIGHT}
                  x2={lineX} y2={lineY2}
                  stroke={markerColor}
                  strokeWidth={VELOCITY_MARKER_LINE_WIDTH}
                  shapeRendering="crispEdges"
                />
                <circle
                  cx={headCx} cy={headCy}
                  r={VELOCITY_MARKER_HEAD_RADIUS}
                  fill={markerColor}
                  stroke="rgba(0,0,0,0.3)"
                  strokeWidth="0.5"
                />
              </g>
            );
          })}
           {currentPlayStep !== -1 && totalSteps > 0 && stepWidth > 0 && currentPlayStep < totalSteps && (
              <line
                x1={currentPlayStep * stepWidth + stepWidth / 2} y1="0"
                x2={currentPlayStep * stepWidth + stepWidth / 2} y2={VELOCITY_LANE_HEIGHT}
                stroke="rgba(253, 224, 71, 0.7)" 
                strokeWidth="1.5"
                shapeRendering="crispEdges"
                pointerEvents="none"
              />
            )}
        </g>
      )}
    </svg>
  );
};