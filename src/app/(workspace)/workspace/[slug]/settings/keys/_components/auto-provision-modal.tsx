"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Terminal,
  KeyRound,
  Mail,
  Sparkles,
  Flame,
  Check,
  X,
  Square,
  Database,
  Radio,
  Layers,
  Copy,
  Monitor,
  Globe,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBoomlifyCreditStatsAction } from "../actions";

interface AutoProvisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  onKeysProvisioned?: () => void;
}

type ProvisionStep =
  | "create_email"
  | "email_created"
  | "navigating"
  | "form_submitted"
  | "otp_received"
  | "onboarding_role"
  | "onboarding_goal"
  | "key_extracted"
  | "key_saved"
  | "failed"
  | "idle";

interface LogEntry {
  line: string;
  isError?: boolean;
  timestamp: string;
}

export function AutoProvisionModal({
  isOpen,
  onClose,
  workspaceSlug,
  onKeysProvisioned,
}: AutoProvisionModalProps) {
  const [count, setCount] = useState<number>(2);
  const [dryRun, setDryRun] = useState<boolean>(false);
  const [headless, setHeadless] = useState<boolean>(false);
  const [availableCredits, setAvailableCredits] = useState<number | null>(null);
  const [isLoadingCredits, setIsLoadingCredits] = useState<boolean>(false);

  const [phase, setPhase] = useState<"config" | "running" | "completed">("config");
  const [currentAccount, setCurrentAccount] = useState<number>(1);
  const [currentStep, setCurrentStep] = useState<ProvisionStep>("idle");
  const [currentStepLabel, setCurrentStepLabel] = useState<string>("Initializing...");
  const [interceptedOtp, setInterceptedOtp] = useState<string | null>(null);
  const [extractedKey, setExtractedKey] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [createdKeysCount, setCreatedKeysCount] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedOtp, setCopiedOtp] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [liveScreenshot, setLiveScreenshot] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"terminal" | "browser">("browser");

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsLoadingCredits(true);
      getBoomlifyCreditStatsAction(workspaceSlug)
        .then((res) => {
          if (res.success) {
            setAvailableCredits(res.credits);
          }
        })
        .finally(() => setIsLoadingCredits(false));
    } else {
      if (phase !== "running") {
        setPhase("config");
        setLogs([]);
        setErrorMsg(null);
        setCreatedKeysCount(0);
        setCurrentStep("idle");
      }
    }
  }, [isOpen, workspaceSlug]);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const handleStartProvisioning = async () => {
    setPhase("running");
    setLogs([]);
    setErrorMsg(null);
    setCreatedKeysCount(0);
    setCurrentAccount(1);
    setCurrentStep("create_email");
    setCurrentStepLabel("Starting provisioner...");
    setInterceptedOtp(null);
    setExtractedKey(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/keys/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceSlug,
          count,
          dryRun,
          headless,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let errDetail = `Server returned status ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson.error) errDetail = errJson.error;
        } catch {}
        throw new Error(errDetail);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const normalized = buffer.replace(/\r\n/g, "\n");
        const events = normalized.split("\n\n");
        buffer = events.pop() || "";

        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;

          let eventName = "message";
          let dataStr = "";

          const lines = eventBlock.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("event:")) {
              eventName = trimmed.replace("event:", "").trim();
            } else if (trimmed.startsWith("data:")) {
              dataStr = trimmed.replace("data:", "").trim();
            }
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (eventName === "preview") {
              if (data.image) setLiveScreenshot(data.image);
              if (data.url) setCurrentUrl(data.url);
            } else if (eventName === "log") {
              setLogs((prev) => [...prev, { line: data.line, isError: data.isError, timestamp: data.timestamp }]);
            } else if (eventName === "step") {
              if (data.account) setCurrentAccount(data.account);
              if (data.step) setCurrentStep(data.step);
              if (data.label) setCurrentStepLabel(data.label);
              if (data.otp) setInterceptedOtp(data.otp);
              if (data.keyPreview) setExtractedKey(data.keyPreview);
            } else if (eventName === "key_saved") {
              setCreatedKeysCount(data.totalCreated || 1);
            } else if (eventName === "complete") {
              setPhase("completed");
              if (data.totalCreated) setCreatedKeysCount(data.totalCreated);
              if (onKeysProvisioned) onKeysProvisioned();
            } else if (eventName === "error") {
              setErrorMsg(data.error);
              setLogs((prev) => [...prev, { line: `[ERROR] ${data.error}`, isError: true, timestamp: new Date().toLocaleTimeString() }]);
              setPhase("completed");
            }
          } catch {
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setErrorMsg(err.message || "Failed to provision keys.");
        setLogs((prev) => [...prev, { line: `[FATAL] ${err.message}`, isError: true, timestamp: new Date().toLocaleTimeString() }]);
        setPhase("completed");
      }
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setPhase("completed");
      setErrorMsg("Process manually halted.");
    }
  };

  const handleCopyOtp = () => {
    if (interceptedOtp) {
      navigator.clipboard.writeText(interceptedOtp);
      setCopiedOtp(true);
      setTimeout(() => setCopiedOtp(false), 2000);
    }
  };

  const handleCopyKey = () => {
    if (extractedKey) {
      navigator.clipboard.writeText(extractedKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-background/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl h-[85vh] max-h-[850px] bg-card border border-border rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
        {}
        <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shadow-xs">
              <Zap className="size-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base text-foreground tracking-tight">
                  Sarvam AI Key Provisioning Command Center
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded-full border border-primary/20">
                  <Sparkles className="size-2.5" /> Autonomous
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/20 font-mono">
                  <Radio className="size-2.5 animate-pulse" /> Neon DB Sync
                </span>
              </div>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Automated account registration, OTP interception, onboarding navigation, and pool key storage.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {phase !== "running" && (
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                title="Close"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          {}
          {phase === "config" && (
            <div className="max-w-4xl mx-auto space-y-8 py-2 animate-in fade-in-50 duration-200">
              {}
              <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-sm font-bold text-foreground flex items-center gap-2">
                      <KeyRound className="size-4 text-primary" /> Target Accounts to Auto-Provision
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Each generated account adds 100 free Sarvam audio minutes directly to your database rotation pool.
                    </p>
                  </div>
                  <span className="text-xl font-mono font-bold text-primary bg-primary/10 px-4 py-1.5 rounded-xl border border-primary/20 self-start sm:self-auto">
                    {count} {count === 1 ? "Account (1 Key)" : `Accounts (${count} Keys)`}
                  </span>
                </div>

                {}
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />

                {}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {[1, 2, 3, 5, 10].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCount(n)}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                        count === n
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {n} {n === 1 ? "Account" : "Accounts"}
                    </button>
                  ))}
                </div>
              </div>

              {}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl bg-card border border-border shadow-xs flex items-center gap-4">
                  <div className="size-11 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <Mail className="size-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">
                      Temp Mail Cost
                    </div>
                    <div className="text-sm font-bold text-foreground font-mono mt-0.5">
                      {count * 2} Boomlify Credits
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {availableCredits !== null ? `${availableCredits} credits available` : "Fetching balance..."}
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-card border border-border shadow-xs flex items-center gap-4">
                  <div className="size-11 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                    <Flame className="size-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">
                      Pool Capacity Gained
                    </div>
                    <div className="text-sm font-bold text-foreground font-mono mt-0.5">
                      +{count * 100} Audio Mins
                    </div>
                    <div className="text-[11px] text-muted-foreground">~{count * 20} full meetings</div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-card border border-border shadow-xs flex items-center gap-4">
                  <div className="size-11 rounded-xl bg-purple-500/10 text-purple-500 border border-purple-500/20 flex items-center justify-center shrink-0">
                    <Database className="size-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">
                      Storage Target
                    </div>
                    <div className="text-sm font-bold text-foreground font-mono mt-0.5">Neon PostgreSQL</div>
                    <div className="text-[11px] text-muted-foreground">Auto-rotated pool table</div>
                  </div>
                </div>
              </div>

              {}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-card border border-border shadow-xs flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-foreground">Visible Browser Window (Headed)</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Opens browser window during automation for Cloudflare Turnstile compatibility.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHeadless(!headless)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                      !headless ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block size-4.5 transform rounded-full bg-white transition-transform ${
                        !headless ? "translate-x-5.5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-card border border-border shadow-xs flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-foreground">Dry Run Testing Mode</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Test full signup, OTP interception, and key extraction without saving to database.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDryRun(!dryRun)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ${
                      dryRun ? "bg-amber-600" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block size-4.5 transform rounded-full bg-white transition-transform ${
                        dryRun ? "translate-x-5.5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {}
          {(phase === "running" || phase === "completed") && (
            <div className="h-full flex flex-col lg:flex-row gap-6 animate-in fade-in-50 duration-200">
              {}
              <div className="w-full lg:w-5/12 space-y-5">
                {}
                <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
                        {phase === "completed" ? (
                          errorMsg ? (
                            <XCircle className="size-5 text-rose-500" />
                          ) : (
                            <CheckCircle2 className="size-5 text-emerald-500" />
                          )
                        ) : (
                          <Loader2 className="size-5 animate-spin" />
                        )}
                      </div>
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          {phase === "completed"
                            ? errorMsg
                              ? "Execution Halted"
                              : "Provisioning Complete"
                            : `Provisioning Account ${currentAccount} of ${count}`}
                        </div>
                        <div className="text-sm font-semibold text-foreground">{currentStepLabel}</div>
                      </div>
                    </div>

                    <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md border border-primary/20">
                      {phase === "completed" ? "100%" : `${Math.round(((currentAccount - 1) / count) * 100)}%`}
                    </span>
                  </div>

                  {}
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500 rounded-full"
                      style={{
                        width:
                          phase === "completed"
                            ? "100%"
                            : `${Math.max(5, ((currentAccount - 1) / count) * 100 + (currentStep === "key_saved" ? 100 / count : 15))}%`,
                      }}
                    />
                  </div>
                </div>

                {}
                <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Layers className="size-3.5 text-primary" /> Automation Pipeline Steps
                  </h4>

                  <div className="space-y-2.5">
                    {[
                      {
                        id: "create_email",
                        label: "1. Temporary Disposable Inbox",
                        sub: "Boomlify temporary email creation",
                        active: ["create_email", "email_created"].includes(currentStep),
                        done: [
                          "navigating",
                          "form_submitted",
                          "otp_received",
                          "onboarding_role",
                          "onboarding_goal",
                          "key_extracted",
                          "key_saved",
                        ].includes(currentStep),
                      },
                      {
                        id: "register",
                        label: "2. Sarvam Registration Portal",
                        sub: "Submits Name, Email, and Password",
                        active: ["navigating", "form_submitted"].includes(currentStep),
                        done: [
                          "otp_received",
                          "onboarding_role",
                          "onboarding_goal",
                          "key_extracted",
                          "key_saved",
                        ].includes(currentStep),
                      },
                      {
                        id: "otp",
                        label: "3. Email OTP Interception",
                        sub: "Reads 6-digit numeric verification code",
                        active: currentStep === "otp_received",
                        done: [
                          "onboarding_role",
                          "onboarding_goal",
                          "key_extracted",
                          "key_saved",
                        ].includes(currentStep),
                      },
                      {
                        id: "key",
                        label: "4. Onboarding & Secret Key Saved",
                        sub: "Configures Developer profile & saves to DB",
                        active: ["onboarding_role", "onboarding_goal", "key_extracted"].includes(currentStep),
                        done: currentStep === "key_saved" || (phase === "completed" && !errorMsg),
                      },
                    ].map((st) => (
                      <div
                        key={st.id}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                          st.done
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                            : st.active
                            ? "bg-primary/10 border-primary/40 text-primary shadow-xs animate-pulse"
                            : "bg-muted/20 border-border text-muted-foreground opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`size-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                              st.done
                                ? "bg-emerald-500/20 text-emerald-500"
                                : st.active
                                ? "bg-primary/20 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {st.done ? (
                              <Check className="size-3.5" />
                            ) : st.active ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              st.id[0].toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate">{st.label}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{st.sub}</div>
                          </div>
                        </div>

                        {st.done && (
                          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-500 shrink-0">
                            Done
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {}
                {(interceptedOtp || extractedKey) && (
                  <div className="p-5 rounded-2xl bg-card border border-border shadow-xs space-y-3 animate-in fade-in">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Captured Credentials (Live)
                    </h4>

                    <div className="space-y-2">
                      {interceptedOtp && (
                        <div className="p-3 rounded-xl bg-muted/40 border border-border flex items-center justify-between">
                          <div>
                            <span className="text-[11px] text-muted-foreground block font-medium">
                              Intercepted OTP
                            </span>
                            <span className="text-sm font-bold font-mono tracking-widest text-primary">
                              {interceptedOtp}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopyOtp}
                            className="h-8 text-xs cursor-pointer"
                          >
                            {copiedOtp ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                          </Button>
                        </div>
                      )}

                      {extractedKey && (
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                          <div className="min-w-0 mr-2">
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block font-medium">
                              Extracted Secret Key
                            </span>
                            <span className="text-xs font-mono text-emerald-700 dark:text-emerald-300 truncate block">
                              {extractedKey}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopyKey}
                            className="h-8 text-xs text-emerald-600 cursor-pointer shrink-0"
                          >
                            {copiedKey ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Live Browser View & Realtime Terminal */}
              <div className="w-full lg:w-7/12 flex flex-col rounded-2xl border border-border bg-zinc-950 dark:bg-black shadow-2xl overflow-hidden min-h-[420px]">
                {/* Header & Tabs */}
                <div className="px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-900/80 flex items-center justify-between shrink-0 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="size-3 rounded-full bg-rose-500/80" />
                      <span className="size-3 rounded-full bg-amber-500/80" />
                      <span className="size-3 rounded-full bg-emerald-500/80" />
                    </div>

                    <div className="flex items-center bg-zinc-800/70 p-0.5 rounded-lg border border-zinc-700/50">
                      <button
                        type="button"
                        onClick={() => setActiveTab("browser")}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
                          activeTab === "browser"
                            ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        <Monitor className="size-3.5" /> Live Chrome View
                        {liveScreenshot && <span className="size-1.5 rounded-full bg-emerald-400 animate-ping ml-1" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab("terminal")}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono transition-all cursor-pointer ${
                          activeTab === "terminal"
                            ? "bg-zinc-700 text-white font-semibold shadow-xs"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        <Terminal className="size-3.5 text-primary" /> Logs ({logs.length})
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                    {currentUrl ? (
                      <span className="flex items-center gap-1 max-w-[240px] truncate text-zinc-400 bg-zinc-800/60 px-2 py-0.5 rounded border border-zinc-700/40">
                        <Lock className="size-2.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{currentUrl}</span>
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5 text-zinc-500">
                        <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
                        <span>Live Cloud Feed</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tab 1: Live Chrome Browser Screen */}
                {activeTab === "browser" && (
                  <div className="flex-1 flex flex-col bg-zinc-950 p-3 min-h-[360px] overflow-hidden">
                    {/* Fake Browser Top URL Bar */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-t-xl text-[11px] font-mono text-zinc-400 shrink-0">
                      <Globe className="size-3.5 text-primary shrink-0" />
                      <span className="text-zinc-200 font-semibold shrink-0">Chromium</span>
                      <span className="text-zinc-600">/</span>
                      <span className="truncate text-zinc-300 flex-1">{currentUrl || "https://indus.sarvam.ai/key-management"}</span>
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        LIVE
                      </span>
                    </div>

                    {/* Live Screenshot Viewport */}
                    <div className="flex-1 bg-black rounded-b-xl border-x border-b border-zinc-800 flex items-center justify-center overflow-hidden p-1 relative min-h-[300px]">
                      {liveScreenshot ? (
                        <img
                          src={liveScreenshot}
                          alt="Live Chrome View"
                          className="w-full h-full max-h-[440px] object-contain rounded shadow-2xl animate-in fade-in duration-200"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 text-zinc-500">
                          <Loader2 className="size-8 animate-spin text-primary" />
                          <div className="text-xs font-mono text-zinc-400">Connecting to live container Chrome screen...</div>
                          <div className="text-[11px] text-zinc-600 max-w-xs">
                            Live frame buffer streams directly from the cloud Playwright worker.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 2: Retro Terminal Console */}
                {activeTab === "terminal" && (
                  <div className="p-4 flex-1 overflow-y-auto font-mono text-xs text-zinc-300 space-y-1 custom-scrollbar select-text max-h-[440px]">
                    {logs.length === 0 ? (
                      <div className="text-zinc-600 italic py-4">Connecting to real-time process stream...</div>
                    ) : (
                      logs.map((l, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-2.5 leading-relaxed ${
                            l.isError ? "text-rose-400" : "text-zinc-300"
                          }`}
                        >
                          <span className="text-zinc-600 select-none font-mono text-[10px] w-7 shrink-0 text-right pt-0.5">
                            {i + 1}
                          </span>
                          <span className="break-all">{l.line}</span>
                        </div>
                      ))
                    )}
                    <div ref={terminalEndRef} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {}
        <div className="px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-between shrink-0">
          {phase === "config" && (
            <>
              <Button variant="ghost" size="sm" onClick={onClose} className="text-xs cursor-pointer">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleStartProvisioning}
                disabled={isLoadingCredits}
                className="text-xs font-semibold cursor-pointer shadow-xs gap-1.5 h-9 px-5"
              >
                <Zap className="size-3.5" /> Start Auto-Provisioning
              </Button>
            </>
          )}

          {phase === "running" && (
            <>
              <span className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                <span className="size-2 rounded-full bg-primary animate-pulse" /> Running automated Playwright
                provisioner...
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStop}
                className="text-xs cursor-pointer gap-1.5 h-9"
              >
                <Square className="size-3.5" /> Stop Execution
              </Button>
            </>
          )}

          {phase === "completed" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPhase("config")}
                className="text-xs cursor-pointer h-9"
              >
                Run Again
              </Button>
              <Button
                size="sm"
                onClick={onClose}
                className="text-xs font-semibold cursor-pointer h-9 px-6"
              >
                Done / View Active Pool
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
