
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { type MidiNote } from '../types';
import { 
  STEPS_PER_BAR, DEFAULT_BARS, REVERSE_ROLAND_TR8S_MAP, 
  DRUM_GRID_INSTRUMENT_LABEL_WIDTH, DRUM_GRID_HEADER_HEIGHT,
  DRUM_GRID_ORDERED_INSTRUMENTS, EDIT_MODE_DEFAULT_VELOCITY, EDIT_MODE_DEFAULT_DURATION_16TH,
  VELOCITY_LANE_HEIGHT, VELOCITY_MARKER_LINE_WIDTH, VELOCITY_MARKER_HEAD_RADIUS
} from '../constants';

interface DrumGridVisualizerProps {
  pattern: MidiNote[];
  bars: number;
  currentPlayStep: number;
  containerHeight: number; 
  targetViewportGridWidth: number; 
  isEditModeActive?: boolean; 
  onUpdatePatternForEdit?: (newPattern: MidiNote[]) => void;
  onUpdateNoteVelocity?: (noteIndex: number, newVelocity: number) => void; // New prop
}

interface InstrumentRow {
  name: string;
  note: number;
}

interface DragState {
  noteIndex: number;
  initialMouseY: number;
  initialVelocity: number;
}


export const DrumGridVisualizer: React.FC<DrumGridVisualizerProps> = ({
  pattern,
  bars,
  currentPlayStep,
  containerHeight, // This is height for the grid part EXCLUDING velocity lane
  targetViewportGridWidth,
  isEditModeActive: isEditModeActiveProp, 
  onUpdatePatternForEdit,
  onUpdateNoteVelocity,
}) => {
  const safeBars = (typeof bars === 'number' && bars > 0) ? bars : DEFAULT_BARS;
  const totalSteps = STEPS_PER_BAR * safeBars;
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingVelocityState, setDraggingVelocityState] = useState<DragState | null>(null);

  const derivedIsEditModeActive = onUpdatePatternForEdit !== undefined 
    ? (isEditModeActiveProp === undefined ? true : isEditModeActiveProp) 
    : false;
  
  const showVelocityLane = derivedIsEditModeActive && onUpdateNoteVelocity;


  const instrumentRows = React.useMemo(() => {
    return DRUM_GRID_ORDERED_INSTRUMENTS.map(noteValue => ({
      name: REVERSE_ROLAND_TR8S_MAP[noteValue] || `MIDI ${noteValue}`,
      note: noteValue,
    }));
  }, []);

  const stepsToDisplayInViewport = STEPS_PER_BAR * 2; 
  const stepWidth = Math.max(1, targetViewportGridWidth / stepsToDisplayInViewport);
  // rowHeight for the main drum grid (instrument rows)
  const mainGridRowHeight = Math.max(10, stepWidth); 

  const gridContentWidth = totalSteps * stepWidth; 
  // gridRenderHeight is for the instrument rows part of the grid
  const gridRenderHeight = instrumentRows.length * mainGridRowHeight;

  // svgTotalHeight includes main grid, header, and velocity lane if shown
  const totalHeaderAndGridHeight = DRUM_GRID_HEADER_HEIGHT + gridRenderHeight;
  const svgTotalHeight = showVelocityLane 
    ? totalHeaderAndGridHeight + VELOCITY_LANE_HEIGHT 
    : totalHeaderAndGridHeight;
  
  const svgTotalWidth = DRUM_GRID_INSTRUMENT_LABEL_WIDTH + gridContentWidth;


  const getNoteColor = (noteVelocity: number, isActiveCell: boolean) => {
    if (isActiveCell) return `rgba(255, 165, 0, 1)`; 
    const baseOpacity = Math.max(0.3, Math.min(1, noteVelocity / 127));
    return `rgba(239, 68, 68, ${baseOpacity * 0.8 + 0.2})`; 
  };

  const handleCellClick = (stepIndex: number, instrumentNoteValue: number) => {
    if (!derivedIsEditModeActive || !onUpdatePatternForEdit || !pattern) return;

    const newPattern = [...pattern]; 
    const existingNoteIndex = newPattern.findIndex(
      n => Math.floor(n.time * 4) === stepIndex && n.note === instrumentNoteValue
    );

    if (existingNoteIndex > -1) {
      newPattern.splice(existingNoteIndex, 1);
    } else {
      newPattern.push({
        note: instrumentNoteValue,
        velocity: EDIT_MODE_DEFAULT_VELOCITY,
        time: stepIndex / 4, 
        duration: EDIT_MODE_DEFAULT_DURATION_16TH, 
      });
    }
    onUpdatePatternForEdit(newPattern);
  };

  // Velocity Drag Handlers
  const handleVelocityMouseDown = (event: React.MouseEvent, noteIndex: number) => {
    if (!onUpdateNoteVelocity || !pattern) return;
    event.stopPropagation(); 
    const originalNote = pattern[noteIndex];
    if (!originalNote) return;

    setDraggingVelocityState({
      noteIndex: noteIndex,
      initialMouseY: event.clientY,
      initialVelocity: originalNote.velocity,
    });
  };

  const handleDocumentMouseMove = useCallback((event: MouseEvent) => {
    if (!draggingVelocityState || !onUpdateNoteVelocity || !svgRef.current) return;
    
    const { noteIndex, initialMouseY, initialVelocity } = draggingVelocityState;
    const deltaY = event.clientY - initialMouseY;
    const velocityChange = (-deltaY / VELOCITY_LANE_HEIGHT) * 127;
    let newVelocity = initialVelocity + velocityChange;
    newVelocity = Math.max(0, Math.min(127, Math.round(newVelocity)));
    
    onUpdateNoteVelocity(noteIndex, newVelocity);

  }, [draggingVelocityState, onUpdateNoteVelocity]);

  const handleDocumentMouseUp = useCallback(() => {
    setDraggingVelocityState(null);
  }, []);

  useEffect(() => {
    if (draggingVelocityState) {
      document.addEventListener('mousemove', handleDocumentMouseMove);
      document.addEventListener('mouseup', handleDocumentMouseUp);
    } else {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, [draggingVelocityState, handleDocumentMouseMove, handleDocumentMouseUp]);


  return (
    <svg
      ref={svgRef}
      width={svgTotalWidth}
      height={svgTotalHeight} 
      viewBox={`0 0 ${svgTotalWidth} ${svgTotalHeight}`}
      className={`bg-neutral-500 rounded ${derivedIsEditModeActive ? 'cursor-pointer' : ''} ${draggingVelocityState ? 'cursor-ns-resize': ''}`}
      aria-label={`Drum grid pattern visualization for ${safeBars} bars.${derivedIsEditModeActive ? ' Edit mode active.' : ''}`}
      role="grid"
    >
       {/* Instrument Labels Area */}
       <g transform={`translate(0, ${DRUM_GRID_HEADER_HEIGHT})`}>
        {instrumentRows.map((inst, index) => (
          <rect
            key={`label-bg-${inst.note}`}
            x="0"
            y={index * mainGridRowHeight}
            width={DRUM_GRID_INSTRUMENT_LABEL_WIDTH}
            height={mainGridRowHeight}
            fill="rgba(64, 64, 64, 0.7)" 
            stroke="rgba(100,100,100,0.3)"
            strokeWidth="0.5"
          />
        ))}
        {instrumentRows.map((inst, index) => (
          <text
            key={`label-${inst.note}`}
            x={DRUM_GRID_INSTRUMENT_LABEL_WIDTH / 2}
            y={index * mainGridRowHeight + mainGridRowHeight / 2}
            fill="rgba(220, 220, 220, 0.9)"
            fontSize={Math.max(8, Math.min(12, mainGridRowHeight * 0.35))}
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-sans font-medium select-none"
            aria-label={inst.name}
          >
            {inst.name}
          </text>
        ))}
      </g>
      
      {/* Beat Header Area */}
      <g transform={`translate(${DRUM_GRID_INSTRUMENT_LABEL_WIDTH}, 0)`}>
        {Array.from({length: safeBars * 4}).map((_, beatIndex) => {
            const barIndex = Math.floor(beatIndex / 4);
            const beatInBar = beatIndex % 4;
            // Center text in the middle of each beat's span of 16th notes
            const beatX = (barIndex * STEPS_PER_BAR + beatInBar * (STEPS_PER_BAR / 4)) * stepWidth + (stepWidth * (STEPS_PER_BAR / 4) / 2) ;
            if (beatX > gridContentWidth + stepWidth) return null; 
            return (
                <text key={`beat-header-${beatIndex}`} x={beatX} y={DRUM_GRID_HEADER_HEIGHT / 2} fill="rgba(200,200,200,0.7)" fontSize={Math.max(8, Math.min(10, DRUM_GRID_HEADER_HEIGHT * 0.5))} textAnchor="middle" dominantBaseline="middle" className="font-sans select-none">
                    { beatInBar + 1}
                </text>
            );
        })}
      </g>

      {/* Main Drum Grid Cells */}
      <g transform={`translate(${DRUM_GRID_INSTRUMENT_LABEL_WIDTH}, ${DRUM_GRID_HEADER_HEIGHT})`} role="rowgroup">
        {instrumentRows.map((inst, rowIndex) => (
          <React.Fragment key={`row-${inst.note}`}>
            {Array.from({ length: totalSteps }).map((_, stepIndex) => {
              const x = stepIndex * stepWidth;
              const y = rowIndex * mainGridRowHeight;
              const cellDimension = stepWidth - 1; 
              const currentPatternForCheck = pattern || []; 
              const existingNote = currentPatternForCheck.find(
                n => n.note === inst.note && Math.floor(n.time * 4) === stepIndex
              );
              const isActiveCell = currentPlayStep !== -1 && existingNote && currentPlayStep >= Math.floor(existingNote.time * 4) && currentPlayStep < Math.floor((existingNote.time + existingNote.duration) * 4) ;
              return (
                <rect
                  key={`cell-${inst.note}-${stepIndex}`}
                  x={x + 0.5} y={y + 0.5}
                  width={Math.max(1, cellDimension)} height={Math.max(1, cellDimension)}
                  fill={existingNote ? getNoteColor(existingNote.velocity, isActiveCell) : (derivedIsEditModeActive ? 'rgba(255,255,255,0.03)' : 'transparent')}
                  stroke={derivedIsEditModeActive ? 'rgba(255,255,255,0.1)' : 'transparent'}
                  strokeWidth={0.5}
                  onClick={() => handleCellClick(stepIndex, inst.note)}
                  className={derivedIsEditModeActive ? 'hover:bg-opacity-20 hover:bg-yellow-300' : ''}
                  aria-label={derivedIsEditModeActive ? `Edit cell for ${inst.name} at step ${stepIndex + 1}. ${existingNote ? 'Note active.' : 'Empty.'}` : `${inst.name} at step ${stepIndex + 1}. ${existingNote ? 'Note active.' : 'Empty.'}`}
                  role="gridcell"
                />
              );
            })}
          </React.Fragment>
        ))}
        
        {/* Visual grid lines for main drum grid */}
        {instrumentRows.map((_, i) => (
          <line key={`h-line-${i}`} x1="0" y1={i * mainGridRowHeight} x2={gridContentWidth} y2={i * mainGridRowHeight} stroke="rgba(200,200,200,0.15)" strokeWidth="0.5" shapeRendering="crispEdges" role="presentation" pointerEvents="none"/>
        ))}
        {instrumentRows.length > 0 && <line x1="0" y1={instrumentRows.length * mainGridRowHeight} x2={gridContentWidth} y2={instrumentRows.length * mainGridRowHeight} stroke="rgba(200,200,200,0.15)" strokeWidth="0.5" shapeRendering="crispEdges" role="presentation" pointerEvents="none"/>}
        {Array.from({ length: totalSteps }).map((_, i) => ( 
          <line key={`v-line-${i}`} x1={i * stepWidth} y1="0" x2={i * stepWidth} y2={gridRenderHeight} stroke={i % STEPS_PER_BAR === 0 ? "rgba(200,200,200,0.3)" : (i % (STEPS_PER_BAR / 4) === 0 ? "rgba(200,200,200,0.2)" : "rgba(200,200,200,0.1)")} strokeWidth="1" shapeRendering="crispEdges" role="presentation" pointerEvents="none"/>
        ))}
        {totalSteps > 0 && <line x1={totalSteps * stepWidth} y1="0" x2={totalSteps * stepWidth} y2={gridRenderHeight} stroke="rgba(200,200,200,0.3)" strokeWidth="1" shapeRendering="crispEdges" role="presentation" pointerEvents="none"/>}

        {/* Playhead for main drum grid */}
        {currentPlayStep !== -1 && totalSteps > 0 && stepWidth > 0 && currentPlayStep < totalSteps && (
          <line x1={currentPlayStep * stepWidth + stepWidth / 2} y1={0} x2={currentPlayStep * stepWidth + stepWidth / 2} y2={gridRenderHeight} stroke="rgba(255, 255, 0, 0.7)" strokeWidth="2" shapeRendering="crispEdges" aria-label="Playhead position" role="separator" pointerEvents="none"/>
        )}
      </g>

      {/* Velocity Lane for DRUMS (only in fullscreen edit mode) */}
      {showVelocityLane && (
        <g transform={`translate(${DRUM_GRID_INSTRUMENT_LABEL_WIDTH}, ${totalHeaderAndGridHeight})`} aria-label="Drum velocity editing lane">
          {/* Lane Background */}
          <rect x="0" y="0" width={gridContentWidth} height={VELOCITY_LANE_HEIGHT} fill="rgba(0,0,0,0.1)" stroke="rgba(200,200,200,0.2)" strokeWidth="0.5" shapeRendering="crispEdges" />
          {/* Vertical grid lines for velocity lane */}
          {Array.from({ length: totalSteps + 1 }).map((_, i) => (
            <line key={`vel-drum-vline-${i}`} x1={i * stepWidth} y1="0" x2={i * stepWidth} y2={VELOCITY_LANE_HEIGHT} stroke={i % STEPS_PER_BAR === 0 ? "rgba(200,200,200,0.2)" : (i % (STEPS_PER_BAR/4) === 0 ? "rgba(200,200,200,0.1)" : "rgba(200,200,200,0.05)")} strokeWidth="0.5" shapeRendering="crispEdges" pointerEvents="none" />
          ))}
          {/* Horizontal lines for velocity reference */}
          {[0.25, 0.5, 0.75].map(frac => (
             <line key={`vel-drum-hline-${frac}`} x1="0" y1={VELOCITY_LANE_HEIGHT * (1-frac)} x2={gridContentWidth} y2={VELOCITY_LANE_HEIGHT * (1-frac)} stroke="rgba(200,200,200,0.1)" strokeWidth="0.5" strokeDasharray="2,2" pointerEvents="none"/>
          ))}

          {/* Velocity Markers (Lollipops) for Drum Notes */}
          {pattern && pattern.map((note, noteIndex) => {
            const stepIndex = Math.floor(note.time * 4);
            const lineX = stepIndex * stepWidth + stepWidth / 2; // Center in the step
            const lineY2 = VELOCITY_LANE_HEIGHT - (note.velocity / 127) * VELOCITY_LANE_HEIGHT;
            const headCx = lineX;
            const headCy = lineY2;
            const colorIntensity = Math.min(255, 50 + Math.floor(note.velocity * 1.6));
            const markerColor = `rgba(${colorIntensity}, ${Math.floor(colorIntensity * 0.6)}, 0, 0.9)`;

            // To avoid visual clutter if multiple drum hits are on the same step,
            // we might slightly offset them or ensure lollipop heads are small.
            // For now, they might overlap.
            const instrumentLabel = REVERSE_ROLAND_TR8S_MAP[note.note] || `MIDI ${note.note}`;

            return (
              <g 
                key={`vel-drum-marker-${noteIndex}-${note.note}-${note.time}`} 
                onMouseDown={(e) => handleVelocityMouseDown(e, noteIndex)}
                className="cursor-ns-resize"
                aria-label={`Velocity for ${instrumentLabel} at step ${stepIndex + 1}, value ${note.velocity}`}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={127}
                aria-valuenow={note.velocity}
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
           {/* Playhead for velocity lane */}
           {currentPlayStep !== -1 && totalSteps > 0 && stepWidth > 0 && currentPlayStep < totalSteps && (
              <line
                x1={currentPlayStep * stepWidth + stepWidth / 2} y1="0"
                x2={currentPlayStep * stepWidth + stepWidth / 2} y2={VELOCITY_LANE_HEIGHT}
                stroke="rgba(255, 255, 0, 0.5)" 
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
