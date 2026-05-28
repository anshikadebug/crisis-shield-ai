# Crisis Shield AI Free Setup

The app works immediately in local demo mode. To make reports sync online for a hackathon demo, use the free tiers below.

## Supabase Table

Create a free Supabase project, open the SQL editor, and run:

```sql
create table reports (
  id bigint primary key,
  title text not null,
  issue_type text not null,
  area text not null,
  description text not null,
  latitude double precision not null,
  longitude double precision not null,
  urgency text not null,
  status text not null default 'Reported',
  upvotes int not null default 0,
  photo_url text,
  after_photo_url text,
  created_at timestamp with time zone default now()
);

alter table reports enable row level security;

create policy "Public can read reports"
on reports for select
using (true);

create policy "Public can add reports"
on reports for insert
with check (true);

create policy "Public can update report progress"
on reports for update
using (true)
with check (true);
```

Then paste your Supabase project URL and anon key into these constants in `src/app/app.component.ts`:

```ts
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';
```

## Cloudinary Uploads

Create a free Cloudinary account and an unsigned upload preset. Then paste:

```ts
const CLOUDINARY_CLOUD_NAME = '';
const CLOUDINARY_UPLOAD_PRESET = '';
```

If these are empty, Crisis Shield AI stores uploaded images locally in the browser so your demo still works offline.
