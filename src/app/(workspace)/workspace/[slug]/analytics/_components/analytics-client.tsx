"use client";

import React, { useState, useEffect } from "react";
import {
  getWorkspaceAnalyticsDataAction,
  type ExtendedAnalyticsData,
} from "../actions";
import {
  BarChart2, Clock, CheckCircle2, AlertCircle, Users, Loader2,
  TrendingUp, Activity, PieChart, ShieldAlert, Zap, Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart as RePieChart, Pie, Legend
} from "recharts";

interface AnalyticsClientProps {
  workspaceSlug: string;
  workspaceName: string;
}

export function AnalyticsClient({
  workspaceSlug,
  workspaceName,
}: AnalyticsClientProps) {
  const [data, setData] = useState<ExtendedAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const result = await getWorkspaceAnalyticsDataAction(workspaceSlug);
        setData(result);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load analytics data.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [workspaceSlug]);

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="size-8 text-primary animate-spin" />
        <p className="text-xs text-muted-foreground font-semibold">Compiling workspace intelligence...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto text-center px-4">
        <div className="size-12 rounded-full bg-rose-500/10 flex items-center justify-center mb-4">
          <AlertCircle className="size-6 text-rose-500" />
        </div>
        <h3 className="text-sm font-bold text-foreground">Failed to compile analytics</h3>
        <p className="text-xs text-muted-foreground mt-2">{error || "An unexpected error occurred."}</p>
        <Button onClick={() => window.location.reload()} className="mt-4 h-8 text-xs font-semibold cursor-pointer">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6 space-y-8 w-full animate-in fade-in duration-300">
      
      {}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="size-5 text-primary" />
            <span className="text-[11px] font-bold text-primary uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded-md">
              Executive Dashboard
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground mt-2">
            Workspace Intelligence & Team Metrics
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time analytics for <strong className="text-foreground">{workspaceName}</strong> meeting frequency, speaker talk-time matrix, and task execution velocity.
          </p>
        </div>

        {}
        <div className="flex items-center gap-3 bg-card border border-border p-3 rounded-xl shadow-2xs shrink-0">
          <div className={`size-3 rounded-full ${
            data.fatigueIndex.riskLevel === "HIGH" ? "bg-red-500 animate-ping" :
            data.fatigueIndex.riskLevel === "MODERATE" ? "bg-amber-500" : "bg-emerald-500"
          }`} />
          <div>
            <div className="text-xs font-bold text-foreground">{data.fatigueIndex.riskLabel}</div>
            <div className="text-[10px] text-muted-foreground font-mono">
              {data.fatigueIndex.avgHoursPerWeek} hrs meetings this week
            </div>
          </div>
        </div>
      </div>

      {}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border p-5 rounded-2xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Recordings</span>
            <div className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Activity className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-foreground">{data.totalMeetings}</div>
          <p className="text-[11px] text-muted-foreground">Processed transcripts in workspace</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card border border-border p-5 rounded-2xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Recorded Time</span>
            <div className="size-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <Clock className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-foreground">{data.totalHours} hrs</div>
          <p className="text-[11px] text-muted-foreground">Audio content captured & indexed</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card border border-border p-5 rounded-2xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Action Completion Rate</span>
            <div className="size-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-foreground">{data.completionRate}%</div>
          <p className="text-[11px] text-muted-foreground">{data.completedActions} of {data.totalActions} tasks completed</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card border border-border p-5 rounded-2xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Fatigue Risk Level</span>
            <div className="size-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Zap className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-foreground">{data.fatigueIndex.riskLevel}</div>
          <p className="text-[11px] text-muted-foreground">{data.fatigueIndex.totalMeetingsThisWeek} syncs held past 7 days</p>
        </motion.div>

      </div>

      {}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {}
        <div className="bg-card border border-border p-6 rounded-2xl shadow-2xs space-y-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="size-5 text-primary" />
                <h2 className="text-base font-bold text-foreground">Speaker Monopolization & Talk-Time Matrix</h2>
              </div>
              <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full uppercase tracking-wider">
                Speaker Diarization
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Distribution of total speaking time across top workspace participants.
            </p>
          </div>

          {data.speakerMatrix.length > 0 ? (
            <div className="space-y-4">
              {data.speakerMatrix.map((sp) => (
                <div key={sp.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <div className="flex items-center gap-2">
                      <div className="size-6 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-[10px] border border-primary/20">
                        {getInitials(sp.name)}
                      </div>
                      <span className="text-foreground font-bold">{sp.name}</span>
                      {sp.talkTimePercent > 50 && (
                        <span className="text-[9px] font-extrabold text-red-500 bg-red-500/10 px-1.5 py-0.2 rounded border border-red-500/20">
                          High Talk Ratio
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{sp.words.toLocaleString()} words</span>
                      <span className="font-bold text-foreground">{sp.talkTimePercent}% ({sp.durationFormatted})</span>
                    </div>
                  </div>
                  {}
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full transition-all duration-500 rounded-full"
                      style={{ width: `${sp.talkTimePercent}%`, backgroundColor: sp.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-xs text-muted-foreground">
              No speaker data captured yet. Upload meetings to populate speaker matrix.
            </div>
          )}
        </div>

        {}
        <div className="bg-card border border-border p-6 rounded-2xl shadow-2xs space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-5 text-emerald-500" />
              <h2 className="text-base font-bold text-foreground">Task Execution Velocity</h2>
            </div>
            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
              Weekly Trends
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.taskVelocity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="weekLabel" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.9)", borderRadius: "12px", border: "none", color: "#fff", fontSize: "12px" }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                <Bar dataKey="created" name="Tasks Created" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Tasks Completed" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {}
        <div className="bg-card border border-border p-6 rounded-2xl shadow-2xs space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieChart className="size-5 text-purple-500" />
              <h2 className="text-base font-bold text-foreground">Discussion Topic & Sentiment Heatmap</h2>
            </div>
            <span className="text-[10px] font-bold text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
              NLP Classification
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {data.sentimentBreakdown.map((item) => (
              <div key={item.category} className="border border-border rounded-xl p-4 bg-muted/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="truncate max-w-[140px] text-foreground">{item.category}</span>
                  <span className="font-mono text-primary">{item.percent}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${item.percent}%`, backgroundColor: item.color }} />
                </div>
                <p className="text-[10px] text-muted-foreground">{item.count} transcript segments tagged</p>
              </div>
            ))}
          </div>
        </div>

        {}
        <div className="bg-card border border-border p-6 rounded-2xl shadow-2xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-amber-500" />
              <h2 className="text-base font-bold text-foreground">Workload Recommendation</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {data.fatigueIndex.riskDescription}
            </p>
          </div>

          <div className="border border-border rounded-xl p-4 bg-muted/40 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-foreground">
              <span>Weekly Focus vs Sync Ratio</span>
              <span className="text-emerald-500 font-mono">Good</span>
            </div>
            <div className="w-full bg-border h-2 rounded-full overflow-hidden flex">
              <div className="bg-primary h-full" style={{ width: "70%" }} title="Deep Work Focus Time" />
              <div className="bg-amber-500 h-full" style={{ width: "30%" }} title="Meeting Sync Time" />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
              <span>70% Focus Time</span>
              <span>30% Sync Time</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
