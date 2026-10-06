"use client";

import { useEffect, useState } from "react";
import { unwrapKey } from "@/lib/e2e/crypto";
import Planner from "./Planner";
import TeamKeyGate from "./TeamKeyGate";

type Props = {
  workspaceId: string;
  fingerprint: string | null;
  clientId?: string | null;
  clientName?: string;
  clientTeamKeyWrap?: string | null;
  title?: string;
};

/** The team's planner: private items use the team key, shared items the client's key. */
export default function MemberPlanner({ workspaceId, fingerprint, ...rest }: Props) {
  return (
    <TeamKeyGate workspaceId={workspaceId} fingerprint={fingerprint}>
      {(teamKey) => <Unlocked teamKey={teamKey} {...rest} />}
    </TeamKeyGate>
  );
}

function Unlocked({ teamKey, clientId = null, clientName, clientTeamKeyWrap, title }: Omit<Props, "workspaceId" | "fingerprint"> & { teamKey: CryptoKey }) {
  const [clientKey, setClientKey] = useState<CryptoKey | null>(null);
  const [ready, setReady] = useState(!clientTeamKeyWrap);

  useEffect(() => {
    if (!clientTeamKeyWrap) return;
    unwrapKey(clientTeamKeyWrap, teamKey)
      .then(setClientKey)
      .catch(() => setClientKey(null))
      .finally(() => setReady(true));
  }, [clientTeamKeyWrap, teamKey]);

  if (!ready) return <p className="text-sm text-slate-500">Unlocking…</p>;
  return <Planner role="member" clientId={clientId} clientName={clientName} privateKey={teamKey} sharedKey={clientKey} title={title} />;
}
