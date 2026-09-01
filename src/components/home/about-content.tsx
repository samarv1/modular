export function AboutContent() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[15px] text-ink">
        Hello! Welcome to Modular. I built this tool because tailoring your
        resume to the role is more important than ever if you want to get
        through ATS screening.
      </p>
      <p className="text-[15px] text-ink">
        As of 2026, AI still isn&apos;t great at tailoring resumes without heavy
        human hand-holding. It doesn&apos;t know that your PM resume should be
        more technical for one role, and more strategic for another, or that
        your FDE resume needs to sound client-facing for one company and in the
        weeds for the next.
      </p>
      <p className="text-[15px] text-ink">
        Modular assumes you already think in terms of a few different versions
        of your own experience. Instead of rewriting a resume from scratch every
        time, you drag and drop the sections you need and tweak from there.
      </p>
      <p className="text-[15px] text-ink">Happy recruiting!</p>

      <p className="text-[13px] text-muted-fg">
        Built by{" "}
        <a
          href="https://www.linkedin.com/in/samarv/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand underline hover:no-underline"
        >
          Samar Varma
        </a>
      </p>
    </div>
  );
}
