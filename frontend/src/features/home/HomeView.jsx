import { useEffect, useRef } from "react";

export function HomeView({
  onEnterMoss,
  onOpenUserPanel,
  onOpenWorkspace,
  onOpenPM,
  onOpenItems,
  onOpenAgents,
  onOpenResults,
  onOpenKnowledge,
  onOpenAIMarket,
  onOpenEnterprise,
  onOpenJoy,
  onOpenPlay,
}) {
  const iframeRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type !== "navigate") return;
      const target = e.data.target;
      switch (target) {
        case "global":
          onEnterMoss?.();
          break;
        case "user":
          onOpenUserPanel?.();
          break;
        case "workspace":
          onOpenWorkspace?.();
          break;
        case "pm":
          onOpenPM?.();
          break;
        case "items":
          onOpenItems?.();
          break;
        case "agents":
          onOpenAgents?.();
          break;
        case "results":
          onOpenResults?.();
          break;
        case "knowledge":
          onOpenKnowledge?.();
          break;
        case "ai_market":
          onOpenAIMarket?.();
          break;
        case "enterprise":
          onOpenEnterprise?.();
          break;
        case "joy":
          onOpenJoy?.();
          break;
        case "play":
          onOpenPlay?.();
          break;
        default:
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [
    onEnterMoss, onOpenUserPanel, onOpenWorkspace, onOpenPM,
    onOpenItems, onOpenAgents, onOpenResults, onOpenKnowledge,
    onOpenAIMarket, onOpenEnterprise, onOpenJoy, onOpenPlay,
  ]);

  return (
    <div className="home-view">
      <iframe
        ref={iframeRef}
        src="/architecture.html"
        title="Mini8 架构图"
        className="home-iframe"
      />
    </div>
  );
}
