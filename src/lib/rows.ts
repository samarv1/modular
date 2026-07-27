export interface BankEntryRow {
  id: string;
  kind: string;
  source_section: string;
  display_name: string;
  raw_latex: string;
  tags: string[];
  required_packages: string[];
  source_resume_id: string | null;
  source_resume: { display_name: string | null } | null;
  created_at: string;
}

export interface ResumeFolderRow {
  id: string;
  name: string;
  position_x: number;
  position_y: number;
  created_at: string;
}

export interface ResumeRow {
  id: string;
  title: string;
  template_shell_id: string;
  compile_status: string;
  folder_id: string | null;
  position_x: number;
  position_y: number;
  updated_at: string;
  created_at: string;
}

export interface SourceResumeRow {
  id: string;
  display_name: string | null;
  created_at: string;
}
