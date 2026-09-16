import { NextResponse } from "next/server";
import { validateByokKey } from "@/lib/resume-extraction";
import { deleteByokKey, hasByokKey, saveByokKey } from "@/lib/byok-store";
import {
  reserveValidateAttempt,
  ValidateRateLimitExceededError,
} from "@/lib/byok-rate-limit";
import { getOwnerContext } from "@/lib/request-context";

export async function GET() {
  const context = await getOwnerContext();
  const configured = await hasByokKey(context.ownerId, context.client);
  return NextResponse.json({ configured });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const apiKey = body?.apiKey;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return NextResponse.json({ error: "missing apiKey" }, { status: 400 });
  }

  const context = await getOwnerContext();

  try {
    await reserveValidateAttempt(context.ownerId, context.client);
  } catch (err) {
    if (err instanceof ValidateRateLimitExceededError) {
      return NextResponse.json(
        { valid: false, reason: "rate_limited" },
        { status: 429 },
      );
    }
    throw err;
  }
  const result = await validateByokKey({ apiKey });
  if (result.valid) {
    await saveByokKey(context.ownerId, apiKey, context.client);
  }
  return NextResponse.json(result);
}

export async function DELETE() {
  const context = await getOwnerContext();
  await deleteByokKey(context.ownerId, context.client);
  return NextResponse.json({ ok: true });
}
