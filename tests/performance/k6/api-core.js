/**
 * Core API load test — simulates realistic concurrent usage against the demo instance.
 *
 * Stages:
 *   0–30 s  ramp to 10 VUs   (warm-up)
 *   30–90 s hold 10 VUs      (sustained load)
 *   90–120s ramp to 0        (cool-down)
 *
 * Thresholds (fail the CI job if breached):
 *   p95 response time < 500 ms
 *   error rate         < 1 %
 */
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

const BASE_URL = __ENV.BASE_URL || "http://localhost:5000";

// Custom metrics visible in k6 Cloud / ELK
const apiDuration = new Trend("api_duration", true);
const apiErrors   = new Rate("api_errors");
const pageHits    = new Counter("page_hits");

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "60s", target: 10 },
    { duration: "30s", target: 0  },
  ],
  thresholds: {
    http_req_duration:  ["p(95)<500"],   // 95th percentile under 500 ms
    http_req_failed:    ["rate<0.01"],   // less than 1% errors
    api_errors:         ["rate<0.01"],
  },
};

// Shared session headers — demo mode needs no auth cookie
const HEADERS = { "Accept": "application/json" };

function get(path) {
  const res = http.get(`${BASE_URL}${path}`, { headers: HEADERS });
  apiDuration.add(res.timings.duration, { endpoint: path });
  const ok = res.status >= 200 && res.status < 300;
  apiErrors.add(!ok);
  pageHits.add(1, { path });
  return res;
}

export default function () {
  group("health", () => {
    const res = get("/api/health");
    check(res, { "health 200": (r) => r.status === 200 });
    sleep(0.5);
  });

  group("programs", () => {
    const res = get("/api/programs");
    check(res, {
      "programs 200":        (r) => r.status === 200,
      "programs is array":   (r) => Array.isArray(r.json()),
    });
    sleep(0.5);
  });

  group("scientists", () => {
    const res = get("/api/scientists");
    check(res, {
      "scientists 200":      (r) => r.status === 200,
      "scientists is array": (r) => Array.isArray(r.json()),
    });
    sleep(0.5);
  });

  group("publications", () => {
    const res = get("/api/publications");
    check(res, {
      "publications 200":      (r) => r.status === 200,
      "publications is array": (r) => Array.isArray(r.json()),
    });
    sleep(0.5);
  });

  group("grants", () => {
    const res = get("/api/grants");
    check(res, {
      "grants 200":      (r) => r.status === 200,
      "grants is array": (r) => Array.isArray(r.json()),
    });
    sleep(0.5);
  });

  group("dashboard", () => {
    const res = get("/api/dashboard/stats");
    check(res, { "dashboard 200": (r) => r.status === 200 });
    sleep(1);
  });
}

export function handleSummary(data) {
  // Write HTML report and JSON results for artifact upload
  return {
    "tests/performance/k6/results/summary.html": htmlReport(data),
    "tests/performance/k6/results/summary.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: false }),
  };
}
