"use client";

import React, { useState, useEffect, useTransition } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plug,
  Check,
  Trash2,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  HardDrive,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveIntegrationAction, deleteIntegrationAction } from "../actions";

type IntegrationType = "SLACK" | "JIRA" | "LINEAR" | "NOTION";

interface Integration {
  id: string;
  type: IntegrationType;
  webhookUrl: string | null;
  apiKey: string | null;
  projectKey: string | null;
  teamId: string | null;
  isActive: boolean;
}

interface IntegrationCardProps {
  type: IntegrationType;
  workspaceSlug: string;
  existing?: Integration | null;
  logo: string;
  label: string;
  description: string;
  docsUrl: string;
  fields: {
    key: "webhookUrl" | "apiKey" | "projectKey" | "teamId";
    label: string;
    placeholder: string;
    type?: string;
  }[];
}

function IntegrationCard({
  type, workspaceSlug, existing, logo, label, description, docsUrl, fields
}: IntegrationCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    fields.forEach((f) => {
      init[f.key] = (existing?.[f.key] as string) ?? "";
    });
    return init;
  });

  const isConnected = !!existing;

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }

  function handleSave() {
    startTransition(async () => {
      try {
        const data: Record<string, string> = {};
        fields.forEach((f) => { if (formData[f.key]) data[f.key] = formData[f.key]; });
        await saveIntegrationAction(workspaceSlug, type, data);
        showToast("success", `${label} connected successfully!`);
        setIsOpen(false);
      } catch {
        showToast("error", "Failed to save. Please check your credentials.");
      }
    });
  }

  function handleDelete() {
    setIsDeleting(true);
    startTransition(async () => {
      try {
        await deleteIntegrationAction(workspaceSlug, type);
        showToast("success", `${label} disconnected.`);
      } catch {
        showToast("error", "Failed to disconnect.");
      } finally {
        setIsDeleting(false);
      }
    });
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative border border-border rounded-xl bg-card overflow-hidden"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`absolute top-3 right-3 z-10 flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border shadow-sm ${
              toast.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                : "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400"
            }`}
          >
            {toast.type === "success" ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-4 p-4">
        <div className="size-11 rounded-xl border border-border bg-muted/40 flex items-center justify-center shrink-0 text-xl">
          {logo}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground">{label}</h3>
            {isConnected && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                <Check className="size-2.5" /> Connected
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isConnected && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors"
              onClick={handleDelete}
              disabled={isDeleting}
              title="Disconnect"
            >
              {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setIsOpen((o) => !o)}
          >
            {isOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {isConnected ? "Configure" : "Connect"}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="form"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-border/50 space-y-3 mt-0 pt-4">
              {fields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label className="text-xs font-semibold text-foreground">{field.label}</Label>
                  <Input
                    type={field.type ?? "text"}
                    placeholder={field.placeholder}
                    value={formData[field.key] ?? ""}
                    onChange={(e) => setFormData((d) => ({ ...d, [field.key]: e.target.value }))}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              ))}

              <div className="flex items-center justify-between pt-1">
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="size-3" /> How to get credentials
                </a>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={handleSave}
                  disabled={isPending}
                >
                  {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  {isPending ? "Saving..." : "Save & Connect"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function GoogleDriveIntegrationCard() {
  const [status, setStatus] = useState<"loading" | "connected" | "disconnected">("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  const fetchStatus = () => {
    setStatus("loading");
    fetch("/api/auth/gdrive/status")
      .then((r) => r.json())
      .then((d) => {
        if (d.isAuthorized) {
          setStatus("connected");
          setEmail(d.email || "Connected");
        } else {
          setStatus("disconnected");
          setEmail(null);
        }
      })
      .catch(() => {
        setStatus("disconnected");
      });
  };

  useEffect(() => {
    fetchStatus();

    const handleMsg = (e: MessageEvent) => {
      if (e.data?.type === "GDRIVE_AUTH_SUCCESS") {
        setStatus("connected");
        setEmail(e.data.email || "Connected");
        setIsAuthorizing(false);
      }
    };

    window.addEventListener("message", handleMsg);
    return () => window.removeEventListener("message", handleMsg);
  }, []);

  const handleConnect = () => {
    setIsAuthorizing(true);
    const width = 560;
    const height = 680;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      "/api/auth/gdrive/auth",
      "gdrive_auth_popup",
      `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no,location=no`
    );

    const timer = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(timer);
        setIsAuthorizing(false);
        fetchStatus();
      }
    }, 1000);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative border border-border rounded-xl bg-card overflow-hidden"
    >
      <div className="flex items-center gap-4 p-4">
        <div className="size-11 rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 text-xl font-bold">
          <HardDrive className="size-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground">Google Drive Cloud Storage</h3>
            {status === "connected" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <Check className="size-2.5" /> Connected
              </span>
            )}
            {status === "disconnected" && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                Authorization Required
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {status === "connected" && email ? `Active account: ${email}` : "Automatic resumable audio storage for meeting recordings up to 2GB."}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStatus}
            disabled={status === "loading"}
            className="size-8 p-0"
            title="Refresh connection status"
          >
            <RefreshCw className={`size-3.5 ${status === "loading" ? "animate-spin" : ""}`} />
          </Button>

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold"
            onClick={handleConnect}
            disabled={isAuthorizing}
          >
            {isAuthorizing ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />}
            {status === "connected" ? "Re-authorize (1-Click)" : "Connect with 1-Click"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

interface IntegrationsPageClientProps {
  workspaceSlug: string;
  integrations: Integration[];
}

const INTEGRATION_CONFIGS = [
  {
    type: "SLACK" as IntegrationType,
    logo: "💬",
    label: "Slack",
    description: "Post meeting summaries and action items to any Slack channel.",
    docsUrl: "https://api.slack.com/messaging/webhooks",
    fields: [
      {
        key: "webhookUrl" as const,
        label: "Incoming Webhook URL",
        placeholder: "https://hooks.slack.com/services/T.../B.../...",
      },
    ],
  },
  {
    type: "JIRA" as IntegrationType,
    logo: "🔵",
    label: "Jira",
    description: "Create Jira issues directly from action items in one click.",
    docsUrl: "https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/",
    fields: [
      {
        key: "teamId" as const,
        label: "Jira Base URL",
        placeholder: "https://yourcompany.atlassian.net",
      },
      {
        key: "apiKey" as const,
        label: "API Token",
        placeholder: "ATATT3xFfGF0...",
        type: "password",
      },
      {
        key: "projectKey" as const,
        label: "Project Key",
        placeholder: "ENG",
      },
    ],
  },
  {
    type: "LINEAR" as IntegrationType,
    logo: "🟣",
    label: "Linear",
    description: "Push action items to Linear issues with assignee info.",
    docsUrl: "https://linear.app/docs/api-and-security",
    fields: [
      {
        key: "apiKey" as const,
        label: "API Key",
        placeholder: "lin_api_...",
        type: "password",
      },
      {
        key: "teamId" as const,
        label: "Team ID",
        placeholder: "team-uuid",
      },
    ],
  },
  {
    type: "NOTION" as IntegrationType,
    logo: "⬛",
    label: "Notion",
    description: "Export full transcripts and summaries as Notion pages. (Coming soon)",
    docsUrl: "https://developers.notion.com/docs/authorization",
    fields: [
      {
        key: "apiKey" as const,
        label: "Integration Token",
        placeholder: "secret_...",
        type: "password",
      },
    ],
  },
];

export function IntegrationsPageClient({ workspaceSlug, integrations }: IntegrationsPageClientProps) {
  const getExisting = (type: IntegrationType) =>
    integrations.find((i) => i.type === type) ?? null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Plug className="size-4 text-primary" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Integrations & Cloud Storage</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-[42px]">
            Connect your workspace to cloud storage providers and project management tools.
          </p>
        </div>

        {}
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Storage Provider</h2>
          <GoogleDriveIntegrationCard />
        </div>

        <div className="space-y-3 pt-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">Project Management Sync</h2>
          {INTEGRATION_CONFIGS.map((config) => (
            <IntegrationCard
              key={config.type}
              workspaceSlug={workspaceSlug}
              existing={getExisting(config.type)}
              {...config}
            />
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center pb-4">
          All credentials are stored encrypted and are only accessible within your workspace.
        </p>
      </div>
    </div>
  );
}
