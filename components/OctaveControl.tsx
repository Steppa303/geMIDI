
import React from 'react';
import { ChevronUpIcon } from './icons/ChevronUpIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';

interface OctaveControlProps {
  currentShift: number;
  onShiftChange: (newShift: number) => void;
}

const MIN_OCTAVE_SHIFT = -2; // Keep in sync with App.tsx or pass as props if dynamic
const MAX_OCTAVE_SHIFT = 2; // Keep in sync

export const OctaveControl: React.FC<OctaveControlProps> = ({ currentShift, onShiftChange }) => {
  const handleIncrement = () => {
    if (currentShift < MAX_OCTAVE_SHIFT) {
      onShiftChange(currentShift + 1);
    }
  };

  const handleDecrement = () => {
    if (currentShift > MIN_OCTAVE_SHIFT) {
      onShiftChange(currentShift - 1);
    }
  };

  const displayShift = currentShift > 0 ? `+${currentShift}` : `${currentShift}`;

  return (
    <div className="flex items-center bg-black/20 rounded-md border border-white/10">
      <input
        type="text" // Changed from number to text to display "+1" etc.
        value={displayShift}
        readOnly
        className="w-10 bg-transparent text-white text-center font-bold p-1 focus:outline-none"
        aria-label={`Current octave shift: ${displayShift}`}
      />
      <div className="flex flex-col">
        <button 
            onClick={handleIncrement} 
            disabled={currentShift >= MAX_OCTAVE_SHIFT}
            className="p-0.5 hover:bg-white/10 rounded-tr-sm focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Increase octave shift"
        >
          <ChevronUpIcon className="w-3 h-3" />
        </button>
        <button 
            onClick={handleDecrement} 
            disabled={currentShift <= MIN_OCTAVE_SHIFT}
            className="p-0.5 hover:bg-white/10 rounded-br-sm focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Decrease octave shift"
        >
          <ChevronDownIcon className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};