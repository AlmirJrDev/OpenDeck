import { useCallback, useEffect, useState } from "react";

import type { AudioDevice } from "@/components/ui/audio-device-select";

type Permission = "granted" | "prompt" | "denied";

/** Audio output devices, with labels once the browser allows them. */
export const useOutputDevices = () => {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(() => Boolean(navigator.mediaDevices?.enumerateDevices));
  const [permission, setPermission] = useState<Permission>("granted");

  const refresh = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    const outputs = all.filter(
      (d) => d.kind === "audiooutput" && d.deviceId !== "default" && d.deviceId !== "communications"
    );
    // Browsers hide labels until the page has had media permission.
    setPermission(outputs.length > 0 && outputs.every((d) => !d.label) ? "prompt" : "granted");
    setDevices(
      outputs.map((d, i) => ({
        id: d.deviceId,
        label: d.label || `Output ${i + 1}`,
      }))
    );
    setLoading(false);
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
      await refresh();
    } catch {
      setPermission("denied");
    }
  }, [refresh]);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    void refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, [refresh]);

  return { devices, loading, permission, requestPermission };
};
