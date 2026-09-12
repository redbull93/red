import { getStore } from "@red/orchestrator";
import { NextResponse } from "next/server";
import { getAuthenticatedUser, isAuth0Configured } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  const snapshot = getStore().snapshot();

  return NextResponse.json({
    ...snapshot,
    auth: {
      configured: isAuth0Configured,
      currentUser: user,
    },
  });
}
