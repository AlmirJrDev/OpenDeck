import { useState, type FormEvent } from "react";

import { useCloud } from "@/cloud/context";
import { useEngine } from "@/engine/context";
import { useStore } from "@/engine/store";
import { cn } from "@/lib/utils";

import { Pad } from "./pad";
import { CAPTION } from "./theme";

const FIELD =
  "h-8 w-56 border border-pad-outline bg-background px-2 text-sm text-foreground placeholder:text-text-tertiary hover:border-foreground";

/** Cloud library row: sign-in, then upload and download with progress. */
export const CloudBar = () => {
  const cloud = useCloud();
  const engine = useEngine();
  const state = useStore(cloud);
  const { library } = useStore(engine);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!state.configured) {
    return (
      <p className="text-xs text-text-tertiary">
        Cloud library is off. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to turn it on (see README).
      </p>
    );
  }

  const busy = state.busy !== null;
  const status = (
    <p aria-live="polite" className={cn("text-xs", state.error ? "text-destructive" : "text-text-secondary")} role="status">
      {state.error ?? state.message ?? ""}
    </p>
  );

  if (!state.user) {
    const submit = (e: FormEvent<HTMLFormElement>, mode: "in" | "up") => {
      e.preventDefault();
      if (mode === "in") void cloud.signIn(email, password);
      else void cloud.signUp(email, password);
    };
    return (
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => submit(e, "in")}>
        <span className={cn(CAPTION, "self-center")}>Cloud</span>
        <label className="flex flex-col gap-1">
          <span className={CAPTION}>Email</span>
          <input autoComplete="email" className={FIELD} onChange={(e) => setEmail(e.target.value)} required type="email" value={email} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={CAPTION}>Password</span>
          <input
            autoComplete="current-password"
            className={FIELD}
            minLength={6}
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <Pad disabled={busy} size="sm" type="submit">
          Sign in
        </Pad>
        <Pad
          disabled={busy || !email || password.length < 6}
          onClick={(e) => submit(e as unknown as FormEvent<HTMLFormElement>, "up")}
          size="sm"
        >
          Create account
        </Pad>
        {status}
      </form>
    );
  }

  const inCloud = library.filter((t) => t.cloud === "synced" || t.cloud === "remote" || t.cloud === "downloading").length;
  const toUpload = library.filter((t) => t.status === "ready" && t.cloud === "local").length;
  const toDownload = library.filter((t) => t.status === "remote").length;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className={CAPTION}>Cloud</span>
      <span className="text-xs text-text-secondary">{state.user.email}</span>
      <span className="font-mono text-[13px] font-medium tabular-nums">
        {inCloud} in cloud · {toUpload} only here · {toDownload} not downloaded
      </span>
      {status}
      <div className="ml-auto flex gap-2">
        <Pad disabled={busy || toUpload === 0} onClick={() => void cloud.uploadAll()} size="sm">
          {state.busy === "upload" ? "Uploading" : `Upload ${toUpload}`}
        </Pad>
        <Pad disabled={busy || toDownload === 0} onClick={() => void cloud.downloadAll()} size="sm">
          {state.busy === "download" ? "Downloading" : `Download ${toDownload}`}
        </Pad>
        <Pad disabled={busy} onClick={() => void cloud.refresh()} size="sm">
          Refresh
        </Pad>
        <Pad disabled={busy} onClick={() => void cloud.signOut()} size="sm">
          Sign out
        </Pad>
      </div>
    </div>
  );
};
