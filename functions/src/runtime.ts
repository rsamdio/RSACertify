import * as functions from "firebase-functions/v1";

/** Deploy callables + triggers next to RTDB (asia-southeast1). */
export const FUNCTIONS_REGION = "asia-southeast1" as const;

/** Regional Gen1 builder — use instead of bare `functions` for exports. */
export const fn = functions.region(FUNCTIONS_REGION);
