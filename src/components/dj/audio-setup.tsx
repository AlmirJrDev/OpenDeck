import {
  AudioDeviceSelect,
  AudioDeviceSelectContent,
  AudioDeviceSelectTrigger,
  AudioDeviceSelectValue,
} from "@/components/ui/audio-device-select";
import { useEngine } from "@/engine/context";
import { useStore } from "@/engine/store";

import { useOutputDevices } from "./use-output-devices";

/** Master and headphone output pickers. */
export const AudioSetup = () => {
  const engine = useEngine();
  const { masterDevice, phonesDevice, deviceError } = useStore(engine);
  const { devices, loading, permission, requestPermission } = useOutputDevices();
  const shared = {
    devices,
    loading,
    onRequestPermission: () => void requestPermission(),
    permission,
  };

  return (
    <div className="flex items-center gap-3 text-xs">
      {deviceError && <span className="max-w-64 truncate text-destructive" title={deviceError}>{deviceError}</span>}
      <label className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.11em] text-text-tertiary uppercase">
        <span>Master</span>
        <AudioDeviceSelect
          {...shared}
          allowNone
          noneLabel="System default"
          onValueChange={(id) => void engine.setMasterDevice(id)}
          value={masterDevice}
        >
          <AudioDeviceSelectTrigger aria-label="Master output" className="h-8 w-52 rounded-none font-sans text-sm tracking-normal normal-case text-foreground">
            <AudioDeviceSelectValue placeholder="System default" />
          </AudioDeviceSelectTrigger>
          <AudioDeviceSelectContent />
        </AudioDeviceSelect>
      </label>
      <label className="flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.11em] text-text-tertiary uppercase">
        <span>Phones</span>
        <AudioDeviceSelect
          {...shared}
          allowNone
          noneLabel="Off"
          onValueChange={(id) => void engine.setPhonesDevice(id)}
          value={phonesDevice}
        >
          <AudioDeviceSelectTrigger aria-label="Headphone output" className="h-8 w-52 rounded-none font-sans text-sm tracking-normal normal-case text-foreground">
            <AudioDeviceSelectValue placeholder="Off" />
          </AudioDeviceSelectTrigger>
          <AudioDeviceSelectContent />
        </AudioDeviceSelect>
      </label>
    </div>
  );
};
