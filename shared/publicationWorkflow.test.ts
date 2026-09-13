import assert from "node:assert/strict";
import test from "node:test";

import {
  approvePublicationForIp,
  isReadyForIpVetting,
  IP_VETTED_STATUS,
} from "./publicationWorkflow";

test("IP approval moves a Complete Draft to Vetted for submission without sealing it", () => {
  const draft = {
    id: 42,
    status: "Complete Draft",
    vettedForSubmissionByIpOffice: false,
  };

  const vetted = approvePublicationForIp(draft);

  assert.equal(vetted.status, IP_VETTED_STATUS);
  assert.equal(vetted.vettedForSubmissionByIpOffice, true);
  assert.notEqual(vetted.status, "Published *");
  assert.equal(isReadyForIpVetting(vetted), false);
  assert.equal(draft.status, "Complete Draft");
});

test("IP approval rejects imported Published records outside the vetting stage", () => {
  assert.throws(
    () =>
      approvePublicationForIp({
        status: "Published",
        vettedForSubmissionByIpOffice: false,
      }),
    /Complete Draft/
  );
});

// ── Workflow stage model ────────────────────────────────────────────────────

test("workflow stages cover every status the server can transition to", async () => {
  const { PUBLICATION_WORKFLOW_STAGES, PUBLICATION_OFF_FLOW_STATES } =
    await import("./publicationWorkflow.js");
  const fs = await import("node:fs");
  const routes = fs.readFileSync(new URL("../server/routes.ts", import.meta.url), "utf-8");

  // Pull the keys out of the validTransitions map so the UI stage model cannot
  // silently drift from the workflow the server actually enforces.
  const block = routes.slice(routes.indexOf("const validTransitions"));
  const mapBody = block.slice(0, block.indexOf("};"));
  const serverStatuses = [...mapBody.matchAll(/^\s*'([^']+)':\s*\[/gm)].map((m) => m[1]);
  assert.ok(serverStatuses.length >= 10, `expected the transition map, found ${serverStatuses.length} statuses`);

  const modelled = new Set<string>([
    ...PUBLICATION_WORKFLOW_STAGES.flatMap((stage) => stage.statuses),
    ...PUBLICATION_OFF_FLOW_STATES.flatMap((state) => state.statuses),
  ]);
  const missing = serverStatuses.filter((status) => !modelled.has(status));
  assert.deepEqual(
    missing,
    [],
    `these statuses exist in the server workflow but no stage or off-flow entry covers them: ${missing.join(", ")}`,
  );
});

test("stage numbers are sequential and each status maps to exactly one stage", async () => {
  const { PUBLICATION_WORKFLOW_STAGES, publicationStageOf } =
    await import("./publicationWorkflow.js");

  assert.deepEqual(
    PUBLICATION_WORKFLOW_STAGES.map((s) => s.stage),
    [1, 2, 3, 4, 5, 6, 7, 8],
    "staff refer to these by number, so the sequence must not develop gaps",
  );

  const seen = new Map<string, number>();
  for (const stage of PUBLICATION_WORKFLOW_STAGES) {
    for (const status of stage.statuses) {
      assert.equal(seen.has(status), false, `${status} is claimed by two stages`);
      seen.set(status, stage.stage);
      assert.equal(publicationStageOf(status), stage.stage);
    }
  }

  assert.equal(publicationStageOf("Published"), 7, "Published is the state staff call 7");
  assert.equal(publicationStageOf("Published *"), 8);
  assert.equal(publicationStageOf("Published - Invalid"), undefined, "invalid sits off the flow");
  assert.equal(publicationStageOf(null), undefined);
});

test("filtering by a stage matches every status in it", async () => {
  const { publicationStatusesInGroup, PUBLICATION_WORKFLOW_STAGES } =
    await import("./publicationWorkflow.js");

  // The reported failure: the Submitted for review card counted both
  // spellings, and selecting it found only the first.
  const submitted = PUBLICATION_WORKFLOW_STAGES.find((s) => s.stage === 4)!;
  assert.equal(submitted.statuses.length, 2, "this stage is the reason the helper exists");
  for (const status of submitted.statuses) {
    assert.deepEqual(
      publicationStatusesInGroup(status).sort(),
      [...submitted.statuses].sort(),
      status,
    );
  }
});

test("a single-status stage filters to just itself", async () => {
  const { publicationStatusesInGroup } = await import("./publicationWorkflow.js");
  assert.deepEqual(publicationStatusesInGroup("Published"), ["Published"]);
  assert.deepEqual(publicationStatusesInGroup("Published *"), ["Published *"]);
});

test("off-flow statuses group too, and unknown ones stand alone", async () => {
  const { publicationStatusesInGroup } = await import("./publicationWorkflow.js");
  assert.deepEqual(publicationStatusesInGroup("Withdrawn"), ["Withdrawn"]);
  // A status the office invents must filter to exactly itself, not to nothing.
  assert.deepEqual(publicationStatusesInGroup("IRP RO Vetted"), ["IRP RO Vetted"]);
  assert.deepEqual(publicationStatusesInGroup(null), []);
  assert.deepEqual(publicationStatusesInGroup(""), []);
});
