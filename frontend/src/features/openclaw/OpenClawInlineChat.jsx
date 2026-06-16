import { useOpenClawChat } from "./useOpenClawChat";
import { OpenClawChatSurface } from "./OpenClawChatSurface";

export function OpenClawInlineChat() {
  const chat = useOpenClawChat();

  return (
    <OpenClawChatSurface
      chat={chat}
      offlineMessage="无法连接到 OpenClaw Gateway，请在「连接智能体」页面检查配置。"
    />
  );
}
