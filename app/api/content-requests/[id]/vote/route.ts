import { NextResponse } from "next/server";

// Public board voting has been retired. Submission still records interest through
// the service-only RPC so publishing notifications and account exports retain it.
function retiredVotingResponse() {
    return NextResponse.json({
        error: { code: "REQUEST_VOTING_RETIRED", message: "Submit a summary request to register your interest." },
    }, { status: 410 });
}

export const POST = retiredVotingResponse;
export const DELETE = retiredVotingResponse;
