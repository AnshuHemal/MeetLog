"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Bot,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Activity,
  Loader2,
  AlertTriangle,
  Sparkles,
  Terminal,
  Copy,
  Check,
  Zap,
  ShieldCheck,
  Mail,
  KeyRound,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Play,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getProvisionedAccountsAction,
  getProvisionerStatsAction,
  deleteProvisionedAccountAction,
  deleteAllFailedAccountsAction,
  testProvisionedKeyAction,
} from "../actions";

export interface ProvisionedAccount {
  id: string;
  email: string;
  status: string;
  lastError: string | null;
  keyId: string | null;
  keyStatus: string | null;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

interface ProvisionerStats {
  totalAccounts: number;
  activeAccounts: number;
  failedAccounts: number;
  totalKeys: number;
  activeKeys: number;
  exhaustedKeys: number;
  totalUsage: number;
  totalErrors: number;
}

interface ProvisionerPageClientProps {
  workspaceSlug: string;
  initialAccounts: ProvisionedAccount[];
  initialStats: ProvisionerStats;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
};

export function ProvisionerPageClient({
  workspaceSlug,
  initialAccounts,
  initialStats,
}: ProvisionerPageClientProps) {
  const [accounts, setAccounts] = useState<ProvisionedAccount[]>(initialAccounts);
  const [stats, setStats] = useState<ProvisionerStats>(initialStats);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeletingFailed, setIsDeletingFailed] = useState(false);
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; msg: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);

  const filteredAccounts = accounts.filter((a) => {
    if (filterStatus === "ALL") return true;
    if (filterStatus === "KEYS") return a.keyId !== null;
    return a.status === filterStatus;
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const [accRes, statsRes] = await Promise.all([
      getProvisionedAccountsAction(workspaceSlug),
      getProvisionerStatsAction(workspaceSlug),
    ]);
    if (accRes.success && accRes.accounts) setAccounts(accRes.accounts);
    if (statsRes.success && statsRes.stats) setStats(statsRes.stats);
    setIsRefreshing(false);
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm("Remove this provisioned account and its API key from the pool?")) return;
    const res = await deleteProvisionedAccountAction(workspaceSlug, accountId);
    if (res.success) {
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      handleRefresh();
    }
  };

  const handleDeleteAllFailed = async () => {
    if (!confirm(`Remove all ${stats.failedAccounts} failed accounts?`)) return;
    setIsDeletingFailed(true);
    const res = await deleteAllFailedAccountsAction(workspaceSlug);
    setIsDeletingFailed(false);
    if (res.success) handleRefresh();
  };

  const handleTestKey = async (keyId: string) => {
    setTestingKeyId(keyId);
    setTestResult(null);
    const res = await testProvisionedKeyAction(workspaceSlug, keyId);
    setTestingKeyId(null);
    setTestResult({
      id: keyId,
      success: !!res.success,
      msg: res.success ? (res.message || "Valid") : (res.error || "Failed"),
    });
    setTimeout(() => setTestResult((prev) => (prev?.id === keyId ? null : prev)), 6000);
  };

  const handleCopyEmail = (id: string, email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
      case "PROVISIONED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {status === "ACTIVE" ? "Active" : "Provisioned"}
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
            <AlertCircle className="size-3" />
            Failed
          </span>
        );
      case "EXPIRED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="size-3" />
            Expired
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
            {status}
          </span>
        );
    }
  };

  const getKeyStatusBadge = (status: string | null) => {
    if (!status) return null;
    switch (status) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Zap className="size-2.5" /> KEY ACTIVE
          </span>
        );
      case "EXHAUSTED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400">
            KEY EXPIRED
          </span>
        );
      case "RATE_LIMITED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400">
            KEY LIMITED
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 max-w-6xl mx-auto">
      {}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6"
      >
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Bot className="size-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Sarvam Key Provisioner</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Auto-provision Sarvam AI API keys via temporary emails and automated signup.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={() => setShowTerminal(!showTerminal)}
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 cursor-pointer"
          >
            <Terminal className="size-4 text-muted-foreground" />
            <span>{showTerminal ? "Hide" : "Show"} CLI</span>
          </Button>

          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 cursor-pointer"
          >
            {isRefreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4 text-muted-foreground" />
            )}
            <span>Refresh</span>
          </Button>
        </div>
      </motion.div>

      {}
      <AnimatePresence>
        {showTerminal && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
                <Terminal className="size-4 text-primary" />
                <span className="text-sm font-bold text-foreground">Python Provisioner CLI</span>
              </div>
              <div className="p-4 space-y-3 text-xs font-mono">
                <div className="space-y-1">
                  <p className="text-muted-foreground font-sans font-medium text-[11px] uppercase tracking-wider">1. Install dependencies</p>
                  <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
                    <code className="text-foreground">cd sarvam_provisioner && pip install -r requirements.txt && playwright install chromium</code>
                    <button onClick={() => navigator.clipboard.writeText("cd sarvam_provisioner && pip install -r requirements.txt && playwright install chromium")} className="hover:text-primary cursor-pointer">
                      {copiedId === "cli-1" ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground font-sans font-medium text-[11px] uppercase tracking-wider">2. Configure environment</p>
                  <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
                    <code className="text-foreground">cp .env.example .env && nano .env</code>
                    <button onClick={() => navigator.clipboard.writeText("cp .env.example .env && nano .env")} className="hover:text-primary cursor-pointer">
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground font-sans font-medium text-[11px] uppercase tracking-wider">3. Run provisioner</p>
                  <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
                    <code className="text-foreground">python main.py --count 50</code>
                    <button onClick={() => navigator.clipboard.writeText("python main.py --count 50")} className="hover:text-primary cursor-pointer">
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground font-sans font-medium text-[11px] uppercase tracking-wider">4. Dry run (test without DB writes)</p>
                  <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between">
                    <code className="text-foreground">python main.py --count 3 --dry-run</code>
                    <button onClick={() => navigator.clipboard.writeText("python main.py --count 3 --dry-run")} className="hover:text-primary cursor-pointer">
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {}
      {stats.failedAccounts > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
                {stats.failedAccounts} Provisioning {stats.failedAccounts === 1 ? "Failed" : "Failures"}
              </p>
              <p className="text-xs text-rose-600/80 dark:text-rose-400/80">
                These accounts could not complete signup or API key generation.
              </p>
            </div>
          </div>
          <Button
            onClick={handleDeleteAllFailed}
            disabled={isDeletingFailed}
            variant="destructive"
            size="sm"
            className="text-xs h-8 cursor-pointer gap-1.5 shrink-0"
          >
            {isDeletingFailed ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            <span>Remove All Failed</span>
          </Button>
        </motion.div>
      )}

      {}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {[
          {
            icon: ShieldCheck,
            label: "Total Accounts",
            value: stats.totalAccounts,
            color: "blue",
          },
          {
            icon: Zap,
            label: "Active Keys",
            value: stats.activeKeys,
            color: "emerald",
          },
          {
            icon: AlertCircle,
            label: "Exhausted Keys",
            value: stats.exhaustedKeys,
            color: "rose",
          },
          {
            icon: Activity,
            label: "Total Transcriptions",
            value: stats.totalUsage,
            color: "purple",
          },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            variants={itemVariants}
            className="p-4 rounded-xl bg-card border border-border flex items-center gap-3.5 shadow-2xs"
          >
            <div className={`p-2.5 rounded-lg bg-${card.color}-500/10 text-${card.color}-500 border border-${card.color}-500/20`}>
              <card.icon className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              <p className="text-xl font-bold text-foreground">{card.value}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 p-1 bg-muted/40 border border-border rounded-xl">
          {["ALL", "PROVISIONED", "ACTIVE", "FAILED", "KEYS"].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterStatus === status
                  ? "bg-card text-foreground shadow-xs border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {status === "ALL" ? "All" : status === "KEYS" ? "With Keys" : status.charAt(0) + status.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="text-xs text-muted-foreground font-medium">
          Showing <span className="font-bold text-foreground">{filteredAccounts.length}</span> accounts
        </div>
      </div>

      {}
      {filteredAccounts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-2xl p-8 space-y-3 bg-muted/5"
        >
          <div className="p-3 bg-primary/10 rounded-full border border-primary/20 text-primary">
            <Bot className="size-6" />
          </div>
          <p className="text-base font-semibold text-foreground">No Provisioned Accounts</p>
          <p className="text-xs text-muted-foreground max-w-md">
            Run the Python provisioner to auto-create Sarvam accounts and populate the API key pool.
          </p>
          <Button
            onClick={() => setShowTerminal(true)}
            size="sm"
            className="mt-2 cursor-pointer gap-1.5"
          >
            <Terminal className="size-3.5" />
            View CLI Instructions
          </Button>
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-3"
        >
          {filteredAccounts.map((account) => {
            const isExpanded = expandedId === account.id;
            const isFailed = account.status === "FAILED";

            return (
              <motion.div
                key={account.id}
                variants={itemVariants}
                layout
                className={`rounded-xl border transition-all shadow-2xs overflow-hidden ${
                  isFailed
                    ? "bg-rose-500/5 border-rose-500/35 hover:border-rose-500/60"
                    : "bg-card border-border hover:border-primary/30"
                }`}
              >
                {}
                <div
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : account.id)}
                >
                  <div className="flex items-start md:items-center gap-3.5 min-w-0">
                    <div className={`p-2.5 rounded-lg border shrink-0 mt-0.5 md:mt-0 ${
                      isFailed
                        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                        : "bg-primary/10 text-primary border-primary/20"
                    }`}>
                      <Mail className="size-4" />
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground truncate font-mono">
                          {account.email}
                        </span>
                        {getStatusBadge(account.status)}
                        {getKeyStatusBadge(account.keyStatus)}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          {account.email}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopyEmail(account.id, account.email); }}
                            className="hover:text-foreground cursor-pointer p-0.5 rounded"
                          >
                            {copiedId === account.id ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                          </button>
                        </span>
                        <span>·</span>
                        <span>Used: <strong className="text-foreground">{account.usageCount}</strong></span>
                        <span>·</span>
                        <span>{new Date(account.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center" onClick={(e) => e.stopPropagation()}>
                    {account.keyId && (
                      <Button
                        onClick={() => handleTestKey(account.keyId!)}
                        disabled={testingKeyId === account.keyId}
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs cursor-pointer gap-1.5"
                      >
                        {testingKeyId === account.keyId ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3.5 text-muted-foreground" />
                        )}
                        <span>Test</span>
                      </Button>
                    )}

                    <Button
                      onClick={() => handleDeleteAccount(account.id)}
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-rose-500 cursor-pointer"
                    >
                      <Trash2 className="size-4" />
                    </Button>

                    {isExpanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                  </div>
                </div>

                {}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-0 border-t border-border/50">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Account Status</p>
                            <p className="text-xs font-semibold text-foreground">{account.status}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Key Status</p>
                            <p className="text-xs font-semibold text-foreground">{account.keyStatus || "N/A"}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Usage Count</p>
                            <p className="text-xs font-semibold text-foreground">{account.usageCount}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Last Used</p>
                            <p className="text-xs font-semibold text-foreground">
                              {account.lastUsedAt ? new Date(account.lastUsedAt).toLocaleDateString() : "Never"}
                            </p>
                          </div>
                        </div>

                        {}
                        {testResult?.id === account.keyId && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`mt-3 p-3 rounded-lg text-xs font-semibold ${
                              testResult.success
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                            }`}
                          >
                            {testResult.msg}
                          </motion.div>
                        )}

                        {}
                        {account.lastError && (
                          <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400">
                            <strong>Error:</strong> {account.lastError}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
