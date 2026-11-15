// The constructor-only entry avoids undici's index initializing a process-wide
// dispatcher. Keep the package pinned and the isolation regression test passing.
declare module "undici/lib/dispatcher/pool.js" {
  import { Pool } from "undici";
  export = Pool;
}
