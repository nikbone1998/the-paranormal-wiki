# Paranormal Wiki Forum Backend

Dedicated Supabase project: `Paranormal Wiki Forum` (`waqobihznhkbspdchjbb`). This backend is intentionally separate from other user projects and from the canonical 913-entity archive data.

## Public forum tables

- `forum_profiles` — public usernames, display names, bios, role badge, timestamps.
- `forum_categories` — seeded forum boards.
- `forum_threads` — discussion metadata, pin/lock/moderation state.
- `forum_posts` — opening posts and replies.
- `forum_reactions` — per-user post reactions.
- `forum_bookmarks` — private per-user saved discussions.
- `forum_reports` — member reports plus staff resolution metadata.
- `forum_entity_links` — forum discussion links to canonical archive entity IDs/names.

## Private moderation tables

- `forum_member_restrictions` — suspension state and reason. RLS permits staff reads only.
- `forum_moderation_actions` — immutable-style staff action audit trail. RLS permits staff reads only.

## Roles

`member`, `moderator`, `admin`.

The browser cannot set or change its own role. Role changes must use `forum_set_role`, which requires an existing admin session.

## Server-enforced write paths

Direct authenticated INSERT access to threads, posts, entity links, and reports is revoked. These actions must pass through database RPC functions so rate limits, suspension checks, ownership checks, and moderation state checks cannot be bypassed by editing browser JavaScript.

- `forum_create_thread(...)`
- `forum_create_post(...)`
- `forum_submit_report(...)`

### Current rate limits

- New threads: maximum 3 per member per rolling 5 minutes.
- Replies/posts: maximum 6 per member per rolling minute.
- Reports: maximum 5 per member per rolling 10 minutes.

Limits are enforced in PostgreSQL, not only in the UI.

## Staff RPCs

Every staff RPC checks `auth.uid()` and the caller's current server-side role.

- `forum_moderate_thread` — pin, unpin, lock, unlock, hide, restore.
- `forum_moderate_post` — hide or restore.
- `forum_suspend_member` — moderators may suspend members; admins are required for staff targets. Admin accounts cannot be suspended through this RPC.
- `forum_unsuspend_member`
- `forum_set_role` — admin only.
- `forum_resolve_report` — resolve/dismiss moderation reports.

Each moderation action writes an entry to `forum_moderation_actions`.

## Row-level security

All forum tables have RLS enabled.

- Guests may read visible categories, threads, posts, public profiles, reactions, and entity links.
- Hidden content remains readable to moderator/admin sessions for review.
- Members can read/write only their own bookmarks.
- Members can read their own reports; staff can read all reports.
- Public users cannot read suspension records or moderation audit records.
- Profile self-updates are column-limited to display name, bio, and avatar URL. A member cannot update their own `role` column.
- Thread/post author edits are column-limited; system moderation fields are not writable through normal member updates.

## Search

`pg_trgm` indexes are enabled for forum thread titles and post bodies so the forum search UI can scale beyond a small number of discussions.

## Supabase migration history

- `20260907113313 forum_v2_moderation_and_rate_limits`
- `20260907113403 forum_v2_staff_visibility`
- `20260907113740 forum_v2_harden_function_execute_privileges`
- `20260907113828 forum_v2_consolidate_read_policies`
- `20260907113921 forum_v2_search_indexes`

The original v1 tables, seed categories, triggers, and RLS baseline predate the tracked v2 migrations in this project and should be treated as the current database baseline when reconstructing from scratch.

## Important separation rule

Community posts and user-submitted sightings are never automatically promoted to canonical Paranormal Wiki research. `forum_entity_links` create navigational relationships only. Editorial review must remain a separate process before any forum claim is incorporated into an archive dossier.
