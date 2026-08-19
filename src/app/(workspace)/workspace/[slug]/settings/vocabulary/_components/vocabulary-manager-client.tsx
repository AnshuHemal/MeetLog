"use client";

import React, { useState } from "react";
import {
  addWorkspaceVocabularyTermAction,
  deleteWorkspaceVocabularyTermAction,
  globalRenameSpeakerAction,
  type VocabularyItem,
  type SpeakerProfileItem,
} from "../actions";
import {
  BookOpen, Users, Plus, Trash2, Edit3, Check, Sparkles,
  Search, Tag, Loader2, RefreshCw, Layers
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "motion/react";

interface VocabularyManagerClientProps {
  workspaceSlug: string;
  workspaceName: string;
  initialTerms: VocabularyItem[];
  initialProfiles: SpeakerProfileItem[];
}

export function VocabularyManagerClient({
  workspaceSlug,
  workspaceName,
  initialTerms,
  initialProfiles,
}: VocabularyManagerClientProps) {
  const [terms, setTerms] = useState<VocabularyItem[]>(initialTerms);
  const [profiles, setProfiles] = useState<SpeakerProfileItem[]>(initialProfiles);

  const [newTerm, setNewTerm] = useState("");
  const [newCategory, setNewCategory] = useState("TECH");
  const [isAddingTerm, setIsAddingTerm] = useState(false);

  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  const handleAddTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTerm.trim() || isAddingTerm) return;

    setIsAddingTerm(true);
    try {
      const res = await addWorkspaceVocabularyTermAction(workspaceSlug, newTerm.trim(), newCategory);
      if (res.success) {
        setTerms((prev) => [
          {
            id: `temp-${Date.now()}`,
            term: newTerm.trim(),
            category: newCategory,
            createdAt: new Date().toISOString(),
          },
          ...prev.filter((t) => t.term.toLowerCase() !== newTerm.trim().toLowerCase()),
        ]);
        setNewTerm("");
      }
    } catch (err) {
      console.error("Failed to add term:", err);
    } finally {
      setIsAddingTerm(false);
    }
  };

  const handleDeleteTerm = async (id: string) => {
    setTerms((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteWorkspaceVocabularyTermAction(workspaceSlug, id);
    } catch (err) {
      console.error("Failed to delete term:", err);
    }
  };

  const handleGlobalRenameSpeaker = async (speakerId: string) => {
    if (!editingName.trim() || isRenaming) return;

    setIsRenaming(true);
    const cleanName = editingName.trim();

    setProfiles((prev) =>
      prev.map((p) => (p.speakerId === speakerId ? { ...p, displayName: cleanName } : p))
    );
    setEditingSpeakerId(null);

    try {
      await globalRenameSpeakerAction(workspaceSlug, speakerId, cleanName);
    } catch (err) {
      console.error("Failed to rename speaker globally:", err);
    } finally {
      setIsRenaming(false);
    }
  };

  const filteredTerms = terms.filter((t) =>
    t.term.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredProfiles = profiles.filter((p) =>
    p.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.speakerId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6 space-y-8 w-full animate-in fade-in duration-300">
      
      {}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <span className="text-[11px] font-bold text-primary uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded-md">
              AI Calibration
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground mt-2">
            Speaker Profiles & Custom Dictionary
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Rename speakers globally across all meetings and add domain-specific jargon for <strong className="text-foreground">{workspaceName}</strong>.
          </p>
        </div>
      </div>

      {}
      <Tabs defaultValue="speakers" className="space-y-6">
        <TabsList className="bg-muted/40 p-1 border border-border rounded-xl">
          <TabsTrigger value="speakers" className="text-xs font-bold gap-2 cursor-pointer">
            <Users className="size-4" />
            <span>Speaker Profile Manager ({profiles.length})</span>
          </TabsTrigger>
          <TabsTrigger value="vocabulary" className="text-xs font-bold gap-2 cursor-pointer">
            <BookOpen className="size-4" />
            <span>Custom Vocabulary ({terms.length})</span>
          </TabsTrigger>
        </TabsList>

        {}
        <TabsContent value="speakers" className="space-y-6 focus-visible:ring-0">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search speaker profile or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-9 bg-card border-border"
              />
            </div>
            <span className="text-xs text-muted-foreground font-semibold">
              Changes update all transcripts globally
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProfiles.map((prof) => (
              <motion.div
                key={prof.speakerId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 rounded-2xl border border-border bg-card shadow-2xs hover:border-primary/40 transition-all space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-extrabold text-sm shadow-xs">
                      {prof.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase font-bold text-muted-foreground block">
                        {prof.speakerId}
                      </span>
                      <span className="text-xs font-bold text-foreground">
                        {prof.displayName}
                      </span>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {prof.totalMeetingsCount} Meetings
                  </span>
                </div>

                {editingSpeakerId === prof.speakerId ? (
                  <div className="flex items-center gap-2 pt-2">
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      placeholder="Enter real name..."
                      className="h-9 text-xs bg-background"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={() => handleGlobalRenameSpeaker(prof.speakerId)}
                      disabled={isRenaming}
                      className="h-9 px-3 font-bold cursor-pointer"
                    >
                      {isRenaming ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingSpeakerId(prof.speakerId);
                      setEditingName(prof.displayName);
                    }}
                    className="w-full h-8 text-xs font-semibold gap-1.5 cursor-pointer rounded-xl"
                  >
                    <Edit3 className="size-3.5" />
                    <span>Rename Globally</span>
                  </Button>
                )}
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {}
        <TabsContent value="vocabulary" className="space-y-6 focus-visible:ring-0">
          
          {}
          <form onSubmit={handleAddTerm} className="p-5 rounded-2xl border border-border bg-card shadow-2xs space-y-4">
            <div className="flex items-center gap-2">
              <Tag className="size-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Add Custom Term to AI Dictionary</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs font-semibold">Technical Term / Brand / Acronym</Label>
                <Input
                  value={newTerm}
                  onChange={(e) => setNewTerm(e.target.value)}
                  placeholder="E.g., Kubernetes, Sarvam AI, GraphQL, MeetLog"
                  className="h-10 text-xs bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Category</Label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-background text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                >
                  <option value="TECH">Technical Concept</option>
                  <option value="BRAND">Brand / Company</option>
                  <option value="ACRONYM">Acronym</option>
                  <option value="NAME">Person / Team Member</option>
                </select>
              </div>
            </div>

            <Button
              type="submit"
              disabled={!newTerm.trim() || isAddingTerm}
              className="h-9 px-5 text-xs font-bold gap-2 cursor-pointer rounded-xl"
            >
              {isAddingTerm ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span>Add to Dictionary</span>
            </Button>
          </form>

          {}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {filteredTerms.map((term) => (
              <motion.div
                key={term.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-card shadow-2xs hover:border-primary/30 transition-all group"
              >
                <div className="min-w-0 space-y-0.5">
                  <span className="text-xs font-extrabold text-foreground truncate block">
                    {term.term}
                  </span>
                  <span className="text-[9px] font-bold text-primary uppercase tracking-wider bg-primary/10 px-1.5 py-0.2 rounded">
                    {term.category || "TECH"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteTerm(term.id)}
                  className="size-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                  title="Remove from dictionary"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </motion.div>
            ))}
          </div>

        </TabsContent>
      </Tabs>

    </div>
  );
}
