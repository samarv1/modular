// Deliberately not a UUID, so a stray API call reaching a real route with
// this id fails on the id shape instead of silently touching row 0 of some
// table.
//
// Keep this file free of other imports. src/proxy.ts pulls it into the
// middleware bundle without demo-workspace.ts's adapter/storage dependency
// tree.
export const DEMO_RESUME_ID = "demo";
