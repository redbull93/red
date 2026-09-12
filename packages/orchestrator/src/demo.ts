import { fixtureEvent, getStore, ingestEnvironmentEvent } from "./index";

const run = await ingestEnvironmentEvent(
  fixtureEvent({
    forceFail: process.argv.includes("--fail"),
    requireHitl: process.argv.includes("--hitl"),
  }),
);

console.log(JSON.stringify({ run, snapshot: getStore().snapshot() }, null, 2));
