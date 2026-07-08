import { useOpenClawChat } from "./useOpenClawChat";
import { OpenClawChatSurface } from "./OpenClawChatSurface";

export function OpenClawInlineChat() {
  const chat = useOpenClawChat();

  return (
    <OpenClawChatSurface
      chat={chat}
      offlineMessage="无法连接到 OpenClaw Gateway，请在 Agent团队 或 OpenClaw 管理页检查配置。"
    />
  );
}
