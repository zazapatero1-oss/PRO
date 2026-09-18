// Entry point: wires real clients; logic lives in handler.ts.

import { wireDeps } from "../_shared/wiring.ts";
import { readJsonBody, serveWithErrors } from "../_shared/errors.ts";
import { handleChatTurn } from "./handler.ts";

const deps = wireDeps();

Deno.serve(
  serveWithErrors(deps.origin, async (req) => {
    const body = await readJsonBody<unknown>(req);
    return handleChatTurn(deps, body);
  }),
);
