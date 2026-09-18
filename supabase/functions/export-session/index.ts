// Entry point: wires real clients; logic lives in handler.ts.

import { wireDeps } from "../_shared/wiring.ts";
import { serveWithErrors } from "../_shared/errors.ts";
import { handleExportSession } from "./handler.ts";

const deps = wireDeps();

Deno.serve(serveWithErrors(deps.origin, (req) => handleExportSession(deps, req)));
