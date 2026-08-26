import { NextResponse } from "next/server";
import { getOwnerId } from "@/lib/owner";
import { validateByokKey } from "@/lib/resume-extraction";
import { deleteByokKey, hasByokKey, saveByokKey } from "@/lib/byok-store";
import {
  assertUnderValidateRateLimit,
  recordValidateAttempt,
  ValidateRateLimitExceededError,
} from "@/lib/byok-rate-limit";

// Whether the caller has a Gemini key configured, never the key itself,
// which never round-trips back to the client after saving.
export async function GET() {
  const ownerId = await getOwnerId();
  const configured = await hasByokKey(ownerId);
  return NextResponse.json({ configured });
}

// Validate (rate-limited, like the old /api/byok/validate) and, only on
// success, persist the key server-side encrypted.
export async function POST(request: Request) {
  const ownerId = await getOwnerId();

  const body = await request.json().catch(() => null);
  const apiKey = body?.apiKey;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return NextResponse.json({ error: "missing apiKey" }, { status: 400 });
  }

  try {
    await assertUnderValidateRateLimit(ownerId);
  } catch (err) {
    if (err instanceof ValidateRateLimitExceededError) {
      return NextResponse.json(
        { valid: false, reason: "rate_limited" },
        { status: 429 },
      );
    }
    throw err;
  }
  await recordValidateAttempt(ownerId);

  const result = await validateByokKey({ apiKey });
  if (result.valid) {
    await saveByokKey(ownerId, apiKey);
  }
  return NextResponse.json(result);
}

export async function DELETE() {
  const ownerId = await getOwnerId();
  await deleteByokKey(ownerId);
  return NextResponse.json({ ok: true });
}
