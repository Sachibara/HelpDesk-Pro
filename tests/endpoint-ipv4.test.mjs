import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");

function extractFunction(name) {
  const expression = new RegExp("  function " + name + "\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}");
  const match = source.match(expression);
  assert.ok(match, name + " must exist in app.js");
  return match[0];
}
const { validIp, validEndpointIp } = runInNewContext(
  extractFunction("validIp") + "\n" +
  extractFunction("validEndpointIp") + "\n({ validIp, validEndpointIp })"
);

const invalid = [
  "192.168.100.256",
  "192.168.100",
  "192.168.100.10.5",
  "192.168.abc.10",
  "192.168.-1.10",
  "192.168.100.10/24",
  "",
  "192.168.1.5.5",
  "192.168..10",
  "999.999.999.999",
  " 192.168.100.11 ",
  "192.168.001.010",
  "0.0.0.0",
  "127.0.0.1",
  "127.255.255.254",
  "224.0.0.1",
  "239.255.255.255",
  "240.0.0.1",
  "255.255.255.255",
  "00.1.2.3",
  "169.254.1.1",
  "100.64.0.1",
  "192.0.0.9",
  "192.0.2.15",
  "192.88.99.1",
  "198.18.0.1",
  "198.51.100.4",
  "203.0.113.1"
];

for (const address of invalid) {
  test("Reject invalid or reserved endpoint IPv4: " + JSON.stringify(address), () => {
    assert.equal(validEndpointIp(address), false);
  });
}
for (const address of ["192.168.100.11", "10.0.10.20", "172.16.0.5", "8.8.8.8", "1.1.1.1"]) {
  test("Accept a syntactically valid unicast endpoint IP: " + address, () => {
    assert.equal(validEndpointIp(address), true);
  });
}
test("Canonical endpoint host rule remains separate from the CIDR/planning IP parser", () => {
  assert.equal(validIp("0.0.0.0"), true);
  assert.equal(validIp("127.0.0.1"), true);
  assert.equal(validEndpointIp("0.0.0.0"), false);
  assert.equal(validEndpointIp("127.0.0.1"), false);
});
test("Endpoint registration must call strict IP validator", () => {
  assert.ok(source.includes("if (!hostname || !validEndpointIp(ip) || !site)"));
});
test("Endpoint creation awaits server confirmation before showing success", () => {
  assert.ok(source.includes("await window.OpsFusionCloud.saveWorkspace(proposed)"));
  assert.ok(source.includes('toast("Endpoint not saved",'));
});
test("Endpoint modal has inline real-time IP feedback", () => {
  assert.ok(source.includes('id="mIpHint"'));
  assert.ok(source.includes('mIp").setCustomValidity'));
});
test("Cloud bootstrap starts with empty records, never seeded demo records", () => {
  assert.ok(source.includes("OpsFusionCloud.bootstrap(emptyCloudState(), displayName)"));
});
