"use client";

import { Clock, Calendar, Infinity as InfinityIcon } from "lucide-react";

export type AccessTimeMode = "preset" | "duration" | "exact" | "permanent";
export type DurationUnit = "minutes" | "hours" | "days";

export interface CustomTimeConfig {
  mode: AccessTimeMode;
  presetMinutes: number;
  amount: number;
  unit: DurationUnit;
  exactLocal: string;
}

const PRESET_OPTIONS: Array<{ label: string; minutes: number }> = [
  { label: "15 Mins", minutes: 15 },
  { label: "30 Mins", minutes: 30 },
  { label: "1 Hour", minutes: 60 },
  { label: "6 Hours", minutes: 360 },
  { label: "24 Hours", minutes: 1440 },
  { label: "7 Days", minutes: 10080 },
  { label: "30 Days", minutes: 43200 },
];

export function getDefaultLocalDateTime(hoursAhead = 24): string {
  const target = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
}

export function createInitialTimeConfig(
  allowPermanent: boolean,
  defaultMinutes = 1440
): CustomTimeConfig {
  return {
    mode: allowPermanent ? "permanent" : "preset",
    presetMinutes: defaultMinutes,
    amount: 2,
    unit: "hours",
    exactLocal: getDefaultLocalDateTime(24),
  };
}

export function configFromExistingExpiry(expiresAt: string | null): CustomTimeConfig {
  if (!expiresAt) {
    return createInitialTimeConfig(true);
  }
  const d = new Date(expiresAt);
  if (isNaN(d.getTime())) {
    return createInitialTimeConfig(true);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const exactLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return {
    mode: "exact",
    presetMinutes: 1440,
    amount: 24,
    unit: "hours",
    exactLocal,
  };
}

export function resolveCustomTime(config: CustomTimeConfig): {
  expiresAt: string | null;
  expiresAtHours: number | null;
  error?: string;
  summary: string;
} {
  if (config.mode === "permanent") {
    return {
      expiresAt: null,
      expiresAtHours: null,
      summary: "Permanent access (never expires unless revoked)",
    };
  }

  if (config.mode === "preset") {
    const mins = config.presetMinutes || 1440;
    const target = new Date(Date.now() + mins * 60 * 1000);
    return {
      expiresAt: target.toISOString(),
      expiresAtHours: mins / 60,
      summary: `Expires on ${target.toLocaleString()}`,
    };
  }

  if (config.mode === "duration") {
    const val = Number(config.amount);
    if (!Number.isFinite(val) || val <= 0) {
      return {
        expiresAt: null,
        expiresAtHours: null,
        error: "Please enter a valid duration greater than 0.",
        summary: "Invalid duration",
      };
    }
    const multiplier =
      config.unit === "minutes" ? 1 : config.unit === "hours" ? 60 : 1440;
    const totalMinutes = val * multiplier;
    const target = new Date(Date.now() + totalMinutes * 60 * 1000);
    return {
      expiresAt: target.toISOString(),
      expiresAtHours: totalMinutes / 60,
      summary: `Expires in ${val} ${config.unit} (${target.toLocaleString()})`,
    };
  }

  if (!config.exactLocal) {
    return {
      expiresAt: null,
      expiresAtHours: null,
      error: "Please select an expiration date and time.",
      summary: "No date selected",
    };
  }

  const parsed = new Date(config.exactLocal);
  if (isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
    return {
      expiresAt: null,
      expiresAtHours: null,
      error: "Expiration date and time must be in the future.",
      summary: "Must be a future date & time",
    };
  }

  return {
    expiresAt: parsed.toISOString(),
    expiresAtHours: (parsed.getTime() - Date.now()) / (60 * 60 * 1000),
    summary: `Expires on ${parsed.toLocaleString()}`,
  };
}

interface AccessTimeSelectorProps {
  value: CustomTimeConfig;
  onChange: (next: CustomTimeConfig) => void;
  allowPermanent?: boolean;
  label?: string;
}

export default function AccessTimeSelector({
  value,
  onChange,
  allowPermanent = true,
  label = "Access Duration & Expiry Time",
}: AccessTimeSelectorProps) {
  const resolved = resolveCustomTime(value);

  return (
    <div className="space-y-2.5 p-3 rounded-xl bg-[#F4F3EE]/80 border border-[#D9DED8]">
      <label className="block text-xs font-semibold text-[#202923] uppercase tracking-wider">
        {label}
      </label>

      {/* Mode Switcher */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange({ ...value, mode: "preset" })}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
            value.mode === "preset"
              ? "bg-[#183A35] text-white border-[#183A35]"
              : "bg-white text-[#202923] border-[#D9DED8] hover:border-[#477B70]"
          }`}
        >
          Quick Presets
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, mode: "duration" })}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1 ${
            value.mode === "duration"
              ? "bg-[#183A35] text-white border-[#183A35]"
              : "bg-white text-[#202923] border-[#D9DED8] hover:border-[#477B70]"
          }`}
        >
          <Clock className="w-3 h-3" /> Custom Time
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...value,
              mode: "exact",
              exactLocal: value.exactLocal || getDefaultLocalDateTime(24),
            })
          }
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1 ${
            value.mode === "exact"
              ? "bg-[#183A35] text-white border-[#183A35]"
              : "bg-white text-[#202923] border-[#D9DED8] hover:border-[#477B70]"
          }`}
        >
          <Calendar className="w-3 h-3" /> Exact Date & Time
        </button>
        {allowPermanent && (
          <button
            type="button"
            onClick={() => onChange({ ...value, mode: "permanent" })}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1 ${
              value.mode === "permanent"
                ? "bg-[#183A35] text-white border-[#183A35]"
                : "bg-white text-[#202923] border-[#D9DED8] hover:border-[#477B70]"
            }`}
          >
            <InfinityIcon className="w-3 h-3" /> Permanent
          </button>
        )}
      </div>

      {/* Mode 1: Quick Presets */}
      {value.mode === "preset" && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.minutes}
              type="button"
              onClick={() =>
                onChange({ ...value, mode: "preset", presetMinutes: opt.minutes })
              }
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                value.presetMinutes === opt.minutes
                  ? "bg-[#EAF1EE] text-[#183A35] border-[#477B70] font-semibold"
                  : "bg-white text-[#68736B] border-[#D9DED8] hover:text-[#202923]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Mode 2: Custom Amount + Unit */}
      {value.mode === "duration" && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <input
            type="number"
            min={1}
            step={1}
            className="input-field text-xs bg-white"
            placeholder="Enter number (e.g. 45)"
            value={value.amount || ""}
            onChange={(e) =>
              onChange({
                ...value,
                mode: "duration",
                amount: Math.max(0, Number(e.target.value)),
              })
            }
          />
          <select
            className="select-field text-xs bg-white"
            value={value.unit}
            onChange={(e) =>
              onChange({
                ...value,
                mode: "duration",
                unit: e.target.value as DurationUnit,
              })
            }
          >
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </div>
      )}

      {/* Mode 3: Exact Date & Time Picker */}
      {value.mode === "exact" && (
        <div className="pt-1">
          <input
            type="datetime-local"
            className="input-field text-xs bg-white"
            value={value.exactLocal}
            onChange={(e) =>
              onChange({ ...value, mode: "exact", exactLocal: e.target.value })
            }
          />
        </div>
      )}

      {/* Live Preview */}
      <p
        className={`text-[11px] flex items-center gap-1.5 pt-0.5 ${
          resolved.error ? "text-rose-600 font-medium" : "text-[#477B70]"
        }`}
      >
        <Clock className="w-3 h-3 shrink-0" />
        <span>{resolved.error || resolved.summary}</span>
      </p>
    </div>
  );
}
