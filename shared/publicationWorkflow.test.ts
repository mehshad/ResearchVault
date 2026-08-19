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