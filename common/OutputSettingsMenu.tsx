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
  onChange: (settings: OutputSettings) => void;
}

const generateResolutionOptions = (aspectRatio: number) => {
  const standardHeights = [240, 360, 480, 720, 1080];
  const options: { label: string; width: number; height: number }[] = [];
  standardHeights.forEach(h => {
    const w = Math.round((h * aspectRatio) / 2) * 2;
    options.push({ label: `${w}x${h}`, width: w, height: h });
  });
  return options;
};

export function OutputSettingsMenu({
  aspectRatio,
  onChange,
}: OutputSettingsMenuProps) {
  const [resolutions, setResolutions] = useState<
    { label: string; width: number; height: number }[]
  >([]);
  const [settings, setSettings] = useState<OutputSettings>({
    resolution: '',
    framerate: 24,
    bitrate: 2000,
    audioMono: false,
  });

  useEffect(() => {
    const options = generateResolutionOptions(aspectRatio);
    setResolutions(options);
    const defaultResolution = options[options.length - 1]?.label || '';
    const initialSettings: OutputSettings = {
      resolution: defaultResolution,
      framerate: 24,
      bitrate: 2000,
      audioMono: false,
    };
    setSettings(initialSettings);
    onChange(initialSettings);
  }, [aspectRatio, onChange]);

  const handleSettingChange = (
    key: keyof OutputSettings,
    value: string | number | boolean
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    onChange(newSettings);
  };

  return (
    <div className="space-y-4 mt-6">
      <h3 className="text-lg font-semibold">Output Settings</h3>

      <div className="space-y-2">
        <Label htmlFor="resolution">Resolution</Label>
        <Select
          value={settings.resolution}
          onValueChange={value => handleSettingChange('resolution', value)}
        >
          <SelectTrigger id="resolution">
            <SelectValue placeholder="Select resolution" />
          </SelectTrigger>
          <SelectContent>
            {resolutions.map(res => (
              <SelectItem key={res.label} value={res.label}>
                {res.label} ({res.height}p)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            <SelectItem value="15">15 fps</SelectItem>
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
          placeholder="e.g., 2000"
        />
      </div>

      {/* Always show audio options - let FFmpeg determine if audio exists */}
      <div className="flex items-center space-x-2 pt-2">
        <Checkbox
          id="audioMono"
          checked={settings.audioMono}
          onCheckedChange={checked =>
            handleSettingChange('audioMono', !!checked)
          }
        />
        <Label htmlFor="audioMono">Convert Audio to Mono (if present)</Label>
      </div>
    </div>
  );
}
