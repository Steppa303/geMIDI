

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (newValue: number) => void;
  unit?: string;
  logScale?: boolean; // For parameters like frequency
}

const MIN_ANGLE = -135; // Approx 7 o'clock
const MAX_ANGLE = 135;  // Approx 5 o'clock
const ANGLE_RANGE = MAX_ANGLE - MIN_ANGLE;

// Helper to convert linear value to log for knob position
const valueToLogRatio = (value: number, min: number, max: number): number => {
  if (min <= 0 || value <=0) { // Ensure value is also positive for log
    // Fallback to linear if min or value is not positive, or if max equals min
    if (max === min) return 0; // Avoid division by zero
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
  }
  if (max === min) return 0; // Avoid division by zero if inputs are positive but equal
  return (Math.log(value) - Math.log(min)) / (Math.log(max) - Math.log(min));
};

// Helper to convert log ratio back to value
const logRatioToValue = (ratio: number, min: number, max: number): number => {
  if (min <= 0) { // Fallback to linear if min is not positive
    if (max === min) return min;
    return min + ratio * (max - min);
  }
  if (max === min) return min;
  return Math.exp(Math.log(min) + ratio * (Math.log(max) - Math.log(min)));
};


export const Knob: React.FC<KnobProps> = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  unit = '',
  logScale = false,
}) => {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [angle, setAngle] = useState(0);

  const calculateAngle = useCallback((currentValue: number) => {
    if (max === min) return MIN_ANGLE; // Default to min position if range is zero
    let normalizedValue: number;
    if (logScale) {
      normalizedValue = valueToLogRatio(currentValue, min, max);
    } else {
      normalizedValue = (currentValue - min) / (max - min);
    }
    normalizedValue = Math.max(0, Math.min(1, normalizedValue)); // Clamp normalized value
    return MIN_ANGLE + normalizedValue * ANGLE_RANGE;
  }, [min, max, logScale]);

  useEffect(() => {
    setAngle(calculateAngle(value));
  }, [value, calculateAngle]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    if(knobRef.current) knobRef.current.focus();
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !knobRef.current || max === min) return;

    const deltaY = e.movementY;
    let newValue: number;

    if (logScale) {
        let currentRatio = valueToLogRatio(value, min, max);
        const logSensitivity = 0.00625; // Increased sensitivity (was ~0.0025)
        currentRatio -= deltaY * logSensitivity;
        currentRatio = Math.max(0, Math.min(1, currentRatio));
        newValue = logRatioToValue(currentRatio, min, max);
    } else {
        const valueRange = max - min;
        const linearSensitivity = 0.025; // Increased sensitivity (was 0.01)
        newValue = value - deltaY * (valueRange * linearSensitivity);
    }
    
    newValue = Math.max(min, Math.min(max, newValue));
    if (step) {
      // For log scales, stepping in linear domain of ratio might be more intuitive sometimes,
      // but stepping in value domain is more common.
      // Ensure that step application doesn't push value out of min/max due to floating point.
      newValue = Math.round(newValue / step) * step;
    }
    
    newValue = Math.max(min, Math.min(max, parseFloat(newValue.toFixed(10)))); // Clamp again after stepping & fix floating point


    if (newValue !== value) { // Check against original value before parseFloat precision fix
      // Only call onChange if the effective value (considering step) has changed
      let changedEnough = true;
      if (step) {
        const oldValueStepped = Math.round(value / step) * step;
        const newValueStepped = Math.round(newValue / step) * step;
        changedEnough = Math.abs(newValueStepped - oldValueStepped) >= step / 2; // Heuristic
      }
      if (changedEnough || Math.abs(newValue - value) > step / 1000) { // also ensure some minimal change if step is large
         onChange(newValue);
      }
    }
  }, [isDragging, value, min, max, step, onChange, logScale]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
    }
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);
  
  const formattedValue = () => {
    const absValue = Math.abs(value);

    if (logScale && value >= 1000 && value < 10000) return (value / 1000).toFixed(1) + 'k';
    if (absValue >= 10000) return value.toExponential(1);

    if (absValue > 0 && absValue < 1) {
      // For values like 0.001, 0.025, 0.150 - display with 3 decimal places
      // This directly avoids scientific notation like "2.0e-3s"
      return value.toFixed(3);
    }
    
    if (value === 0) return '0'; // Handle exactly 0

    if (Number.isInteger(value)) return value.toString();

    // General float formatting for other cases
    if (absValue < 10) return value.toFixed(2); 
    if (absValue < 100) return value.toFixed(1);
    
    return value.toString();
  };


  return (
    <div className="flex flex-col items-center select-none w-20" ref={knobRef} tabIndex={0} role="slider" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div
        className="w-12 h-12 bg-neutral-800 rounded-full relative cursor-ns-resize shadow-inner border-2 border-neutral-900"
        onMouseDown={handleMouseDown}
        title={`${label}: ${value.toFixed(4)}${unit} (min: ${min}, max: ${max})`} // More precise title
      >
        <div
          className="w-1 h-3 bg-orange-400 absolute top-1.5 left-1/2 -translate-x-1/2 origin-bottom shadow-sm rounded-t-sm shadow-[0_0_8px_rgba(251,146,60,0.8)]"
          style={{ transform: `translateX(-50%) translateY(2px) rotate(${angle}deg) `, transformOrigin: '50% 100%' }}
        />
      </div>
      <span className="mt-1 text-xs text-neutral-400 w-full text-center truncate" title={label}>{label}</span>
      <span className="text-sm text-orange-400 font-mono w-full text-center">{formattedValue()}{unit}</span>
    </div>
  );
};