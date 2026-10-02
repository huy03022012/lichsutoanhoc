-- Tài khoản không dùng email/Google Auth; mật khẩu chỉ lưu dưới dạng scrypt hash.
create table if not exists public.account_users (
    id uuid primary key default gen_random_uuid(),
    username text not null unique,
    password_hash text not null,
    role text not null default 'student'
        check (role in ('student', 'teacher', 'admin', 'super_admin')),
    is_locked boolean not null default false,
    created_at timestamptz not null default now()
);

-- Cũng cập nhật constraint khi schema được chạy lại trên project đã tạo trước đó.
alter table public.account_users
    drop constraint if exists account_users_username_check;
alter table public.account_users
    drop constraint if exists account_users_username_format_check;
alter table public.account_users
    add constraint account_users_username_format_check
    check (
        username = lower(username)
        and username = btrim(username)
        and username !~ '  '
        and char_length(username) between 3 and 24
        and username ~ '^[[:alpha:][:digit:]][[:alpha:][:digit:]. _-]*$'
    );

create table if not exists public.account_sessions (
    token_hash text primary key,
    user_id uuid not null references public.account_users (id) on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

create index if not exists account_sessions_user_id_idx
    on public.account_sessions (user_id);
create index if not exists account_sessions_expires_at_idx
    on public.account_sessions (expires_at);

create table if not exists public.math_assignments (
    id uuid primary key default gen_random_uuid(),
    title text not null check (char_length(title) between 1 and 120),
    description text not null check (char_length(description) between 1 and 10000),
    created_by uuid not null references public.account_users (id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists math_assignments_created_at_idx
    on public.math_assignments (created_at desc);

create table if not exists public.math_submissions (
    id uuid primary key default gen_random_uuid(),
    assignment_id uuid not null references public.math_assignments (id) on delete cascade,
    student_id uuid not null references public.account_users (id) on delete cascade,
    answer text not null check (char_length(answer) between 1 and 10000),
    teacher_feedback text,
    reviewed_by uuid references public.account_users (id),
    submitted_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (assignment_id, student_id)
);

create index if not exists math_submissions_assignment_id_idx
    on public.math_submissions (assignment_id, submitted_at desc);

-- API server dùng service_role; trình duyệt không được truy cập trực tiếp các bảng này.
alter table public.account_users enable row level security;
alter table public.account_sessions enable row level security;
alter table public.math_assignments enable row level security;
alter table public.math_submissions enable row level security;

revoke all on public.account_users from public, anon, authenticated;
revoke all on public.account_sessions from public, anon, authenticated;
revoke all on public.math_assignments from public, anon, authenticated;
revoke all on public.math_submissions from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete
    on public.account_users, public.account_sessions,
       public.math_assignments, public.math_submissions
    to service_role;
