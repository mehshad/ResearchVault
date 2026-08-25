/**
 * Health check smoke test.
 * Runs before any load test to confirm the target is reachable and healthy.
 * Fails immediately if the app or DB is down.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:5000";

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    http_req_failed: ["rate==0"],           // zero failures allowed
    http_req_duration: ["p(95)<2000"],      // must respond within 2 s
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/health`);

  check(res, {
    "status is 200":        (r) => r.status === 200,
    "db is ok":             (r) => r.json("db") === "ok",
    "response has uptime":  (r) => r.json("uptime") >= 0,
  });

  sleep(1);
}
