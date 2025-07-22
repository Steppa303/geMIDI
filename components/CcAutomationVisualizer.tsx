

import React from 'react';
import { type CcAutomationData } from '../types'; 
import { STEPS_PER_BAR, DEFAULT_BARS, DEFAULT_BAR_WIDTH, DEFAULT_SYNTH_VIEW_HEIGHT } from '../constants';

interface CcAutomationVisualizerProps {
  automationData: (CcAutomationData | null)[]; // Array of lanes
  currentPlayStep: number;
  containerHeight?: number; 
}

const laneColors = [
    'rgba(110, 231, 183, 0.9)', // Teal
    'rgba(192, 132, 252, 0.9)', // Purple
    'rgba(250, 204, 21, 0.9)'    // Yellow
];

const lanePointColors = [
    'rgba(5, 150, 105, 1)', // Darker Teal
    'rgba(147, 51, 234, 1)', // Darker Purple
    'rgba(234, 179, 8, 1)'   // Darker Yellow
];

export const CcAutomationVisualizer: React.FC<CcAutomationVisualizerProps> = ({
  automationData,
  currentPlayStep,
  containerHeight,
}) => {
  const firstValidLane = automationData.find(d => d !== null);
  const safeBars = firstValidLane?.bars || DEFAULT_BARS;
  const totalSteps = STEPS_PER_BAR * safeBars;

  const visualizerHeight = containerHeight || DEFAULT_SYNTH_VIEW_HEIGHT;
  const contentWidth = safeBars * DEFAULT_BAR_WIDTH;
  const stepWidth = totalSteps > 0 ? contentWidth / totalSteps : (DEFAULT_BAR_WIDTH / STEPS_PER_BAR);

  const svgWidth = contentWidth;
  const svgHeight = visualizerHeight;

  if (!firstValidLane) {
    return (
      <div 
        className="flex items-center justify-center h-full text-neutral-400 bg-neutral-500 rounded p-2" 
        style={{ minHeight: `${svgHeight}px`, width: `${svgWidth}px` }}
      >
        No CC automation data to display.
      </div>
    );
  }
  
  const transformValue = (originalValue: number, depth: number, offset: number): number => {
    const midpoint = 63.5;
    let scaledValue = midpoint + (originalValue - midpoint) * depth;
    scaledValue += offset;
    return Math.max(0, Math.min(127, Math.round(scaledValue)));
  };

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="bg-neutral-500 rounded"
      aria-label={`CC automation visualization for ${safeBars} bars.`}
    >
      {/* Grid Lines */}
      {Array.from({ length: totalSteps + 1 }).map((_, i) => (
        <line
          key={`v-line-cc-${i}`}
          x1={i * stepWidth} y1="0"
          x2={i * stepWidth} y2={svgHeight}
          stroke={i % STEPS_PER_BAR === 0 ? "rgba(200,200,200,0.3)" : (i % (STEPS_PER_BAR / 4) === 0 ? "rgba(200,200,200,0.2)" : "rgba(200,200,200,0.1)")}
          strokeWidth="1"
          shapeRendering="crispEdges"
          aria-hidden="true"
        />
      ))}
      {[0, 32, 64, 96, 127].map(val => {
        const yPos = svgHeight - (val / 127) * svgHeight;
        return (
          <line
            key={`h-line-cc-${val}`}
            x1="0" y1={yPos}
            x2={svgWidth} y2={yPos}
            stroke={val === 64 ? "rgba(200,200,200,0.25)" : "rgba(200,200,200,0.1)"}
            strokeWidth="0.5"
            strokeDasharray={val !==0 && val !== 127 ? "2,2" : undefined}
            shapeRendering="crispEdges"
            aria-hidden="true"
          />
        );
      })}

      {automationData.map((data, laneIndex) => {
        if (!data || !data.events || data.events.length === 0) return null;

        const { events, depth = 1, offset = 0 } = data;
        const sortedEvents = [...events].sort((a, b) => a.time - b.time);
        
        const points = sortedEvents
          .map(event => {
            const transformedVal = transformValue(event.value, depth, offset);
            const x = (event.time * 4) * stepWidth;
            const y = svgHeight - (transformedVal / 127) * svgHeight;
            return `${x},${y}`;
          })
          .join(' ');

        return (
          <g key={`lane-${laneIndex}`} aria-label={`CC Automation for CC#${data.cc}`}>
            <polyline
              points={points}
              fill="none"
              stroke={laneColors[laneIndex % laneColors.length]}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {sortedEvents.map((event, eventIndex) => {
              const transformedVal = transformValue(event.value, depth, offset);
              const x = (event.time * 4) * stepWidth;
              const y = svgHeight - (transformedVal / 127) * svgHeight;
              return (
                <circle
                  key={`cc-dot-${laneIndex}-${eventIndex}`}
                  cx={x}
                  cy={y}
                  r="2.5"
                  fill={lanePointColors[laneIndex % lanePointColors.length]}
                  stroke="rgba(200,200,200,0.5)"
                  strokeWidth="0.5"
                  aria-label={`CC event: time ${event.time.toFixed(2)} beats, original value ${event.value}, transformed value ${transformedVal}`}
                />
              );
            })}
          </g>
        );
      })}

      {/* Playhead */}
      {currentPlayStep !== -1 && totalSteps > 0 && stepWidth > 0 && currentPlayStep < totalSteps && (
        <line
          x1={currentPlayStep * stepWidth + stepWidth / 2} y1="0"
          x2={currentPlayStep * stepWidth + stepWidth / 2} y2={svgHeight}
          stroke="rgba(255, 255, 0, 0.7)" 
          strokeWidth="2"
          shapeRendering="crispEdges"
          aria-label="Playhead position"
        />
      )}
    </svg>
  );
};
