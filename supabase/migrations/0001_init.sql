-- StreamLingo initial schema
-- Auth is handled by Supabase Auth; auth.users.id is referenced as the user id everywhere.

create type cefr_level as enum ('A1', 'A2', 'B1', 'B2', 'C1');
create type source_kind as enum ('youtube', 'podcast');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  target_language text not null,
  native_language text not null,
  level cefr_level not null,
  overlay_position text not null default 'top-right' check (overlay_position in ('top-left', 'top-right')),
  created_at timestamptz not null default now()
);

create table content_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind source_kind not null,
  external_id text, -- YouTube video id, null for podcasts
  title text not null,
  duration_seconds integer,
  created_at timestamptz not null default now()
);
create index content_sources_user_idx on content_sources(user_id);

create table segments (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references content_sources(id) on delete cascade,
  index integer not null,
  start_seconds numeric not null,
  end_seconds numeric not null,
  transcript text not null,
  unique (source_id, index)
);
create index segments_source_idx on segments(source_id);

-- Keyword cues extracted+translated by the LLM for a segment, already filtered
-- server-side by the user's level at generation time.
create table keyword_cues (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references segments(id) on delete cascade,
  word text not null,
  lemma text not null,
  translation text not null,
  example_sentence text not null,
  example_translation text not null,
  phonetic text,
  start_seconds numeric not null,
  frequency_rank smallint not null check (frequency_rank between 0 and 4)
);
create index keyword_cues_segment_idx on keyword_cues(segment_id);

create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references segments(id) on delete cascade,
  question text not null,
  choices jsonb not null,
  correct_index smallint not null,
  explanation text not null
);
create index quiz_questions_segment_idx on quiz_questions(segment_id);

create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_question_id uuid not null references quiz_questions(id) on delete cascade,
  chosen_index smallint not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now()
);
create index quiz_attempts_user_idx on quiz_attempts(user_id);

create table cloze_items (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references segments(id) on delete cascade,
  transcript_with_blanks text not null,
  answers jsonb not null -- [{position, word}]
);

-- Deduplicated personal vocabulary bank, one row per user+lemma.
create table vocab_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lemma text not null,
  translation text not null,
  example_sentence text not null,
  example_translation text not null,
  phonetic text,
  first_seen_source_id uuid references content_sources(id) on delete set null,
  times_encountered integer not null default 1,
  created_at timestamptz not null default now(),
  unique (user_id, lemma)
);
create index vocab_items_user_idx on vocab_items(user_id);

-- History of every encounter of a vocab item across sources, powering the
-- "you've already seen this word" cross-video callback.
create table vocab_encounters (
  id uuid primary key default gen_random_uuid(),
  vocab_item_id uuid not null references vocab_items(id) on delete cascade,
  source_id uuid not null references content_sources(id) on delete cascade,
  encountered_at timestamptz not null default now()
);
create index vocab_encounters_item_idx on vocab_encounters(vocab_item_id);

-- SM-2 spaced repetition state, one row per vocab item.
create table srs_states (
  vocab_item_id uuid primary key references vocab_items(id) on delete cascade,
  ease_factor numeric not null default 2.5,
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz
);
create index srs_states_due_idx on srs_states(due_at);

-- Row Level Security: every table scoped to auth.uid() via user_id, or via
-- the parent source_id/segment_id chain for child tables.
alter table profiles enable row level security;
alter table content_sources enable row level security;
alter table segments enable row level security;
alter table keyword_cues enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_attempts enable row level security;
alter table cloze_items enable row level security;
alter table vocab_items enable row level security;
alter table vocab_encounters enable row level security;
alter table srs_states enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own sources" on content_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "segments via own source" on segments
  for all using (exists (
    select 1 from content_sources s where s.id = segments.source_id and s.user_id = auth.uid()
  ));

create policy "keyword_cues via own segment" on keyword_cues
  for all using (exists (
    select 1 from segments sg join content_sources s on s.id = sg.source_id
    where sg.id = keyword_cues.segment_id and s.user_id = auth.uid()
  ));

create policy "quiz_questions via own segment" on quiz_questions
  for all using (exists (
    select 1 from segments sg join content_sources s on s.id = sg.source_id
    where sg.id = quiz_questions.segment_id and s.user_id = auth.uid()
  ));

create policy "own quiz_attempts" on quiz_attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cloze_items via own segment" on cloze_items
  for all using (exists (
    select 1 from segments sg join content_sources s on s.id = sg.source_id
    where sg.id = cloze_items.segment_id and s.user_id = auth.uid()
  ));

create policy "own vocab_items" on vocab_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "vocab_encounters via own vocab_item" on vocab_encounters
  for all using (exists (
    select 1 from vocab_items v where v.id = vocab_encounters.vocab_item_id and v.user_id = auth.uid()
  ));

create policy "srs_states via own vocab_item" on srs_states
  for all using (exists (
    select 1 from vocab_items v where v.id = srs_states.vocab_item_id and v.user_id = auth.uid()
  ));
