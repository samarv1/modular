// One-time setup for the Phase 7 compile worker (PLAN.md): boots a sandbox,
// installs TeX Live via the official net installer (scheme-basic), then
// layers on collection-latexextra — every recommended/fonts/language
// collection plus the long tail of "extra" packages (ulem, xifthen,
// ifmtarg, preprint/fullpage, etc.). Picking packages one at a time turned
// into real whack-a-mole against actual Jake variants; collection-latexextra
// is the standard fix and is still far short of scheme-full. Prints the resulting snapshot id — add it to .env
// as TEXLIVE_SNAPSHOT_ID; the compile route refuses to run without it.
// Re-run this only when the TeX Live version needs bumping.
import { Sandbox } from "@vercel/sandbox";

const INSTALL_PROFILE = `
selected_scheme scheme-basic
TEXDIR /usr/local/texlive/2024
TEXMFCONFIG ~/.texlive2024/texmf-config
TEXMFHOME ~/texmf
TEXMFLOCAL /usr/local/texlive/texmf-local
TEXMFSYSCONFIG /usr/local/texlive/2024/texmf-config
TEXMFSYSVAR /usr/local/texlive/2024/texmf-var
TEXMFVAR ~/.texlive2024/texmf-var
option_doc 0
option_src 0
`.trim();

async function main() {
  console.log("creating sandbox...");
  const sandbox = await Sandbox.create({
    runtime: "node24",
    timeout: 20 * 60 * 1000,
  });

  try {
    console.log("downloading TeX Live installer...");
    await sandbox.runCommand("sh", [
      "-c",
      "curl -fsSL https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz -o /tmp/install-tl.tar.gz",
    ]);
    await sandbox.runCommand("sh", [
      "-c",
      "mkdir -p /tmp/install-tl && tar -xzf /tmp/install-tl.tar.gz -C /tmp/install-tl --strip-components=1",
    ]);
    await sandbox.writeFiles([
      { path: "/tmp/texlive.profile", content: INSTALL_PROFILE },
    ]);

    console.log("installing TeX Live scheme-basic (this takes a while)...");
    // install-tl's own mirror auto-selection sometimes picks a dead mirror
    // (seen: ctan.math.utah.edu returning no texlive.tlpdb) and fails fast
    // with a confusing "command not found"-looking error. Pinning to the
    // CTAN redirector directly (it 302s to a live mirror per-request) avoids
    // that.
    const install = await sandbox.runCommand(
      "sh",
      [
        "-c",
        "cd /tmp/install-tl && sudo ./install-tl -repository https://mirror.ctan.org/systems/texlive/tlnet -profile /tmp/texlive.profile",
      ],
      { timeoutMs: 15 * 60 * 1000 },
    );
    if (install.exitCode !== 0) {
      throw new Error(
        `install-tl failed:\n${await install.stdout()}\n${await install.stderr()}`,
      );
    }

    console.log(
      "installing collection-latexextra (this takes a while, ~2000 packages)...",
    );
    const tlmgr = await sandbox.runCommand(
      "sh",
      [
        "-c",
        "sudo /usr/local/texlive/2024/bin/*/tlmgr install " +
          "collection-latexrecommended collection-fontsrecommended collection-langenglish " +
          "collection-latexextra",
      ],
      { timeoutMs: 15 * 60 * 1000 },
    );
    if (tlmgr.exitCode !== 0) {
      // tlmgr's own postinstall step (updmap-sys) can exit non-zero on a
      // fresh sandbox even when every requested package installed fine —
      // the pdflatex verification below is the real acceptance check, so
      // this is a warning, not an abort.
      console.warn(
        `tlmgr exited ${tlmgr.exitCode} (continuing, verifying pdflatex next):`,
      );
      console.warn((await tlmgr.stdout()).slice(-1500));
    }

    console.log("linking pdflatex onto PATH...");
    await sandbox.runCommand("sh", [
      "-c",
      "sudo ln -sf /usr/local/texlive/2024/bin/*/pdflatex /usr/local/bin/pdflatex",
    ]);

    const verify = await sandbox.runCommand("pdflatex", ["--version"]);
    if (verify.exitCode !== 0) {
      throw new Error("pdflatex not on PATH after install");
    }
    console.log(await verify.stdout());

    console.log("snapshotting...");
    const snapshot = await sandbox.snapshot();
    console.log(`\nTEXLIVE_SNAPSHOT_ID=${snapshot.snapshotId}`);
    console.log("Add this to .env.");
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
