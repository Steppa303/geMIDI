
import React from 'react';
import { MIDI_CHANNELS } from '../constants';
import { ChevronUpIcon } from './icons/ChevronUpIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';

interface MidiChannelSelectorProps {
  channel: number;
  onChange: (channel: number) => void;
}

export const MidiChannelSelector: React.FC<MidiChannelSelectorProps> = ({ channel, onChange }) => {
  const handleChange = (increment: number) => {
    let newChannel = channel + increment;
    if (newChannel < 1) newChannel = 16;
    if (newChannel > 16) newChannel = 1;
    onChange(newChannel);
  };

  return (
    <div className="flex items-center bg-black/20 rounded-md border border-white/10">
      <input
        type="number"
        value={channel}
        readOnly // Prevent direct typing, use buttons
        className="w-10 bg-transparent text-white text-center font-bold p-1 focus:outline-none appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <div className="flex flex-col">
        <button 
            onClick={() => handleChange(1)} 
            className="p-0.5 hover:bg-white/10 rounded-tr-sm focus:outline-none"
            aria-label="Increase MIDI channel"
        >
          <ChevronUpIcon className="w-3 h-3" />
        </button>
        <button 
            onClick={() => handleChange(-1)} 
            className="p-0.5 hover:bg-white/10 rounded-br-sm focus:outline-none"
            aria-label="Decrease MIDI channel"
        >
          <ChevronDownIcon className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};