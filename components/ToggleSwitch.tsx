
import React from 'react';

interface ToggleSwitchProps {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ label, enabled, onChange, disabled }) => {
  return (
    <div className="flex items-center space-x-2">
      <span className={`text-sm font-semibold transition-colors ${enabled ? 'text-orange-400' : 'text-neutral-400'}`}>
        {label}
      </span>
      <button
        onClick={() => onChange(!enabled)}
        disabled={disabled}
        role="switch"
        aria-checked={enabled}
        title={`Toggle ${label}`}
        className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-700 focus:ring-orange-500
          ${enabled ? 'bg-orange-500' : 'bg-neutral-500'}
          ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block w-3.5 h-3.5 transform bg-white rounded-full transition-transform
            ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
};
