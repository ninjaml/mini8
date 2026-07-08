import { OfficeRoom } from "./office";

export function OfficePage({
  workspace,
  currentUserName,
  actions,
  agentStatuses,
}) {
  return (
    <section id="view-ws-office" className="view-container office-page">
      <div className="office-page__canvas">
        <OfficeRoom
          workspace={workspace}
          currentUserName={currentUserName}
          actions={actions}
          agentStatuses={agentStatuses}
        />
      </div>
    </section>
  );
}
