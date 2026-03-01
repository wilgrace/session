-- Create waiting_list_entries table
create table if not exists waiting_list_entries (
  id uuid default gen_random_uuid() primary key,
  organization_id text not null references organizations(id),
  session_instance_id uuid not null references session_instances(id) on delete cascade,
  session_template_id uuid not null references session_templates(id) on delete cascade,
  user_id uuid references clerk_users(id) on delete set null,
  email text not null,
  first_name text,
  requested_spots integer not null default 1,
  status text not null default 'waiting',  -- 'waiting' | 'notified' | 'removed'
  added_at timestamptz default now() not null,
  notified_at timestamptz,
  constraint unique_waiting_list_instance_email unique (session_instance_id, email),
  constraint requested_spots_positive check (requested_spots >= 1)
);

create index idx_wle_instance_added on waiting_list_entries(session_instance_id, added_at);

alter table waiting_list_entries enable row level security;
create policy "service role full access" on waiting_list_entries using (true) with check (true);

-- Activate the waiting_list email template for all existing orgs
update org_email_templates
set is_active = true
where type = 'waiting_list';
