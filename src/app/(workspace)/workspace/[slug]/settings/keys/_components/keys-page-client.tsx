"use client";

import React, { useState } from "react";
import {
  KeyRound,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Zap,
  Activity,
  Copy,
  Check,
  Loader2,
  Power,
  AlertTriangle,
  Sparkles,
  List,
  LayoutGrid,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addPoolKeyAction,
  deletePoolKeyAction,
  togglePoolKeyStatusAction,
  testPoolKeyAction,
  deleteExpiredPoolKeysAction,
  testAllPoolKeysAction,
  getPoolKeysAction,
} from "../actions";
import { ApiProvider } from "@/lib/key-pool";
import { AutoProvisionModal } from "./auto-provision-modal";
import { useViewMode } from "@/hooks/use-view-mode";
import { useProvisionerUnlocked } from "@/hooks/use-provisioner-unlocked";

export interface PoolKeyItem {
  id: string;
  provider: string;
  maskedKey: string;
  label: string | null;
  status: string;
  rateLimitResetAt: string | null;
  usageCount: number;
  errorCount: number;
  lastUsedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

interface KeysPageClientProps {
  workspaceSlug: string;
  initialKeys: PoolKeyItem[];
}

function formatDateHuman(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function KeysPageClient({
  workspaceSlug,
  initialKeys,
}: KeysPageClientProps) {
  const [keys, setKeys] = useState<PoolKeyItem[]>(initialKeys);
  const [filterProvider, setFilterProvider] = useState<string>("ALL");
  const [viewMode, setViewMode] = useViewMode("grid");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAutoProvisionOpen, setIsAutoProvisionOpen] = useState(false);
  const [isProvisionerUnlocked, toggleProvisionerUnlocked] = useProvisionerUnlocked();

  const [secretClickCount, setSecretClickCount] = useState<number>(0);
  const secretTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleSecretIconClick = () => {
    if (secretTimerRef.current) {
      clearTimeout(secretTimerRef.current);
    }

    const nextCount = secretClickCount + 1;
    setSecretClickCount(nextCount);

    if (nextCount >= 7) {
      toggleProvisionerUnlocked(true);
      setSecretClickCount(0);
    } else {
      secretTimerRef.current = setTimeout(() => {
        setSecretClickCount(0);
      }, 3500);
    }
  };

  const refreshKeysList = async () => {
    const res = await getPoolKeysAction(workspaceSlug);
    if (res.success && res.keys) {
      setKeys(res.keys);
    }
  };

  const [newProvider, setNewProvider] = useState<ApiProvider>("SARVAM");
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [isDeletingExpired, setIsDeletingExpired] = useState(false);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; msg: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredKeys = keys.filter((k) => {
    if (filterProvider === "ALL") return true;
    if (filterProvider === "EXPIRED") return k.status === "EXHAUSTED";
    return k.provider === filterProvider;
  });

  const activeCount = keys.filter((k) => k.status === "ACTIVE").length;
  const rateLimitedCount = keys.filter((k) => k.status === "RATE_LIMITED").length;
  const expiredCount = keys.filter((k) => k.status === "EXHAUSTED").length;
  const totalUsage = keys.reduce((acc, k) => acc + k.usageCount, 0);

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) {
      setFormError("API Key is required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const res = await addPoolKeyAction(workspaceSlug, {
      provider: newProvider,
      key: newKey,
      label: newLabel || undefined,
    });

    setIsSubmitting(false);

    if (res.success && res.key) {
      setKeys((prev) => [
        {
          id: res.key!.id,
          provider: res.key!.provider,
          maskedKey: res.key!.maskedKey,
          label: res.key!.label,
          status: res.key!.status,
          rateLimitResetAt: null,
          usageCount: res.key!.usageCount,
          errorCount: res.key!.errorCount,
          lastUsedAt: null,
          lastError: null,
          createdAt: res.key!.createdAt,
        },
        ...prev,
      ]);
      setIsAddModalOpen(false);
      setNewKey("");
      setNewLabel("");
    } else {
      setFormError(res.error || "Failed to add API key.");
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to remove this API key from the database pool?")) return;
    const res = await deletePoolKeyAction(workspaceSlug, keyId);
    if (res.success) {
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
    }
  };

  const handleDeleteAllExpired = async () => {
    if (!confirm(`Are you sure you want to remove all ${expiredCount} expired/exhausted API keys from the database?`)) return;
    setIsDeletingExpired(true);
    const res = await deleteExpiredPoolKeysAction(workspaceSlug);
    setIsDeletingExpired(false);
    if (res.success) {
      setKeys((prev) => prev.filter((k) => k.status !== "EXHAUSTED"));
    }
  };

  const handleToggleStatus = async (keyId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "ACTIVE" ? "DISABLED" : "ACTIVE";
    const res = await togglePoolKeyStatusAction(workspaceSlug, keyId, nextStatus);
    if (res.success) {
      setKeys((prev) =>
        prev.map((k) => (k.id === keyId ? { ...k, status: nextStatus } : k))
      );
    }
  };

  const handleTestKey = async (keyId: string) => {
    setTestingKeyId(keyId);
    setTestResult(null);
    const res = await testPoolKeyAction(workspaceSlug, keyId);
    setTestingKeyId(null);

    if (res.success) {
      setTestResult({ id: keyId, success: true, msg: "Active & Valid" });
      setKeys((prev) =>
        prev.map((k) => (k.id === keyId ? { ...k, status: res.status || "ACTIVE", lastError: null } : k))
      );
    } else {
      setTestResult({ id: keyId, success: false, msg: res.error || "Invalid Key" });
      if (res.status) {
        setKeys((prev) =>
          prev.map((k) => (k.id === keyId ? { ...k, status: res.status!, lastError: res.error || null } : k))
        );
      }
    }

    setTimeout(() => {
      setTestResult((prev) => (prev?.id === keyId ? null : prev));
    }, 4000);
  };

  const handleScanAllKeys = async () => {
    setIsScanningAll(true);
    const res = await testAllPoolKeysAction(workspaceSlug);
    setIsScanningAll(false);

    if (res.success && res.results) {
      setKeys((prev) =>
        prev.map((k) => {
          const result = res.results[k.id];
          if (result) {
            return {
              ...k,
              status: result.status,
              lastError: result.success ? null : (result.msg || null),
            };
          }
          return k;
        })
      );
    }
  };

  const handleCopyMasked = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        );
      case "RATE_LIMITED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="size-3" />
            Rate Limited
          </span>
        );
      case "EXHAUSTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            <AlertCircle className="size-3" />
            Expired
          </span>
        );
      case "DISABLED":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
            <Power className="size-3" />
            Disabled
          </span>
        );
    }
  };

  return (
    <div className="w-full flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
      {}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div
              onClick={handleSecretIconClick}
              className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20 select-none"
            >
              <KeyRound className="size-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">API Key Pool & Rotation</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage multi-provider API keys with automated failover, background rotation, and one-click provisioning.
          </p>
        </div>

        {}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {isProvisionerUnlocked && (
            <Button
              onClick={() => setIsAutoProvisionOpen(true)}
              size="sm"
              className="h-9 gap-2 shadow-xs cursor-pointer animate-in zoom-in-95 duration-200"
              title="Auto-create and provision Sarvam API keys with 1-click"
            >
              <Zap className="size-3.5" />
              <span>Auto-Provision Keys</span>
            </Button>
          )}

          <Button
            onClick={handleScanAllKeys}
            disabled={isScanningAll || keys.length === 0}
            variant="outline"
            size="sm"
            className="h-9 gap-2 cursor-pointer"
            title="Scan and verify connectivity for all keys"
          >
            {isScanningAll ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5 text-primary" />
            )}
            <span>{isScanningAll ? "Scanning..." : "Scan & Verify All"}</span>
          </Button>

          <Button
            onClick={() => setIsAddModalOpen(true)}
            variant="outline"
            size="sm"
            className="h-9 gap-2 cursor-pointer"
          >
            <Plus className="size-3.5" />
            <span>Add API Key</span>
          </Button>
        </div>
      </div>

      {}
      {expiredCount > 0 && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs animate-in fade-in">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
                {expiredCount} {expiredCount === 1 ? "API Token is" : "API Tokens are"} Expired or Exhausted
              </p>
              <p className="text-xs text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                These keys have been automatically removed from active transcription rotation.
              </p>
            </div>
          </div>

          <Button
            onClick={handleDeleteAllExpired}
            disabled={isDeletingExpired}
            variant="destructive"
            size="sm"
            className="h-8 gap-1.5 text-xs font-semibold cursor-pointer shrink-0"
          >
            {isDeletingExpired ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            <span>Delete Expired Keys</span>
          </Button>
        </div>
      )}

      {}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-card border border-border shadow-xs flex items-center gap-4 transition-all hover:border-border/80">
          <div className="size-11 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Keys in Pool</div>
            <div className="text-2xl font-bold font-mono text-foreground mt-0.5">{keys.length}</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border shadow-xs flex items-center gap-4 transition-all hover:border-border/80">
          <div className="size-11 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Zap className="size-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active & Ready</div>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
              {activeCount}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border shadow-xs flex items-center gap-4 transition-all hover:border-border/80">
          <div className="size-11 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20 flex items-center justify-center shrink-0">
            <AlertCircle className="size-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Expired / Exhausted</div>
            <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-0.5">
              {expiredCount}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border shadow-xs flex items-center gap-4 transition-all hover:border-border/80">
          <div className="size-11 rounded-lg bg-purple-500/10 text-purple-500 border border-purple-500/20 flex items-center justify-center shrink-0">
            <Activity className="size-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transcriptions Run</div>
            <div className="text-2xl font-bold font-mono text-foreground mt-0.5">{totalUsage}</div>
          </div>
        </div>
      </div>

      {}
      <div className="flex items-center justify-between gap-4 border-b border-border pb-3 flex-wrap">
        {}
        <div className="flex items-center gap-1.5 flex-wrap">
          {["ALL", "SARVAM", "GROQ", "OPENAI", "GEMINI", "EXPIRED"].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterProvider(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                filterProvider === tab
                  ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              }`}
            >
              {tab === "ALL"
                ? "All Keys"
                : tab === "EXPIRED"
                ? `Expired (${expiredCount})`
                : tab}
            </button>
          ))}
        </div>

        {}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Showing <strong className="text-foreground">{filteredKeys.length}</strong> keys
          </span>

          <div className="flex items-center gap-1 border-l border-border pl-3">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="size-8 rounded-lg cursor-pointer hover:bg-muted"
              onClick={() => setViewMode("grid")}
              title="Grid View"
            >
              <LayoutGrid className="size-4 text-foreground" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="size-8 rounded-lg cursor-pointer hover:bg-muted"
              onClick={() => setViewMode("list")}
              title="List View"
            >
              <List className="size-4 text-foreground" />
            </Button>
          </div>
        </div>
      </div>

      {}
      {filteredKeys.length === 0 ? (
        <div className="py-16 text-center rounded-xl border border-dashed border-border bg-card/40 space-y-3">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
            <KeyRound className="size-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">No API Keys in this view</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Auto-provision new Sarvam keys with 1-click or add custom provider credentials manually.
            </p>
          </div>
          <div className="pt-2 flex items-center justify-center gap-2">
            <Button
              size="sm"
              onClick={() => setIsAutoProvisionOpen(true)}
              className="h-8 text-xs gap-1.5 cursor-pointer shadow-xs"
            >
              <Zap className="size-3.5" /> Auto-Provision Keys
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddModalOpen(true)}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <Plus className="size-3.5" /> Add Manually
            </Button>
          </div>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-200">
          {filteredKeys.map((keyItem) => (
            <div
              key={keyItem.id}
              className={`rounded-xl border bg-card p-5 flex flex-col justify-between gap-4 shadow-xs hover:border-primary/40 hover:shadow-md transition-all ${
                keyItem.status === "EXHAUSTED" ? "border-rose-500/30 bg-rose-500/5" : "border-border"
              }`}
            >
              {}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`size-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                        keyItem.provider === "SARVAM"
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                          : keyItem.provider === "GROQ"
                          ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20"
                          : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {keyItem.provider.slice(0, 3)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-sm text-foreground truncate">
                        {keyItem.label || `${keyItem.provider} Key`}
                      </h4>
                      <span className="text-[11px] text-muted-foreground">{keyItem.provider} Provider</span>
                    </div>
                  </div>
                  <div>{getStatusBadge(keyItem.status)}</div>
                </div>

                {}
                <div className="p-2.5 rounded-lg bg-muted/40 border border-border flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-foreground truncate select-all">{keyItem.maskedKey}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyMasked(keyItem.id, keyItem.maskedKey)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
                    title="Copy Key Identifier"
                  >
                    {copiedId === keyItem.id ? (
                      <Check className="size-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                </div>

                {}
                <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1">
                  <div className="p-2 rounded-md bg-muted/20 border border-border/60">
                    <span className="block text-[10px] uppercase font-semibold text-muted-foreground">Transcriptions</span>
                    <span className="font-semibold text-foreground text-xs">{keyItem.usageCount} calls</span>
                  </div>
                  <div className="p-2 rounded-md bg-muted/20 border border-border/60">
                    <span className="block text-[10px] uppercase font-semibold text-muted-foreground">Added On</span>
                    <span className="font-semibold text-foreground text-xs">{formatDateHuman(keyItem.createdAt)}</span>
                  </div>
                </div>

                {}
                {keyItem.lastError && (
                  <div className="p-2 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[11px] flex items-center gap-1.5">
                    <AlertCircle className="size-3.5 shrink-0" />
                    <span className="truncate">{keyItem.lastError}</span>
                  </div>
                )}
              </div>

              {}
              <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {testResult?.id === keyItem.id ? (
                    <span
                      className={`text-xs px-2 py-1 rounded font-medium ${
                        testResult.success
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      {testResult.msg}
                    </span>
                  ) : (
                    <Button
                      onClick={() => handleTestKey(keyItem.id)}
                      disabled={testingKeyId === keyItem.id}
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5 cursor-pointer"
                    >
                      {testingKeyId === keyItem.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-3 text-muted-foreground" />
                      )}
                      <span>Test</span>
                    </Button>
                  )}

                  <Button
                    onClick={() => handleToggleStatus(keyItem.id, keyItem.status)}
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1 cursor-pointer"
                  >
                    <Power className="size-3" />
                    <span>{keyItem.status === "ACTIVE" ? "Disable" : "Enable"}</span>
                  </Button>
                </div>

                <Button
                  onClick={() => handleDeleteKey(keyItem.id)}
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                  title="Remove Key"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3 animate-in fade-in duration-200">
          {filteredKeys.map((keyItem) => (
            <div
              key={keyItem.id}
              className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card shadow-xs hover:border-border/80 ${
                keyItem.status === "EXHAUSTED" ? "border-rose-500/30 bg-rose-500/5" : "border-border"
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`size-10 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                    keyItem.provider === "SARVAM"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                      : keyItem.provider === "GROQ"
                      ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}
                >
                  {keyItem.provider.slice(0, 3)}
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-foreground truncate">
                      {keyItem.label || `${keyItem.provider} Key`}
                    </span>
                    {getStatusBadge(keyItem.status)}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                    <button
                      type="button"
                      onClick={() => handleCopyMasked(keyItem.id, keyItem.maskedKey)}
                      className="hover:text-foreground inline-flex items-center gap-1 cursor-pointer transition-colors"
                      title="Copy Key Identifier"
                    >
                      <span>{keyItem.maskedKey}</span>
                      {copiedId === keyItem.id ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>

                    <span>•</span>
                    <span className="font-sans text-[11px]">Used: {keyItem.usageCount} times</span>

                    {keyItem.lastError && (
                      <>
                        <span>•</span>
                        <span className="text-rose-500 font-sans text-[11px] truncate max-w-[200px]" title={keyItem.lastError}>
                          {keyItem.lastError}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                {testResult?.id === keyItem.id ? (
                  <span
                    className={`text-xs px-2.5 py-1 rounded-md font-medium ${
                      testResult.success
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    {testResult.msg}
                  </span>
                ) : (
                  <Button
                    onClick={() => handleTestKey(keyItem.id)}
                    disabled={testingKeyId === keyItem.id}
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 cursor-pointer"
                  >
                    {testingKeyId === keyItem.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-3 text-muted-foreground" />
                    )}
                    <span>Test</span>
                  </Button>
                )}

                <Button
                  onClick={() => handleToggleStatus(keyItem.id, keyItem.status)}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 cursor-pointer"
                >
                  <Power className="size-3" />
                  <span>{keyItem.status === "ACTIVE" ? "Disable" : "Enable"}</span>
                </Button>

                <Button
                  onClick={() => handleDeleteKey(keyItem.id)}
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                  title="Remove Key"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Plus className="size-4" />
                </div>
                <h3 className="font-semibold text-base text-foreground">Add API Key to Pool</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddKey}>
              <div className="p-6 space-y-4">
                {formError && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">Provider</Label>
                  <select
                    value={newProvider}
                    onChange={(e) => setNewProvider(e.target.value as ApiProvider)}
                    className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="SARVAM">Sarvam AI (Speech-to-Text & Diarization)</option>
                    <option value="GROQ">Groq (Whisper Large v3 Fallback)</option>
                    <option value="OPENAI">OpenAI (Whisper)</option>
                    <option value="GEMINI">Google Gemini</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">API Secret Key</Label>
                  <Input
                    type="password"
                    placeholder="Paste secret API key..."
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="text-xs font-mono"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Stored securely in your database pool and rotated automatically.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">Label (Optional)</Label>
                  <Input
                    placeholder="e.g. Primary Team Key #1"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="px-6 py-3.5 bg-muted/20 border-t border-border flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  size="sm"
                  className="text-xs cursor-pointer shadow-xs"
                >
                  {isSubmitting ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
                  Save to Pool
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {}
      <AutoProvisionModal
        isOpen={isAutoProvisionOpen}
        onClose={() => setIsAutoProvisionOpen(false)}
        workspaceSlug={workspaceSlug}
        onKeysProvisioned={refreshKeysList}
      />
    </div>
  );
}
