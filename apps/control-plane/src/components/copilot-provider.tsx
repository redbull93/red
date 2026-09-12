"use client";

import React from "react";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotPopup } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

interface CopilotProviderProps {
  children: React.ReactNode;
}

export function CopilotProvider({ children }: CopilotProviderProps) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      {children}
      <div className="copilot-theme-wrapper">
        <CopilotPopup
          instructions="You are StandUp Copilot, an AI assistant for engineering team stand-ups across Slack, Discord, and WhatsApp. You can query team blocker streaks, kick off morning standups, approve human-in-the-loop actions, and inspect agent runs."
          labels={{
            title: "StandUp Copilot",
            initial:
              "👋 Welcome to StandUp Copilot. Ask me about active blockers, cross-run streaks, or tell me to trigger a standup in Slack, Discord, or WhatsApp!",
            placeholder: "Ask StandUp Copilot or type an action...",
          }}
          defaultOpen={false}
          clickOutsideToClose={true}
        />
      </div>
    </CopilotKit>
  );
}

export default CopilotProvider;
