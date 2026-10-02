-- Tài khoản không dùng email/Google Auth; mật khẩu chỉ lưu dưới dạng scrypt hash.
create table if not exists public.account_users (
    id uuid primary key default gen_random_uuid(),
    username text not null unique,
    password_hash text not null,
    role text not null default 'student'
        check (role in ('student', 'teacher', 'admin', 'super_admin')),
    is_locked boolean not null default false,
    is_root_admin boolean not null default false,
    created_at timestamptz not null default now()
);

alter table public.account_users
    add column if not exists is_root_admin boolean not null default false;

alter table public.account_users
    drop constraint if exists account_users_root_admin_role_check;
alter table public.account_users
    add constraint account_users_root_admin_role_check
    check (not is_root_admin or role = 'super_admin');
alter table public.account_users
    drop constraint if exists account_users_root_admin_unlocked_check;
alter table public.account_users
    add constraint account_users_root_admin_unlocked_check
    check (not is_root_admin or not is_locked);

create or replace function public.protect_root_admin_account()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'DELETE' and old.is_root_admin then
        raise exception 'The root admin account cannot be deleted';
    end if;

    if tg_op = 'UPDATE' and old.is_root_admin
       and new.is_root_admin is distinct from true then
        raise exception 'The root admin designation cannot be removed';
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

drop trigger if exists protect_root_admin_account
    on public.account_users;
create trigger protect_root_admin_account
before update or delete on public.account_users
for each row execute function public.protect_root_admin_account();

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

create table if not exists public.account_deletion_requests (
    id uuid primary key default gen_random_uuid(),
    target_user_id uuid references public.account_users (id) on delete set null,
    target_username text not null,
    requested_by uuid references public.account_users (id) on delete set null,
    requested_by_username text not null,
    reviewed_by uuid references public.account_users (id) on delete set null,
    status text not null default 'pending'
        check (status in ('pending', 'approved', 'rejected')),
    created_at timestamptz not null default now(),
    reviewed_at timestamptz
);

create unique index if not exists account_deletion_requests_pending_target_idx
    on public.account_deletion_requests (target_user_id)
    where status = 'pending' and target_user_id is not null;

alter table public.math_submissions
    drop constraint if exists math_submissions_reviewed_by_fkey;
alter table public.math_submissions
    add constraint math_submissions_reviewed_by_fkey
    foreign key (reviewed_by) references public.account_users (id) on delete set null;

create or replace function public.delete_account_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    target_role text;
    target_locked boolean;
    target_is_root boolean;
    active_super_admin_count integer;
begin
    select role, is_locked, is_root_admin
    into target_role, target_locked, target_is_root
    from public.account_users
    where id = p_user_id
    for update;

    if not found then
        raise exception 'Tài khoản không còn tồn tại.';
    end if;
    if target_is_root then
        raise exception 'Không thể xóa tài khoản super admin gốc.';
    end if;
    if target_role = 'teacher' then
        raise exception 'Không được phép xóa tài khoản giáo viên.';
    end if;
    if target_role = 'super_admin' and not target_locked then
        perform pg_advisory_xact_lock(638274, 1);
        select count(*) into active_super_admin_count
        from public.account_users
        where role = 'super_admin' and is_locked = false;
        if active_super_admin_count <= 1 then
            raise exception 'Không thể xóa super admin đang hoạt động cuối cùng.';
        end if;
    end if;

    delete from public.math_assignments where created_by = p_user_id;
    update public.account_deletion_requests
    set status = 'rejected', reviewed_at = now()
    where target_user_id = p_user_id and status = 'pending';
    delete from public.account_users where id = p_user_id;
end;
$$;

create or replace function public.resolve_account_deletion_request(
    p_request_id uuid,
    p_reviewed_by uuid,
    p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    deletion_request public.account_deletion_requests%rowtype;
begin
    select * into deletion_request
    from public.account_deletion_requests
    where id = p_request_id
    for update;

    if not found or deletion_request.status <> 'pending' then
        raise exception 'Yêu cầu xóa không tồn tại hoặc đã được xử lý.';
    end if;

    if p_approve then
        if deletion_request.target_user_id is null then
            raise exception 'Tài khoản cần xóa không còn tồn tại.';
        end if;
        perform public.delete_account_user(deletion_request.target_user_id);
    end if;

    update public.account_deletion_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        reviewed_by = p_reviewed_by,
        reviewed_at = now()
    where id = p_request_id;
end;
$$;

-- API server dùng service_role; trình duyệt không được truy cập trực tiếp các bảng này.
alter table public.account_users enable row level security;
alter table public.account_sessions enable row level security;
alter table public.math_assignments enable row level security;
alter table public.math_submissions enable row level security;
alter table public.account_deletion_requests enable row level security;

revoke all on public.account_users from public, anon, authenticated;
revoke all on public.account_sessions from public, anon, authenticated;
revoke all on public.math_assignments from public, anon, authenticated;
revoke all on public.math_submissions from public, anon, authenticated;
revoke all on public.account_deletion_requests from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete
    on public.account_users, public.account_sessions,
       public.math_assignments, public.math_submissions,
       public.account_deletion_requests
    to service_role;
revoke all on function public.delete_account_user(uuid) from public, anon, authenticated;
revoke all on function public.resolve_account_deletion_request(uuid, uuid, boolean)
    from public, anon, authenticated;
grant execute on function public.delete_account_user(uuid) to service_role;
grant execute on function public.resolve_account_deletion_request(uuid, uuid, boolean)
    to service_role;
