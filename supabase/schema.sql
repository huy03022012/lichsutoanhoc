-- Tài khoản không dùng Google Auth; mật khẩu chỉ lưu dưới dạng scrypt hash.
create table if not exists public.account_users (
    id uuid primary key default gen_random_uuid(),
    username text not null unique,
    display_name text,
    email text,
    email_verified_at timestamptz,
    password_hash text not null,
    role text not null default 'student'
        check (role in ('student', 'teacher', 'admin', 'super_admin')),
    is_locked boolean not null default false,
    is_root_admin boolean not null default false,
    created_at timestamptz not null default now()
);

alter table public.account_users
    add column if not exists display_name text;
alter table public.account_users
    add column if not exists email text;
alter table public.account_users
    add column if not exists email_verified_at timestamptz;
update public.account_users
set display_name = username
where display_name is null or btrim(display_name) = '';
alter table public.account_users
    alter column display_name set not null;

create unique index if not exists account_users_email_unique_idx
    on public.account_users (email)
    where email is not null;

alter table public.account_users
    drop constraint if exists account_users_display_name_check;
alter table public.account_users
    add constraint account_users_display_name_check
    check (char_length(display_name) between 1 and 60);

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

create table if not exists public.account_login_rate_limits (
    bucket_key text primary key,
    window_started_at timestamptz not null,
    attempt_count integer not null check (attempt_count > 0),
    updated_at timestamptz not null default now(),
    blocked_until timestamptz,
    limit_type text not null default 'legacy'
);

alter table public.account_login_rate_limits
    add column if not exists blocked_until timestamptz;
alter table public.account_login_rate_limits
    add column if not exists limit_type text not null default 'legacy';

create index if not exists account_login_rate_limits_window_started_at_idx
    on public.account_login_rate_limits (window_started_at);

create or replace function public.check_account_login_lockout(
    p_bucket_key text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_blocked_until timestamptz;
begin
    if p_bucket_key is null or char_length(p_bucket_key) > 128 then
        raise exception 'Invalid login lockout key';
    end if;

    select blocked_until into v_blocked_until
    from public.account_login_rate_limits
    where bucket_key = p_bucket_key
      and limit_type = 'username';

    if v_blocked_until is null or v_blocked_until <= clock_timestamp() then
        return 0;
    end if;
    return ceil(extract(epoch from (v_blocked_until - clock_timestamp())))::integer;
end;
$$;

create or replace function public.record_account_login_failure(
    p_bucket_key text,
    p_max_attempts integer
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_attempt_count integer;
    v_blocked_until timestamptz;
begin
    if p_bucket_key is null
       or char_length(p_bucket_key) > 128
       or p_max_attempts is distinct from 10 then
        raise exception 'Invalid login failure input';
    end if;

    insert into public.account_login_rate_limits (
        bucket_key, window_started_at, attempt_count, updated_at,
        blocked_until, limit_type
    )
    values (p_bucket_key, v_now, 1, v_now, null, 'username')
    on conflict (bucket_key) do update
    set window_started_at = case
            when public.account_login_rate_limits.limit_type <> 'username'
                 or (public.account_login_rate_limits.blocked_until is not null
                     and public.account_login_rate_limits.blocked_until <= v_now)
                then v_now
            else public.account_login_rate_limits.window_started_at
        end,
        attempt_count = case
            when public.account_login_rate_limits.limit_type <> 'username'
                 or (public.account_login_rate_limits.blocked_until is not null
                     and public.account_login_rate_limits.blocked_until <= v_now)
                then 1
            else public.account_login_rate_limits.attempt_count + 1
        end,
        blocked_until = case
            when public.account_login_rate_limits.limit_type = 'username'
                 and public.account_login_rate_limits.blocked_until > v_now
                then public.account_login_rate_limits.blocked_until
            when public.account_login_rate_limits.limit_type = 'username'
                 and public.account_login_rate_limits.blocked_until is null
                 and public.account_login_rate_limits.attempt_count + 1 >= p_max_attempts
                then v_now + make_interval(secs => 600 + floor(random() * 601)::integer)
            else null
        end,
        limit_type = 'username',
        updated_at = v_now
    returning attempt_count, blocked_until
    into v_attempt_count, v_blocked_until;

    with expired as (
        select bucket_key
        from public.account_login_rate_limits
        where updated_at < v_now - interval '1 day'
        order by updated_at
        limit 100
    )
    delete from public.account_login_rate_limits
    where bucket_key in (select bucket_key from expired)
      and bucket_key <> p_bucket_key;

    if v_attempt_count >= p_max_attempts and v_blocked_until is not null then
        return ceil(extract(epoch from (v_blocked_until - clock_timestamp())))::integer;
    end if;
    return 0;
end;
$$;

create or replace function public.reset_account_login_failures(
    p_bucket_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
    if p_bucket_key is null or char_length(p_bucket_key) > 128 then
        raise exception 'Invalid login lockout key';
    end if;
    delete from public.account_login_rate_limits
    where bucket_key = p_bucket_key
      and limit_type = 'username';
end;
$$;

drop function if exists public.consume_account_login_rate_limit(text[], integer[], integer);

create table if not exists public.account_email_verification_codes (
    purpose text not null check (purpose in ('registration', 'password_reset', 'email_update')),
    email_hash text not null,
    subject_hash text not null,
    code_hash text,
    attempts integer not null default 0 check (attempts >= 0),
    expires_at timestamptz,
    send_window_started_at timestamptz not null default now(),
    sends_in_window integer not null default 0 check (sends_in_window >= 0),
    last_sent_at timestamptz,
    primary key (purpose, email_hash)
);

alter table public.account_email_verification_codes
    drop constraint if exists account_email_verification_codes_purpose_check;
alter table public.account_email_verification_codes
    add constraint account_email_verification_codes_purpose_check
    check (purpose in ('registration', 'password_reset', 'email_update'));

create index if not exists account_email_verification_codes_expires_at_idx
    on public.account_email_verification_codes (expires_at);

create or replace function public.save_account_email_code(
    p_purpose text,
    p_email_hash text,
    p_subject_hash text,
    p_code_hash text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_now timestamptz := clock_timestamp();
    v_row public.account_email_verification_codes%rowtype;
begin
    if p_purpose not in ('registration', 'password_reset', 'email_update')
       or p_email_hash is null or char_length(p_email_hash) <> 64
       or p_subject_hash is null or char_length(p_subject_hash) <> 64
       or p_code_hash is null or char_length(p_code_hash) <> 64 then
        raise exception 'Invalid email verification input';
    end if;

    insert into public.account_email_verification_codes (purpose, email_hash, subject_hash)
    values (p_purpose, p_email_hash, p_subject_hash)
    on conflict (purpose, email_hash) do nothing;

    select * into v_row
    from public.account_email_verification_codes
    where purpose = p_purpose and email_hash = p_email_hash
    for update;

    if v_row.last_sent_at > v_now - interval '60 seconds' then
        return greatest(
            1,
            ceil(extract(epoch from (v_row.last_sent_at + interval '60 seconds' - v_now)))::integer
        );
    end if;

    if v_row.send_window_started_at > v_now - interval '1 hour'
       and v_row.sends_in_window >= 5 then
        return greatest(
            1,
            ceil(extract(epoch from (v_row.send_window_started_at + interval '1 hour' - v_now)))::integer
        );
    end if;

    update public.account_email_verification_codes
    set subject_hash = p_subject_hash,
        code_hash = p_code_hash,
        attempts = 0,
        expires_at = v_now + interval '10 minutes',
        send_window_started_at = case
            when send_window_started_at <= v_now - interval '1 hour' then v_now
            else send_window_started_at
        end,
        sends_in_window = case
            when send_window_started_at <= v_now - interval '1 hour' then 1
            else sends_in_window + 1
        end,
        last_sent_at = v_now
    where purpose = p_purpose and email_hash = p_email_hash;

    delete from public.account_email_verification_codes
    where expires_at < v_now - interval '1 day';

    return 0;
end;
$$;

create or replace function public.consume_account_email_code(
    p_purpose text,
    p_email_hash text,
    p_subject_hash text,
    p_code_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_row public.account_email_verification_codes%rowtype;
begin
    if p_purpose not in ('registration', 'password_reset', 'email_update')
       or p_email_hash is null or char_length(p_email_hash) <> 64
       or p_subject_hash is null or char_length(p_subject_hash) <> 64
       or p_code_hash is null or char_length(p_code_hash) <> 64 then
        raise exception 'Invalid email verification input';
    end if;

    select * into v_row
    from public.account_email_verification_codes
    where purpose = p_purpose and email_hash = p_email_hash
    for update;

    if not found or v_row.subject_hash <> p_subject_hash
       or v_row.expires_at is null or v_row.expires_at <= clock_timestamp()
       or v_row.attempts >= 5 then
        return false;
    end if;

    if v_row.code_hash = p_code_hash then
        delete from public.account_email_verification_codes
        where purpose = p_purpose and email_hash = p_email_hash;
        return true;
    end if;

    update public.account_email_verification_codes
    set attempts = attempts + 1
    where purpose = p_purpose and email_hash = p_email_hash;
    return false;
end;
$$;

create table if not exists public.math_assignments (
    id uuid primary key default gen_random_uuid(),
    title text not null check (char_length(title) between 1 and 120),
    description text not null check (char_length(description) between 1 and 10000),
    created_by uuid not null references public.account_users (id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.math_assignments
    add column if not exists assignment_type text not null default 'written';
alter table public.math_assignments
    add column if not exists quiz_questions jsonb not null default '[]'::jsonb;
alter table public.math_assignments
    drop constraint if exists math_assignments_assignment_type_check;
alter table public.math_assignments
    add constraint math_assignments_assignment_type_check
    check (assignment_type in ('multiple_choice', 'written', 'mixed'));
alter table public.math_assignments
    drop constraint if exists math_assignments_quiz_questions_array_check;
alter table public.math_assignments
    add constraint math_assignments_quiz_questions_array_check
    check (jsonb_typeof(quiz_questions) = 'array');

create index if not exists math_assignments_created_at_idx
    on public.math_assignments (created_at desc);

create table if not exists public.math_library_lessons (
    id uuid primary key default gen_random_uuid(),
    icon text not null check (char_length(icon) between 1 and 32),
    tag text not null check (char_length(tag) between 1 and 40),
    title text not null check (char_length(title) between 1 and 120),
    description text not null check (char_length(description) between 1 and 500),
    search_key text not null check (char_length(search_key) between 1 and 1000),
    introduction text not null check (char_length(introduction) between 1 and 3000),
    sections jsonb not null check (jsonb_typeof(sections) = 'array'),
    sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
    timeline_year text not null check (char_length(timeline_year) between 1 and 40),
    created_by uuid references public.account_users (id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists math_library_lessons_created_at_idx
    on public.math_library_lessons (created_at asc);

create table if not exists public.math_submissions (
    id uuid primary key default gen_random_uuid(),
    assignment_id uuid not null references public.math_assignments (id) on delete cascade,
    student_id uuid not null references public.account_users (id) on delete cascade,
    answer text not null check (char_length(answer) between 1 and 10000),
    teacher_feedback text,
    auto_score numeric(5, 2),
    auto_max_score numeric(5, 2),
    reviewed_by uuid references public.account_users (id),
    submitted_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (assignment_id, student_id)
);

alter table public.math_submissions
    add column if not exists auto_score numeric(5, 2);
alter table public.math_submissions
    add column if not exists auto_max_score numeric(5, 2);
alter table public.math_submissions
    add column if not exists auto_feedback jsonb not null default '[]'::jsonb;
alter table public.math_submissions
    add column if not exists teacher_score numeric(5, 2);

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
    delete from public.account_deletion_requests
    where target_user_id = p_user_id
       or requested_by = p_user_id
       or reviewed_by = p_user_id;
    delete from public.account_users where id = p_user_id;
end;
$$;

create or replace function public.delete_account_users(p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    user_id uuid;
begin
    if coalesce(array_length(p_user_ids, 1), 0) = 0 then
        raise exception 'Hãy chọn ít nhất một tài khoản.';
    end if;
    if cardinality(p_user_ids) <> (
        select count(distinct selected.selected_id)
        from unnest(p_user_ids) as selected(selected_id)
    ) then
        raise exception 'Danh sách tài khoản có phần tử trùng lặp.';
    end if;

    perform pg_advisory_xact_lock(638274, 1);
    foreach user_id in array p_user_ids loop
        perform public.delete_account_user(user_id);
    end loop;
end;
$$;

create or replace function public.update_account_users(
    p_user_ids uuid[],
    p_role text,
    p_is_locked boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    selected_count integer;
    matching_count integer;
begin
    if coalesce(array_length(p_user_ids, 1), 0) = 0 then
        raise exception 'Hãy chọn ít nhất một tài khoản.';
    end if;
    if cardinality(p_user_ids) <> (
        select count(distinct selected.selected_id)
        from unnest(p_user_ids) as selected(selected_id)
    ) then
        raise exception 'Danh sách tài khoản có phần tử trùng lặp.';
    end if;
    if p_role is null and p_is_locked is null then
        raise exception 'Chọn vai trò hoặc trạng thái khóa cần thay đổi.';
    end if;
    if p_role is not null and p_role not in (
        'student', 'teacher', 'admin', 'super_admin'
    ) then
        raise exception 'Vai trò được chọn không hợp lệ.';
    end if;

    perform pg_advisory_xact_lock(638274, 1);
    select count(*) into selected_count
    from public.account_users
    where id = any(p_user_ids);
    if selected_count <> cardinality(p_user_ids) then
        raise exception 'Một hoặc nhiều tài khoản không còn tồn tại.';
    end if;

    if exists (
        select 1 from public.account_users
        where id = any(p_user_ids) and is_root_admin
    ) then
        raise exception 'Không thể chỉnh sửa hàng loạt tài khoản super admin gốc.';
    end if;

    if p_role is not null and p_role <> 'super_admin' then
        select count(*) into matching_count
        from public.account_users
        where role = 'super_admin' and is_locked = false
          and id <> all(p_user_ids);
        if matching_count = 0 then
            raise exception 'Không thể tước quyền super admin đang hoạt động cuối cùng.';
        end if;
    end if;

    if p_is_locked is true then
        select count(*) into matching_count
        from public.account_users
        where role = 'super_admin' and is_locked = false
          and id <> all(p_user_ids);
        if matching_count = 0 then
            raise exception 'Không thể khóa super admin đang hoạt động cuối cùng.';
        end if;
    end if;

    update public.account_users
    set role = coalesce(p_role, role),
        is_locked = coalesce(p_is_locked, is_locked)
    where id = any(p_user_ids);
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

create table if not exists public.account_ai_usage (
    user_id uuid primary key references public.account_users (id) on delete cascade,
    window_started_at timestamptz not null default now(),
    used_count integer not null default 0 check (used_count >= 0),
    bonus_count integer not null default 0 check (bonus_count >= 0),
    unlimited boolean not null default false,
    updated_at timestamptz not null default now()
);

create or replace function public.get_account_ai_usage(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_usage public.account_ai_usage%rowtype;
    v_is_super_admin boolean;
begin
    insert into public.account_ai_usage (user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;

    select * into v_usage
    from public.account_ai_usage
    where user_id = p_user_id
    for update;

    select is_root_admin into v_is_super_admin
    from public.account_users
    where id = p_user_id;
    v_is_super_admin := coalesce(v_is_super_admin, false);

    if v_usage.window_started_at <= now() - interval '10 minutes' then
        update public.account_ai_usage
        set window_started_at = now(),
            used_count = 0,
            updated_at = now()
        where user_id = p_user_id
        returning * into v_usage;
    end if;

    return jsonb_build_object(
        'limit', 20,
        'used', v_usage.used_count,
        'bonus', v_usage.bonus_count,
        'remaining', greatest(0, 20 - v_usage.used_count) + v_usage.bonus_count,
        'unlimited', v_usage.unlimited or v_is_super_admin,
        'privileged', v_is_super_admin,
        'reset_at', v_usage.window_started_at + interval '10 minutes'
    );
end;
$$;

create or replace function public.consume_account_ai_usage(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_usage jsonb;
    v_unlimited boolean;
    v_remaining integer;
begin
    v_usage := public.get_account_ai_usage(p_user_id);
    v_unlimited := (v_usage ->> 'unlimited')::boolean;
    v_remaining := (v_usage ->> 'remaining')::integer;

    if not v_unlimited and v_remaining <= 0 then
        return v_usage || jsonb_build_object('allowed', false);
    end if;

    if not v_unlimited then
        update public.account_ai_usage
        set used_count = case
                when used_count < 20 then used_count + 1
                else used_count
            end,
            bonus_count = case
                when used_count >= 20 then bonus_count - 1
                else bonus_count
            end,
            updated_at = now()
        where user_id = p_user_id;
    end if;

    v_usage := public.get_account_ai_usage(p_user_id);
    return v_usage || jsonb_build_object('allowed', true);
end;
$$;

create or replace function public.manage_account_ai_usage(
    p_user_id uuid,
    p_action text,
    p_amount integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
    insert into public.account_ai_usage (user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;

    if p_action = 'unlimited' then
        update public.account_ai_usage
        set unlimited = true, updated_at = now()
        where user_id = p_user_id;
    elsif p_action = 'limited' then
        update public.account_ai_usage
        set unlimited = false, updated_at = now()
        where user_id = p_user_id;
    elsif p_action = 'reset' then
        update public.account_ai_usage
        set window_started_at = now(),
            used_count = 0,
            bonus_count = 0,
            unlimited = false,
            updated_at = now()
        where user_id = p_user_id;
    elsif p_action = 'add' and p_amount between 1 and 1000000 then
        update public.account_ai_usage
        set bonus_count = bonus_count + p_amount,
            updated_at = now()
        where user_id = p_user_id;
    else
        raise exception 'Thao tác hoặc số lượt AI không hợp lệ.';
    end if;

    return public.get_account_ai_usage(p_user_id);
end;
$$;

-- API server dùng service_role; trình duyệt không được truy cập trực tiếp các bảng này.
alter table public.account_users enable row level security;
alter table public.account_sessions enable row level security;
alter table public.account_login_rate_limits enable row level security;
alter table public.account_email_verification_codes enable row level security;
alter table public.account_ai_usage enable row level security;
alter table public.math_assignments enable row level security;
alter table public.math_submissions enable row level security;
alter table public.math_library_lessons enable row level security;
alter table public.account_deletion_requests enable row level security;

revoke all on public.account_users from public, anon, authenticated;
revoke all on public.account_sessions from public, anon, authenticated;
revoke all on public.account_login_rate_limits from public, anon, authenticated;
revoke all on public.account_email_verification_codes from public, anon, authenticated;
revoke all on public.account_ai_usage from public, anon, authenticated;
revoke all on public.math_assignments from public, anon, authenticated;
revoke all on public.math_submissions from public, anon, authenticated;
revoke all on public.math_library_lessons from public, anon, authenticated;
revoke all on public.account_deletion_requests from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete
    on public.account_users, public.account_sessions,
       public.account_email_verification_codes,
       public.account_ai_usage,
       public.math_assignments, public.math_submissions,
       public.math_library_lessons,
       public.account_deletion_requests
    to service_role;
revoke all on function public.delete_account_user(uuid) from public, anon, authenticated;
revoke all on function public.delete_account_users(uuid[]) from public, anon, authenticated;
revoke all on function public.update_account_users(uuid[], text, boolean)
    from public, anon, authenticated;
revoke all on function public.resolve_account_deletion_request(uuid, uuid, boolean)
    from public, anon, authenticated;
revoke all on function public.check_account_login_lockout(text)
    from public, anon, authenticated;
revoke all on function public.record_account_login_failure(text, integer)
    from public, anon, authenticated;
revoke all on function public.reset_account_login_failures(text)
    from public, anon, authenticated;
revoke all on function public.save_account_email_code(text, text, text, text)
    from public, anon, authenticated;
revoke all on function public.consume_account_email_code(text, text, text, text)
    from public, anon, authenticated;
revoke all on function public.get_account_ai_usage(uuid)
    from public, anon, authenticated;
revoke all on function public.consume_account_ai_usage(uuid)
    from public, anon, authenticated;
revoke all on function public.manage_account_ai_usage(uuid, text, integer)
    from public, anon, authenticated;
grant execute on function public.delete_account_user(uuid) to service_role;
grant execute on function public.delete_account_users(uuid[]) to service_role;
grant execute on function public.update_account_users(uuid[], text, boolean)
    to service_role;
grant execute on function public.resolve_account_deletion_request(uuid, uuid, boolean)
    to service_role;
grant execute on function public.check_account_login_lockout(text)
    to service_role;
grant execute on function public.record_account_login_failure(text, integer)
    to service_role;
grant execute on function public.reset_account_login_failures(text)
    to service_role;
grant execute on function public.save_account_email_code(text, text, text, text)
    to service_role;
grant execute on function public.consume_account_email_code(text, text, text, text)
    to service_role;
grant execute on function public.get_account_ai_usage(uuid) to service_role;
grant execute on function public.consume_account_ai_usage(uuid) to service_role;
grant execute on function public.manage_account_ai_usage(uuid, text, integer)
    to service_role;
