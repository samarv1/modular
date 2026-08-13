import { z } from "zod";

// Shared contract between the LLM extraction step (resume-extraction.ts), the
// review UI, and the deterministic LaTeX serializer (synthesize-jake-latex.ts).
// Field names deliberately mirror EntryPreview (src/lib/jake-entry-preview.ts)
// since that's the existing "how should a Jake entry be described" shape.

const BulletsSchema = z.array(z.string().min(1)).max(12);

export const HeaderDataSchema = z.object({
  name: z.string().min(1),
  // Everything else on the contact line (email, phone, links), already
  // human-joined (e.g. "jake@su.edu | 123-456-7890 | linkedin.com/in/jake").
  contactLine: z.string(),
});

// A flat object with a `kind` enum, not a discriminated union: Gemini's
// structured-output schema translation doesn't reliably enforce the field
// names inside oneOf/anyOf branches (verified — a discriminated union here
// came back with the model's own invented field names, e.g. "type"/"dateRange"
// instead of "kind"/"date"). Every model-facing structured-output schema in
// this app should stay flat for the same reason. Fields that don't apply to
// a given kind are simply left empty by the model/serializer.
export const ExtractedEntrySchema = z.object({
  kind: z.enum(["subheading_entry", "project_entry", "section_chunk"]),
  sourceSection: z.string().min(1),
  // subheading_entry: role/degree title, employer/school, date, location, bullets.
  // project_entry: project name (in "title"), optional tech stack, date, bullets.
  title: z.string().optional(),
  organization: z.string().optional(),
  stack: z.string().optional(),
  date: z.string().optional(),
  location: z.string().optional(),
  bullets: BulletsSchema.optional(),
  // section_chunk: freeform "Category: values" or plain lines, one per item.
  // Each line as sent/received here, not split into label/value — keeps
  // this schema flat (see the note above) and the split happens once, in
  // the serializer.
  items: z.array(z.string().min(1)).max(20).optional(),
});

export const ExtractedSectionSchema = z.object({
  title: z.string().min(1),
  entries: z.array(ExtractedEntrySchema).min(1),
});

export const ResumeExtractionSchema = z.object({
  header: HeaderDataSchema,
  sections: z.array(ExtractedSectionSchema).min(1),
});

export type ExtractedEntry = z.infer<typeof ExtractedEntrySchema>;
export type ResumeExtraction = z.infer<typeof ResumeExtractionSchema>;
