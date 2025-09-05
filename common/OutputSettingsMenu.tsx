'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface OutputSettings {
  resolution: string;
  framerate: number;
  bitrate: number;
  audioMono: boolean;
}

interface OutputSettingsMenuProps {
  aspectRatio: number;
  inputWidth: number; // NEW: Need input dimensions
  inputHeight: number; // NEW: Need input dimensions
  onChange: (settings: OutputSettings) => void;
}

interface ResolutionOption {
  label: string;
  width: number;
  height: number;
  bitrate: number; // NEW: Auto-suggested bitrate
}

const generateResolutionOptions = (
  aspectRatio: number,
  inputWidth: number,
  inputHeight: number
): ResolutionOption[] => {
  const standardHeights = [240, 360, 480, 720, 1080];
  const options: ResolutionOption[] = [];

  standardHeights.forEach(h => {
    const w = Math.round((h * aspectRatio) / 2) * 2; // Ensure even width

    // ✅ ONLY INCLUDE if it's downscaling or same size (no upscaling)
    if (h <= inputHeight && w <= inputWidth) {
      // ✅ AUTO-MATCH bitrate based on resolution height
      let suggestedBitrate: number;
      if (h <= 360) {
        suggestedBitrate = 800;
      } else if (h <= 480) {
        suggestedBitrate = 1200;
      } else if (h <= 720) {
        suggestedBitrate = 2500;
      } else {
        suggestedBitrate = 4500; // 1080p
      }

      options.push({
        label: `${w}x${h}`,
        width: w,
        height: h,
        bitrate: suggestedBitrate,
      });
    }
  });

  return options;
};

export function OutputSettingsMenu({
  aspectRatio,
  inputWidth,
  inputHeight,
  onChange,
}: OutputSettingsMenuProps) {
  const [resolutions, setResolutions] = useState<ResolutionOption[]>([]);
  const [settings, setSettings] = useState<OutputSettings>({
    resolution: '',
    framerate: 24,
    bitrate: 2000,
    audioMono: false,
  });

  useEffect(() => {
    const options = generateResolutionOptions(
      aspectRatio,
      inputWidth,
      inputHeight
    );
    setResolutions(options);

    // Default to highest available resolution (but still downscaling)
    const defaultResolution = options[options.length - 1];
    if (defaultResolution) {
      const initialSettings: OutputSettings = {
        resolution: defaultResolution.label,
        framerate: 20,
        bitrate: defaultResolution.bitrate, // ✅ AUTO-SET bitrate
        audioMono: false,
      };
      setSettings(initialSettings);
      onChange(initialSettings);
    }
  }, [aspectRatio, inputWidth, inputHeight, onChange]);

  const handleSettingChange = (
    key: keyof OutputSettings,
    value: string | number | boolean
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    onChange(newSettings);
  };

  const handleResolutionChange = (resolutionLabel: string) => {
    // ✅ AUTO-UPDATE bitrate when resolution changes
    const selectedRes = resolutions.find(r => r.label === resolutionLabel);
    if (selectedRes) {
      const newSettings = {
        ...settings,
        resolution: resolutionLabel,
        bitrate: selectedRes.bitrate, // Auto-set matching bitrate
      };
      setSettings(newSettings);
      onChange(newSettings);
    }
  };

  console.log('***test');

  return (
    <div className="space-y-4 mt-6">
      <h3 className="text-lg font-semibold">Output Settings</h3>

      <div className="space-y-2">
        <Label htmlFor="resolution">Resolution (Downscaling Only)</Label>
        <Select
          value={settings.resolution}
          onValueChange={handleResolutionChange}
        >
          <SelectTrigger id="resolution">
            <SelectValue placeholder="Select resolution" />
          </SelectTrigger>
          <SelectContent>
            {resolutions.map(res => (
              <SelectItem key={res.label} value={res.label}>
                {res.label} ({res.height}p) - {res.bitrate}k bitrate
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {resolutions.length === 0 && (
          <p className="text-sm text-slate-500">
            No downscaling options available (input resolution too small)
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="framerate">Framerate (fps)</Label>
        <Select
          value={String(settings.framerate)}
          onValueChange={value =>
            handleSettingChange('framerate', parseInt(value, 10))
          }
        >
          <SelectTrigger id="framerate">
            <SelectValue placeholder="Select framerate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="16">16 fps</SelectItem>
            <SelectItem value="18">18 fps</SelectItem>
            <SelectItem value="20">20 fps</SelectItem>
            <SelectItem value="22">22 fps</SelectItem>
            <SelectItem value="24">24 fps</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bitrate">Video Bitrate (kbps)</Label>
        <Input
          id="bitrate"
          type="number"
          value={settings.bitrate}
          onChange={e =>
            handleSettingChange('bitrate', parseInt(e.target.value, 10) || 0)
          }
          placeholder="Auto-set based on resolution"
        />
        <p className="text-xs text-slate-500">
          Bitrate auto-updates when resolution changes, but you can override it
        </p>
      </div>

      <div className="flex items-center space-x-2 pt-2">
        <Checkbox
          id="audioMono"
          checked={settings.audioMono}
          onCheckedChange={checked =>
            handleSettingChange('audioMono', !!checked)
          }
        />
        <Label className="pl-2" htmlFor="audioMono">
          Convert Audio to Mono
        </Label>
      </div>
    </div>
  );
}
