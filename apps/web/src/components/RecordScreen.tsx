"use client";

import Recorder from "./Recorder";
import TeamKeyGate from "./TeamKeyGate";
import type { Quality } from "@/lib/recorder/media";

export default function RecordScreen(props: { workspaceId: string; fingerprint: string | null; maxResolution: Quality; maxDurationMin: number }) {
  return (
    <TeamKeyGate workspaceId={props.workspaceId} fingerprint={props.fingerprint}>
      {(teamKey) => <Recorder maxResolution={props.maxResolution} maxDurationMin={props.maxDurationMin} teamKey={teamKey} />}
    </TeamKeyGate>
  );
}
