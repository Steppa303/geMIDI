

import React, { useState, useEffect, useRef } from 'react';
import { type MidiDevice } from '../types';
import { PlayIcon } from './icons/PlayIcon';
import { PauseIcon } from './icons/PauseIcon';
import { LoopIcon } from './icons/LoopIcon';
import { DownloadIcon } from './icons/DownloadIcon';
import { UploadIcon } from './icons/UploadIcon';
import { ChevronUpIcon } from './icons/ChevronUpIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { MusicalNoteIcon } from './icons/MusicalNoteIcon';
import { SparklesIcon } from './icons/SparklesIcon'; 
import { ListBulletIcon } from './icons/ListBulletIcon'; 
import { Bars3Icon } from './icons/Bars3Icon';
import { MAX_BARS } from '../constants';
import { ToggleSwitch } from './ToggleSwitch';

const DEBOUNCE_DELAY = 400; // ms

interface HeaderProps {
  midiInputs: MidiDevice[];
  midiOutputs: MidiDevice[];
  selectedInputId: string | null;
  selectedOutputId: string | null;
  onInputSelect: (id: string) => void;
  onOutputSelect: (id: string) => void;
  isPlaying: boolean;
  onPlayToggle: () => void;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  isLooping: boolean;
  onLoopToggle: () => void;
  onDownloadAllPatterns: () => void;
  isPreviewMode: boolean; 
  onPreviewModeToggle: () => void; 
  isExternalClockActive: boolean; 
  masterPrompt: string;
  onMasterPromptChange: (prompt: string) => void;
  stylePrompt: string;
  onStylePromptChange: (prompt: string) => void;
  masterPromptBars: number;
  onMasterPromptBarsChange: (bars: number) => void;
  onGenerateAllFromMaster: () => void;
  isGeneratingAll: boolean; 
  onExportState: () => void;
  onImportState: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onGeneratePatternProgression: () => void;
  showMasterPrompt: boolean;
  onToggleMasterPrompt: (enabled: boolean) => void;
}

const ControlButton: React.FC<{ onClick?: () => void; children: React.ReactNode; className?: string; isActive?: boolean; title?: string, disabled?: boolean, "aria-haspopup"?: boolean, "aria-expanded"?: boolean }> = 
  ({ onClick, children, className, isActive, title, disabled, ...ariaProps }) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={`flex items-center justify-center px-4 py-2 rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-900 focus:ring-orange-500/70
                ${isActive ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'bg-white/10 hover:bg-white/20 text-neutral-200'}
                ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    {...ariaProps}
  >
    {children}
  </button>
);

export const Header: React.FC<HeaderProps> = ({
  midiInputs,
  midiOutputs,
  selectedInputId,
  selectedOutputId,
  onInputSelect,
  onOutputSelect,
  isPlaying,
  onPlayToggle,
  bpm,
  onBpmChange,
  isLooping,
  onLoopToggle,
  onDownloadAllPatterns,
  isPreviewMode,
  onPreviewModeToggle,
  isExternalClockActive,
  masterPrompt,
  onMasterPromptChange,
  stylePrompt,
  onStylePromptChange,
  masterPromptBars,
  onMasterPromptBarsChange,
  onGenerateAllFromMaster,
  isGeneratingAll,
  onExportState,
  onImportState,
  onGeneratePatternProgression,
  showMasterPrompt,
  onToggleMasterPrompt,
}) => {
  const [internalMasterPrompt, setInternalMasterPrompt] = useState(masterPrompt);
  const [internalStylePrompt, setInternalStylePrompt] = useState(stylePrompt);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuRef]);

  useEffect(() => {
    if (masterPrompt !== internalMasterPrompt) {
        setInternalMasterPrompt(masterPrompt);
    }
  }, [masterPrompt]);
  
  useEffect(() => {
    if (stylePrompt !== internalStylePrompt) {
        setInternalStylePrompt(stylePrompt);
    }
  }, [stylePrompt]);

  useEffect(() => {
    if (internalMasterPrompt !== masterPrompt) {
      const handler = setTimeout(() => {
        onMasterPromptChange(internalMasterPrompt);
      }, DEBOUNCE_DELAY);
      return () => clearTimeout(handler);
    }
  }, [internalMasterPrompt, masterPrompt, onMasterPromptChange]);
  
  useEffect(() => {
    if (internalStylePrompt !== stylePrompt) {
      const handler = setTimeout(() => {
        onStylePromptChange(internalStylePrompt);
      }, DEBOUNCE_DELAY);
      return () => clearTimeout(handler);
    }
  }, [internalStylePrompt, stylePrompt, onStylePromptChange]);


  const handleInternalMasterPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInternalMasterPrompt(e.target.value);
  };
  
  const handleInternalStylePromptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInternalStylePrompt(e.target.value);
  };

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isExternalClockActive) return;
    const newBpm = parseInt(e.target.value, 10);
    if (!isNaN(newBpm) && newBpm >= 20 && newBpm <= 300) {
      onBpmChange(newBpm);
    }
  };

  const incrementBpm = () => {
    if (isExternalClockActive) return;
    onBpmChange(Math.min(300, bpm + 1));
  }
  const decrementBpm = () => {
    if (isExternalClockActive) return;
    onBpmChange(Math.max(20, bpm - 1));
  }

  const handleMasterBarsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newBars = parseInt(e.target.value, 10);
    if (!isNaN(newBars)) {
      onMasterPromptBarsChange(newBars); 
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <header className="bg-neutral-800/30 backdrop-blur-lg border border-white/10 p-4 rounded-2xl shadow-2xl flex flex-col space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* MIDI Device Selectors */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            title="MIDI In Device"
            value={selectedInputId || ''}
            onChange={(e) => onInputSelect(e.target.value)}
            className="bg-white/10 border border-white/10 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-orange-500/50 focus:outline-none appearance-none"
          >
            <option value="" disabled>MIDI-In Device</option>
            {midiInputs.map(device => (
              <option key={device.id} value={device.id}>{device.name}</option>
            ))}
          </select>
          <select
            title="MIDI Out Device"
            value={selectedOutputId || ''}
            onChange={(e) => onOutputSelect(e.target.value)}
            className="bg-white/10 border border-white/10 text-white px-3 py-2 rounded-lg focus:ring-2 focus:ring-orange-500/50 focus:outline-none appearance-none"
            disabled={isPreviewMode}
          >
            <option value="" disabled>MIDI-Out Device</option>
            {midiOutputs.map(device => (
              <option key={device.id} value={device.id}>{device.name}</option>
            ))}
          </select>
        </div>

        {/* Transport and Mode Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <ControlButton onClick={onPlayToggle} title={isPlaying ? "Pause" : "Play"} isActive={isPlaying}>
            {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
          </ControlButton>
          
          <div className={`flex items-center bg-white/5 border border-white/10 rounded-lg ${isExternalClockActive ? 'opacity-70' : ''}`}>
            <span className="px-3 text-neutral-300">BPM</span>
            <input
              type="number" value={bpm} onChange={handleBpmChange} min="20" max="300" readOnly={isExternalClockActive}
              className={`w-20 bg-transparent text-white text-center font-bold text-lg p-2 focus:outline-none focus:ring-2 focus:ring-orange-500 appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isExternalClockActive ? 'cursor-not-allowed' : ''}`}
            />
            <div className="flex flex-col">
              <button onClick={incrementBpm} className={`p-1 hover:bg-white/10 rounded-tr-md focus:outline-none ${isExternalClockActive ? 'cursor-not-allowed opacity-50' : ''}`} aria-label="Increase BPM" disabled={isExternalClockActive}>
                <ChevronUpIcon className="w-4 h-4" />
              </button>
              <button onClick={decrementBpm} className={`p-1 hover:bg-white/10 rounded-br-md focus:outline-none ${isExternalClockActive ? 'cursor-not-allowed opacity-50' : ''}`} aria-label="Decrease BPM" disabled={isExternalClockActive}>
                <ChevronDownIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <ControlButton onClick={onPreviewModeToggle} isActive={isPreviewMode} title="Toggle Audio Preview">
            <MusicalNoteIcon className={`w-5 h-5 ${isPreviewMode ? '' : 'text-white'}`} />
            <span className="ml-2">Preview</span>
          </ControlButton>

          <ControlButton onClick={onLoopToggle} isActive={isLooping} title="Toggle Loop">
            <LoopIcon className={`w-5 h-5 ${isLooping ? '' : 'text-white'}`} />
            <span className="ml-2">Loop</span>
          </ControlButton>
          
          <div className="relative" ref={menuRef}>
            <ControlButton onClick={() => setIsMenuOpen(p => !p)} title="Menu" aria-haspopup={true} aria-expanded={isMenuOpen}>
              <Bars3Icon className="w-6 h-6" />
            </ControlButton>

            {isMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-neutral-800/80 backdrop-blur-md border border-white/10 rounded-lg shadow-lg z-50 p-2 flex flex-col space-y-1 ring-1 ring-black ring-opacity-5">
                <ControlButton onClick={() => { onDownloadAllPatterns(); setIsMenuOpen(false); }} title="Download All Patterns (MIDI)" className="!justify-start !w-full !bg-white/5 hover:!bg-white/15">
                  <DownloadIcon className="w-5 h-5 text-white" />
                  <span className="ml-2">Download All MIDI</span>
                </ControlButton>
                 <ControlButton onClick={() => { onExportState(); setIsMenuOpen(false); }} title="Export Current Session (JSON)" className="!justify-start !w-full !bg-white/5 hover:!bg-white/15">
                    <DownloadIcon className="w-5 h-5 text-white" />
                    <span className="ml-2">Export Session</span>
                  </ControlButton>
                  <ControlButton onClick={() => { handleImportClick(); setIsMenuOpen(false); }} title="Import Session (JSON)" className="!justify-start !w-full !bg-white/5 hover:!bg-white/15">
                    <UploadIcon className="w-5 h-5 text-white" />
                    <span className="ml-2">Import Session</span>
                  </ControlButton>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Progression & Master Prompt Controls */}
      <div className="flex flex-wrap items-center justify-start gap-4 pt-4 border-t border-white/10">
          <input
            type="file"
            ref={fileInputRef}
            accept=".json"
            style={{ display: 'none' }}
            onChange={onImportState}
            aria-hidden="true"
          />
          <div className="flex items-center space-x-2">
            <span className="text-sm font-semibold text-neutral-400">
              Pattern Progression
            </span>
            <button
              onClick={onGeneratePatternProgression}
              disabled={isGeneratingAll}
              title="Generate a pattern progression using AI (uses Master Prompt or individual track prompts)"
              className="flex items-center justify-center px-3 py-1 rounded-md font-medium text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-800 focus:ring-orange-500 bg-indigo-500 hover:bg-indigo-600 text-white disabled:bg-neutral-600 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <ListBulletIcon className="w-4 h-4" />
              <span className="ml-1.5">{isGeneratingAll ? 'Generating...' : 'Generate'}</span>
            </button>
          </div>
           <div className="flex items-center space-x-2">
              <label htmlFor="style-prompt" className="text-sm font-semibold text-neutral-400 whitespace-nowrap">Style / Genre</label>
              <input
                  type="text"
                  id="style-prompt"
                  value={internalStylePrompt}
                  onChange={handleInternalStylePromptChange}
                  placeholder="e.g., House, Ambient, Jazz"
                  className="px-2 py-1 bg-black/20 border border-white/10 text-neutral-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none placeholder-neutral-500 text-sm w-48"
                  title="Set a general style or genre to guide all AI generations"
              />
          </div>
          <ToggleSwitch 
            label="Use Master Prompt"
            enabled={showMasterPrompt}
            onChange={onToggleMasterPrompt}
          />
      </div>

      {/* Master Prompt Section (Conditional) */}
      {showMasterPrompt && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-4 border-t border-white/10">
          <textarea
            value={internalMasterPrompt}
            onChange={handleInternalMasterPromptChange}
            placeholder="Enter Master Prompt (e.g., 'Funky Disco Groove in A minor', 'Dark Ambient Drone', 'Psytrance Banger at 145 BPM in F# minor'). Used by 'Generate All' and optionally by 'Generate Pattern Progression'."
            className="flex-grow w-full sm:w-auto h-16 sm:h-auto p-2 bg-black/20 border border-white/10 text-neutral-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none placeholder-neutral-400 resize-y sm:resize-none text-sm"
            rows={2}
          />
          <div className="flex items-center space-x-2 bg-black/20 border border-white/10 p-2 rounded-lg">
              <label htmlFor="master-bars" className="text-sm text-neutral-300">Bars:</label>
              <input
                  type="number" id="master-bars" value={masterPromptBars} onChange={handleMasterBarsChange}
                  min="1" max={MAX_BARS}
                  className="w-16 bg-neutral-700/80 text-white p-1 rounded-md focus:ring-1 focus:ring-orange-500 focus:outline-none text-center appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  title={`Number of bars for 'Generate All' (1-${MAX_BARS})`}
              />
          </div>
          <ControlButton
            onClick={onGenerateAllFromMaster}
            disabled={isGeneratingAll || !masterPrompt.trim()}
            title="Generate all tracks based on the Master Prompt"
            className="!bg-gradient-to-r !from-purple-600 !to-fuchsia-600 hover:!from-purple-700 hover:!to-fuchsia-700 disabled:!from-neutral-600 disabled:!to-neutral-600 min-w-[200px]"
          >
            <SparklesIcon className="w-5 h-5" />
            <span className="ml-2">{isGeneratingAll ? 'Generating...' : 'Generate All Tracks'}</span>
          </ControlButton>
        </div>
      )}
    </header>
  );
};