import React from 'react';
import { Knob } from './Knob';
import { type SupportedSynthType, type BasicSynthParams, type MonoSynthParams, type FMSynthParams, type PolySynthParams, OscillatorType, FilterType, FilterRollOff } from '../types';

interface SynthConfigEditorProps {
  activeSynthType: SupportedSynthType;
  paramsForActiveType: BasicSynthParams | MonoSynthParams | FMSynthParams | PolySynthParams; // Union of all possible param types
  onChangeSynthType: (newType: SupportedSynthType) => void;
  onUpdateSynthParam: (relativePath: string, value: any) => void;
  activeTab: "Oscillator" | "Filter" | "Envelopes";
}

const allSynthTypes: SupportedSynthType[] = ["BasicSynth", "MonoSynth", "FMSynth", "PolySynth"];
const oscillatorTypeOptions: OscillatorType[] = ["sine", "square", "sawtooth", "triangle", "pwm", "pulse"];
const filterTypeOptions: FilterType[] = ["lowpass", "highpass", "bandpass", "notch"];
const filterRollOffOptions: FilterRollOff[] = [-12, -24, -48, -96];


const ParameterGroup: React.FC<{title?: string; children: React.ReactNode; className?: string}> = ({title, children, className}) => (
    <div className={`mb-3 ${className}`}>
        {title && <h4 className="text-xs text-neutral-400 uppercase tracking-wider mb-1.5 text-center">{title}</h4>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-2 gap-y-3 justify-items-center bg-black/20 p-2.5 rounded-lg">
            {children}
        </div>
    </div>
);

const SelectControl: React.FC<{label: string, value: string | number, options: Array<string | number>, onChange: (value: string | number) => void, fullWidth?: boolean }> =
({label, value, options, onChange, fullWidth = false}) => (
    <div className={`flex flex-col items-center w-full ${fullWidth ? 'col-span-2 sm:col-span-4' : 'col-span-1'} mb-1`}>
        <label className="text-xs text-neutral-300 mb-0.5">{label}</label>
        <select
            value={value}
            onChange={(e) => onChange(typeof options[0] === 'number' ? parseFloat(e.target.value) : e.target.value)}
            className="bg-neutral-700 hover:bg-neutral-600 text-white p-1.5 rounded-md text-xs w-full focus:outline-none focus:ring-1 focus:ring-orange-500 border border-white/10"
        >
            {options.map(opt => <option key={opt} value={opt}>{typeof opt === 'string' ? opt.charAt(0).toUpperCase() + opt.slice(1) : opt}</option>)}
        </select>
    </div>
);


export const SynthConfigEditor: React.FC<SynthConfigEditorProps> = ({ 
    activeSynthType, paramsForActiveType, onChangeSynthType, onUpdateSynthParam, activeTab 
}) => {
  if (!paramsForActiveType) return <div className="text-neutral-400 p-4">Synth parameters not available for {activeSynthType}.</div>;

  const basicP = paramsForActiveType as BasicSynthParams;
  const monoP = paramsForActiveType as MonoSynthParams;
  const fmP = paramsForActiveType as FMSynthParams;
  const polyP = paramsForActiveType as PolySynthParams;

  return (
    <div className="bg-transparent p-2 rounded-md min-h-[220px] space-y-2">
      <ParameterGroup className="bg-black/20 p-2 rounded-lg">
        <SelectControl
            label="Synth Type"
            value={activeSynthType}
            options={allSynthTypes}
            onChange={(val) => onChangeSynthType(val as SupportedSynthType)}
            fullWidth={true}
        />
      </ParameterGroup>

      {activeTab === "Oscillator" && (
        <>
          {activeSynthType === "BasicSynth" && (
            <ParameterGroup title="Oscillator (Basic)">
              <SelectControl label="Type" value={basicP.oscillator.type} options={oscillatorTypeOptions} onChange={val => onUpdateSynthParam('oscillator.type', val as OscillatorType)} />
              <Knob label="Detune" value={basicP.oscillator.detune} min={-100} max={100} step={1} unit="c" onChange={val => onUpdateSynthParam('oscillator.detune', val)} />
            </ParameterGroup>
          )}
          {activeSynthType === "MonoSynth" && (
            <ParameterGroup title="Oscillator (Mono)">
              <SelectControl label="Type" value={monoP.oscillatorType} options={oscillatorTypeOptions} onChange={val => onUpdateSynthParam('oscillatorType', val as OscillatorType)} />
              <Knob label="Detune" value={monoP.detune} min={-1200} max={1200} step={1} unit="c" onChange={val => onUpdateSynthParam('detune', val)} />
              <Knob label="Portamento" value={monoP.portamento} min={0} max={1} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('portamento', val)} />
            </ParameterGroup>
          )}
          {activeSynthType === "FMSynth" && (
            <>
            <ParameterGroup title="FM Synthesis Core">
                <Knob label="Harmonicity" value={fmP.harmonicity} min={0.1} max={20} step={0.01} logScale onChange={val => onUpdateSynthParam('harmonicity', val)} />
                <Knob label="Mod Index" value={fmP.modulationIndex} min={0.1} max={100} step={0.1} logScale onChange={val => onUpdateSynthParam('modulationIndex', val)} />
                <Knob label="Detune" value={fmP.detune} min={-1200} max={1200} step={1} unit="c" onChange={val => onUpdateSynthParam('detune', val)} />
            </ParameterGroup>
            <ParameterGroup title="Carrier Oscillator">
                 <SelectControl label="Carrier Type" value={fmP.carrier.type} options={oscillatorTypeOptions} onChange={val => onUpdateSynthParam('carrier.type', val as OscillatorType)} />
            </ParameterGroup>
            <ParameterGroup title="Modulator Oscillator">
                 <SelectControl label="Modulator Type" value={fmP.modulator.type} options={oscillatorTypeOptions} onChange={val => onUpdateSynthParam('modulator.type', val as OscillatorType)} />
            </ParameterGroup>
            </>
          )}
          {activeSynthType === "PolySynth" && (
             <ParameterGroup title="Oscillator (Poly Voices)">
                <Knob label="Voices" value={polyP.polyphony} min={1} max={16} step={1} onChange={val => onUpdateSynthParam('polyphony', val)} />
                <Knob label="Detune (Global)" value={polyP.detune} min={-100} max={100} step={1} unit="c" onChange={val => onUpdateSynthParam('detune', val)} />
                <SelectControl label="Voice Osc Type" value={polyP.oscillator.type} options={oscillatorTypeOptions} onChange={val => onUpdateSynthParam('oscillator.type', val as OscillatorType)} />
             </ParameterGroup>
          )}
        </>
      )}

      {activeTab === "Filter" && (
        <>
          {activeSynthType === "BasicSynth" && (
            <ParameterGroup title="Filter (Basic)">
              <SelectControl label="Type" value={basicP.filter.type} options={filterTypeOptions} onChange={val => onUpdateSynthParam('filter.type', val as FilterType)} />
              <Knob label="Frequency" value={basicP.filter.frequency} min={20} max={20000} step={1} unit="Hz" logScale onChange={val => onUpdateSynthParam('filter.frequency', val)} />
              <Knob label="Q" value={basicP.filter.Q} min={0.1} max={20} step={0.1} onChange={val => onUpdateSynthParam('filter.Q', val)} />
            </ParameterGroup>
          )}
          {activeSynthType === "MonoSynth" && (
            <ParameterGroup title="Filter (Mono)">
              <SelectControl label="Type" value={monoP.filter.type} options={filterTypeOptions} onChange={val => onUpdateSynthParam('filter.type', val as FilterType)} />
              <SelectControl label="Rolloff" value={monoP.filter.rolloff} options={filterRollOffOptions} onChange={val => onUpdateSynthParam('filter.rolloff', val as FilterRollOff)} />
              <Knob label="Cutoff" value={monoP.filterEnvelope.baseFrequency} min={20} max={20000} step={1} unit="Hz" logScale onChange={val => onUpdateSynthParam('filterEnvelope.baseFrequency', val)} />
              <Knob label="Q" value={monoP.filter.Q} min={0.1} max={20} step={0.1} onChange={val => onUpdateSynthParam('filter.Q', val)} />
              <Knob label="Env Amt (Oct)" value={monoP.filterEnvelope.octaves} min={-7} max={7} step={0.1} unit="oct" onChange={val => onUpdateSynthParam('filterEnvelope.octaves', val)} />
            </ParameterGroup>
          )}
           {activeSynthType === "PolySynth" && (
            <ParameterGroup title="Filter (Poly Voices)">
              <SelectControl label="Voice Filter Type" value={polyP.filter.type} options={filterTypeOptions} onChange={val => onUpdateSynthParam('filter.type', val as FilterType)} />
              <SelectControl label="Voice Filt Rolloff" value={polyP.filter.rolloff} options={filterRollOffOptions} onChange={val => onUpdateSynthParam('filter.rolloff', val as FilterRollOff)} />
              <Knob label="Voice Filt Cutoff" value={polyP.filterEnvelope.baseFrequency} min={20} max={20000} step={1} unit="Hz" logScale onChange={val => onUpdateSynthParam('filterEnvelope.baseFrequency', val)} />
              <Knob label="Voice Filter Q" value={polyP.filter.Q} min={0.1} max={20} step={0.1} onChange={val => onUpdateSynthParam('filter.Q', val)} />
              <Knob label="Voice Filt Env Amt" value={polyP.filterEnvelope.octaves} min={-7} max={7} step={0.1} unit="oct" onChange={val => onUpdateSynthParam('filterEnvelope.octaves', val)} />
            </ParameterGroup>
          )}
          {activeSynthType === "FMSynth" && <div className="text-neutral-400 text-center p-4 text-sm">FMSynth does not have a dedicated filter section. Use an external filter effect if needed.</div>}
        </>
      )}

      {activeTab === "Envelopes" && (
        <>
          {activeSynthType === "BasicSynth" && (
            <>
            <ParameterGroup title="Amplitude Env (Basic)">
              <Knob label="Attack" value={basicP.amplitudeEnvelope.attack} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('amplitudeEnvelope.attack', val)} />
              <Knob label="Decay" value={basicP.amplitudeEnvelope.decay} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('amplitudeEnvelope.decay', val)} />
              <Knob label="Sustain" value={basicP.amplitudeEnvelope.sustain} min={0} max={1} step={0.01} onChange={val => onUpdateSynthParam('amplitudeEnvelope.sustain', val)} />
              <Knob label="Release" value={basicP.amplitudeEnvelope.release} min={0.001} max={5} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('amplitudeEnvelope.release', val)} />
            </ParameterGroup>
            <ParameterGroup title="Filter Env (Basic)">
              <Knob label="Attack" value={basicP.filterEnvelope.attack} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('filterEnvelope.attack', val)} />
              <Knob label="Decay" value={basicP.filterEnvelope.decay} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('filterEnvelope.decay', val)} />
              <Knob label="Sustain" value={basicP.filterEnvelope.sustain} min={0} max={1} step={0.01} onChange={val => onUpdateSynthParam('filterEnvelope.sustain', val)} />
              <Knob label="Release" value={basicP.filterEnvelope.release} min={0.001} max={5} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('filterEnvelope.release', val)} />
              <Knob label="Base Freq" value={basicP.filterEnvelope.baseFrequency} min={20} max={20000} unit="Hz" logScale onChange={val => onUpdateSynthParam('filterEnvelope.baseFrequency', val)} />
              <Knob label="Octaves" value={basicP.filterEnvelope.octaves} min={0} max={7} step={0.1} unit="oct" onChange={val => onUpdateSynthParam('filterEnvelope.octaves', val)} />
            </ParameterGroup>
            </>
          )}
          {activeSynthType === "MonoSynth" && (
            <>
            <ParameterGroup title="Amplitude Env (Mono)">
              <Knob label="Attack" value={monoP.amplitudeEnvelope.attack} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('amplitudeEnvelope.attack', val)} />
              <Knob label="Decay" value={monoP.amplitudeEnvelope.decay} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('amplitudeEnvelope.decay', val)} />
              <Knob label="Sustain" value={monoP.amplitudeEnvelope.sustain} min={0} max={1} step={0.01} onChange={val => onUpdateSynthParam('amplitudeEnvelope.sustain', val)} />
              <Knob label="Release" value={monoP.amplitudeEnvelope.release} min={0.001} max={5} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('amplitudeEnvelope.release', val)} />
            </ParameterGroup>
            <ParameterGroup title="Filter Env (Mono)">
              <Knob label="Attack" value={monoP.filterEnvelope.attack} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('filterEnvelope.attack', val)} />
              <Knob label="Decay" value={monoP.filterEnvelope.decay} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('filterEnvelope.decay', val)} />
              <Knob label="Sustain" value={monoP.filterEnvelope.sustain} min={0} max={1} step={0.01} onChange={val => onUpdateSynthParam('filterEnvelope.sustain', val)} />
              <Knob label="Release" value={monoP.filterEnvelope.release} min={0.001} max={5} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('filterEnvelope.release', val)} />
              <Knob label="Exponent" value={monoP.filterEnvelope.exponent} min={0.1} max={8} step={0.1} logScale onChange={val => onUpdateSynthParam('filterEnvelope.exponent', val)} />
            </ParameterGroup>
            </>
          )}
          {activeSynthType === "FMSynth" && (
            <>
            <ParameterGroup title="Carrier Amp Env (FM)">
              <Knob label="Attack" value={fmP.carrier.envelope.attack} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('carrier.envelope.attack', val)} />
              <Knob label="Decay" value={fmP.carrier.envelope.decay} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('carrier.envelope.decay', val)} />
              <Knob label="Sustain" value={fmP.carrier.envelope.sustain} min={0} max={1} step={0.01} onChange={val => onUpdateSynthParam('carrier.envelope.sustain', val)} />
              <Knob label="Release" value={fmP.carrier.envelope.release} min={0.001} max={5} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('carrier.envelope.release', val)} />
            </ParameterGroup>
            <ParameterGroup title="Modulator Amp Env (FM)">
              <Knob label="Attack" value={fmP.modulator.envelope.attack} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('modulator.envelope.attack', val)} />
              <Knob label="Decay" value={fmP.modulator.envelope.decay} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('modulator.envelope.decay', val)} />
              <Knob label="Sustain" value={fmP.modulator.envelope.sustain} min={0} max={1} step={0.01} onChange={val => onUpdateSynthParam('modulator.envelope.sustain', val)} />
              <Knob label="Release" value={fmP.modulator.envelope.release} min={0.001} max={5} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('modulator.envelope.release', val)} />
            </ParameterGroup>
            </>
          )}
          {activeSynthType === "PolySynth" && (
            <>
            <ParameterGroup title="Amp Env (Poly Voices)">
              <Knob label="Attack" value={polyP.amplitudeEnvelope.attack} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('amplitudeEnvelope.attack', val)} />
              <Knob label="Decay" value={polyP.amplitudeEnvelope.decay} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('amplitudeEnvelope.decay', val)} />
              <Knob label="Sustain" value={polyP.amplitudeEnvelope.sustain} min={0} max={1} step={0.01} onChange={val => onUpdateSynthParam('amplitudeEnvelope.sustain', val)} />
              <Knob label="Release" value={polyP.amplitudeEnvelope.release} min={0.001} max={5} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('amplitudeEnvelope.release', val)} />
            </ParameterGroup>
            <ParameterGroup title="Filter Env (Poly Voices)">
              <Knob label="Attack" value={polyP.filterEnvelope.attack} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('filterEnvelope.attack', val)} />
              <Knob label="Decay" value={polyP.filterEnvelope.decay} min={0.001} max={2} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('filterEnvelope.decay', val)} />
              <Knob label="Sustain" value={polyP.filterEnvelope.sustain} min={0} max={1} step={0.01} onChange={val => onUpdateSynthParam('filterEnvelope.sustain', val)} />
              <Knob label="Release" value={polyP.filterEnvelope.release} min={0.001} max={5} step={0.001} unit="s" logScale onChange={val => onUpdateSynthParam('filterEnvelope.release', val)} />
              {/* <Knob label="Base Freq" value={polyP.filterEnvelope.baseFrequency} min={20} max={20000} unit="Hz" logScale onChange={val => onUpdateSynthParam('filterEnvelope.baseFrequency', val)} /> */}
              {/* <Knob label="Octaves" value={polyP.filterEnvelope.octaves} min={-7} max={7} step={0.1} unit="oct" onChange={val => onUpdateSynthParam('filterEnvelope.octaves', val)} /> */}
              <Knob label="Exponent" value={polyP.filterEnvelope.exponent} min={0.1} max={8} step={0.1} logScale onChange={val => onUpdateSynthParam('filterEnvelope.exponent', val)} />
            </ParameterGroup>
            </>
          )}
        </>
      )}
    </div>
  );
};