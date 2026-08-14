import { generateText, APICallError, RetryError } from "ai";
import { google } from "@ai-sdk/google";
import {
  ResumeExtractionSchema,
  type ResumeExtraction,
} from "./resume-extraction-schema";

// Direct Google provider rather than the Vercel AI Gateway: the Gateway
// requires a card on file on the Vercel team before it'll serve any model
// request, while a Google AI Studio API key (GOOGLE_GENERATIVE_AI_API_KEY)
// works on Gemini's free tier with no card.
const MODEL = google("gemini-3.5-flash");

// Schema described in the prompt and parsed/validated with Zod ourselves,
// rather than passed as a native `responseSchema` via `Output.object` —
// verified against this model: with native structured output enabled, the
// model dumps its own reasoning/self-talk into a string field instead of
// producing clean values (reproduced with reasoning fully disabled too, so
// it isn't a thinking-channel leak — the model just doesn't follow
// responseSchema-constrained field content reliably here). Plain
// prompted-JSON generation does not have this failure mode.
const EXAMPLE_SHAPE = `{
  "header": { "name": "string", "contactLine": "string" },
  "sections": [
    {
      "title": "string",
      "entries": [
        {
          "kind": "subheading_entry | project_entry | section_chunk",
          "sourceSection": "string (matches the section title)",
          "title": "string, optional",
          "organization": "string, optional",
          "stack": "string, optional",
          "date": "string, optional",
          "location": "string, optional",
          "bullets": ["string", "..."],
          "items": ["string", "..."]
        }
      ]
    }
  ]
}`;

const SYSTEM_PROMPT = `You turn a resume (given as either markdown extracted from a PDF, or raw LaTeX source) into structured data. If given LaTeX, ignore preamble/formatting commands and read the document body for content. Respond with ONLY a single JSON object matching this exact shape, no other text, no markdown code fences:
${EXAMPLE_SHAPE}

Rules:
- Every section becomes one entry in "sections". Prefer these canonical section titles when the content matches: "Education", "Experience", "Projects", "Technical Skills". Use the resume's own heading text for anything that doesn't fit one of those.
- "subheading_entry": each item is a role/degree at an organization with a date range (jobs, education). Put the role/degree title in "title", the employer/school in "organization".
- "project_entry": each item is a named project, optionally with a tech stack in "stack".
- "section_chunk": use when a section isn't a list of distinct roles/projects (e.g. Technical Skills, Certifications, a summary) — one string per line in "items", e.g. "Languages: Java, Python, C++".
- Keep bullet/line text close to verbatim; do not invent content that isn't in the source.
- "header" is the name and contact line at the top of the resume (email, phone, links), not a section.
- Every entry needs "sourceSection" set to that entry's section title, matching exactly.`;

export class ResumeExtractionError extends Error {}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\n?/, "")
    .replace(/```$/, "");
}

export async function extractResumeStructure(
  markdown: string,
): Promise<ResumeExtraction> {
  // generateText's own retry loop still throws on a persistent failure (e.g.
  // the free-tier daily quota running out) — that arrives as an AI SDK error,
  // not a ResumeExtractionError, so every caller's `catch (ResumeExtractionError)`
  // would otherwise miss it and let the raw error crash the route as a 500.
  let text: string;
  try {
    ({ text } = await generateText({
      model: MODEL,
      system: SYSTEM_PROMPT,
      prompt: markdown,
      maxOutputTokens: 16000,
    }));
  } catch (err) {
    // A persistent 429 surfaces wrapped in a RetryError (one per retry
    // attempt in .errors), not as a bare APICallError, so both shapes need
    // checking.
    const causes = RetryError.isInstance(err) ? err.errors : [err];
    const rateLimited = causes.some(
      (c) => APICallError.isInstance(c) && c.statusCode === 429,
    );
    throw new ResumeExtractionError(
      rateLimited
        ? "the AI extraction service is rate-limited right now, try again later"
        : "the AI extraction service failed to respond",
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripCodeFences(text));
  } catch {
    throw new ResumeExtractionError("the model did not return valid JSON");
  }

  const result = ResumeExtractionSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new ResumeExtractionError(
      `extraction did not match the expected shape: ${result.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  return result.data;
}
