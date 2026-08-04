-- PostgreSQL schema starter. Apply migrations through your chosen migration tool.
create extension if not exists pgcrypto;
create extension if not exists vector;

create type user_role as enum ('employee', 'employer_admin', 'recruiter', 'platform_admin');
create type application_status as enum ('submitted', 'reviewing', 'shortlisted', 'interviewing', 'offered', 'hired', 'rejected', 'withdrawn');
create type feedback_subject as enum ('employer', 'employee');
create type feedback_status as enum ('pending', 'published', 'disputed', 'removed');

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text not null,
  role user_role not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  display_name text not null,
  website text,
  verification_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table employee_profiles (
  user_id uuid primary key references users(id),
  headline text,
  location text,
  work_preferences jsonb not null default '{}',
  profile_visibility text not null default 'private',
  consent_matching boolean not null default false,
  embedding vector(1536),
  updated_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  created_by uuid not null references users(id),
  title text not null,
  description text not null,
  location text,
  work_mode text,
  category text not null default 'Other',
  employment_type text not null default 'Permanent',
  payment_frequency text not null default 'Monthly',
  min_pay numeric(12,2),
  max_pay numeric(12,2),
  payment_method text,
  work_hours_per_day numeric(4,1),
  off_days text,
  salary_min numeric(12,2),
  salary_max numeric(12,2),
  currency char(3),
  status text not null default 'draft',
  required_skills jsonb not null default '[]',
  preferred_skills jsonb not null default '[]',
  embedding vector(1536),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id),
  employee_id uuid not null references users(id),
  status application_status not null default 'submitted',
  resume_object_key text,
  cover_note text,
  submitted_at timestamptz not null default now(),
  unique(job_id, employee_id)
);

create table match_recommendations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references users(id),
  job_id uuid not null references jobs(id),
  score numeric(5,2) not null check (score between 0 and 100),
  confidence numeric(5,2),
  factors jsonb not null, -- displayed explanations and score contributions
  model_version text not null,
  generated_at timestamptz not null default now(),
  unique(employee_id, job_id, model_version)
);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  relationship_application_id uuid references applications(id),
  author_id uuid not null references users(id),
  subject_type feedback_subject not null,
  subject_user_id uuid references users(id),
  subject_company_id uuid references companies(id),
  category text not null,
  rating smallint check (rating between 1 and 5),
  comment text,
  status feedback_status not null default 'pending',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check ((subject_user_id is not null) <> (subject_company_id is not null))
);

create table feedback_disputes (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references feedback(id),
  raised_by uuid not null references users(id),
  response text not null,
  status text not null default 'open',
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id),
  scheduled_at timestamptz not null,
  timezone text not null,
  interview_mode text not null check (interview_mode in ('online', 'in-person')),
  meeting_link text,
  location text,
  notes text,
  employee_reminder_at timestamptz,
  employer_reminder_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index jobs_company_status_idx on jobs(company_id, status);
create index applications_job_status_idx on applications(job_id, status);
create index recommendations_employee_idx on match_recommendations(employee_id, generated_at desc);
