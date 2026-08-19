"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check } from "lucide-react";
import { StepWorkspace } from "./step-workspace";
import { StepInvite } from "./step-invite";
import { FadeIn } from "@/components/motion/fade-in";
import { completeOnboarding, type CreateWorkspaceResult } from "../actions";

const STEPS = ["workspace", "invite"] as const;
type Step = (typeof STEPS)[number];

const STEP_META: Record<Step, { label: string; description: string }> = {
  workspace: { label: "Workspace",   description: "Set up your space" },
  invite:    { label: "Invite team", description: "Add teammates"     },
};

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState<Step>("workspace");
  const [direction, setDirection]     = useState<1 | -1>(1);
  const [workspace, setWorkspace]     = useState<CreateWorkspaceResult | null>(null);

  const currentIndex = STEPS.indexOf(currentStep);

  function goToStep(step: Step) {
    const nextIndex = STEPS.indexOf(step);
    setDirection(nextIndex > currentIndex ? 1 : -1);
    setCurrentStep(step);
  }

  function handleWorkspaceComplete(result: CreateWorkspaceResult) {
    setWorkspace(result);
    goToStep("invite");
  }

  async function handleInviteComplete() {
    if (workspace) await completeOnboarding(workspace.slug);
  }

  async function handleInviteSkip() {
    if (workspace) await completeOnboarding(workspace.slug);
  }

  const slideVariants = {
    enter: (dir: number) => ({ opacity: 0, x: dir * 32 }),
    center: { opacity: 1, x: 0 },
    exit:  (dir: number) => ({ opacity: 0, x: dir * -32 }),
  };

  return (
    <FadeIn className="flex flex-col gap-6">

      {}
      <div className="rounded-2xl border border-border bg-card shadow-md overflow-hidden">

        {}
        <div className="border-b border-border px-8 py-5">
          <div className="flex items-center justify-center gap-0">
            {STEPS.map((step, i) => {
              const isCompleted = i < currentIndex;
              const isCurrent   = step === currentStep;

              return (
                <div key={step} className="flex items-center">

                  {}
                  <div className="flex items-center gap-2.5">
                    {}
                    <motion.div
                      animate={{
                        backgroundColor: isCompleted
                          ? "var(--primary)"
                          : isCurrent
                            ? "var(--primary)"
                            : "var(--muted)",
                        scale: isCurrent ? 1.05 : 1,
                      }}
                      transition={{ duration: 0.25 }}
                      className="flex size-6 shrink-0 items-center justify-center rounded-full"
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {isCompleted ? (
                          <motion.span
                            key="check"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Check className="size-3.5 text-primary-foreground" strokeWidth={3} />
                          </motion.span>
                        ) : (
                          <motion.span
                            key="num"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={`text-sm font-bold ${isCurrent ? "text-primary-foreground" : "text-muted-foreground"}`}
                          >
                            {i + 1}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.div>

                    {}
                    <div className="flex flex-col">
                      <span className={`text-sm font-semibold leading-none transition-colors ${isCurrent ? "text-foreground" : isCompleted ? "text-primary" : "text-muted-foreground"}`}>
                        {STEP_META[step].label}
                      </span>
                      <span className="text-[11px] leading-none text-muted-foreground mt-2">
                        {STEP_META[step].description}
                      </span>
                    </div>
                  </div>

                  {}
                  {i < STEPS.length - 1 && (
                    <div className="mx-4 flex-1">
                      <div className="relative h-px w-16 bg-border overflow-hidden rounded-full">
                        <motion.div
                          className="absolute inset-y-0 left-0 bg-primary rounded-full"
                          animate={{ width: isCompleted ? "100%" : "0%" }}
                          transition={{ duration: 0.4, ease: "easeInOut" }}
                        />
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>

        {}
        <div className="px-8 py-10 overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {currentStep === "workspace" && (
                <StepWorkspace onComplete={handleWorkspaceComplete} />
              )}
              {currentStep === "invite" && workspace && (
                <StepInvite
                  workspaceId={workspace.workspaceId}
                  workspaceName={workspace.slug}
                  onComplete={handleInviteComplete}
                  onSkip={handleInviteSkip}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

      </div>

      {}
      <FadeIn direction="none" delay={0.2}>
        <p className="text-center text-sm text-muted-foreground">
          Step {currentIndex + 1} of {STEPS.length}
        </p>
      </FadeIn>

    </FadeIn>
  );
}
