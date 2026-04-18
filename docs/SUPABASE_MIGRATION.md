# Supabase Migration Plan

This project currently uses one shared backend for all three site folders:

- `Sensual Massage Diamond`
- `Sensual Massage Elite`
- `Sensual Massage Manila`

The Manila admin panel is the content manager for the shared backend. Today that backend is Google Apps Script + Google Sheets. The target architecture is a single Supabase project that serves the same role.

## Target Architecture

- Supabase Postgres:
  - `branches`
  - `services`
  - `staff`
  - `staff_images`
  - `promos`
  - `slides`
  - `home_sections`
  - `rates`
  - `settings`
  - `bookings`
  - `admin_profiles`
- Supabase Storage:
  - one public bucket: `site-media`
- Supabase Auth:
  - Manila admin signs in with email + password
- Supabase Edge Function:
  - one function: `site-api`
  - public reads for site data
  - public booking creation
  - authenticated admin reads/writes

## Why This Fits Your Existing Structure

Your frontend already expects one backend URL for shared content:

- public pages call `?action=siteData`
- booking pages call `action=createBooking`
- Manila admin calls `adminGetData` and `adminSaveSheet`

That means you do not need three databases. You need one shared database, and each branch page filters by branch name or branch slug.

## Files Added In This Repo

- `supabase/schema.sql`
- `supabase/functions/site-api/index.ts`
- `.env.example`
- `.gitignore`

## Email Notifications Setup

The system can send email notifications when new bookings are created. To enable this:

1. **Sign up for Resend** (free tier available):
   - Go to [resend.com](https://resend.com)
   - Create an account and get your API key

2. **Add environment variables to Supabase**:
   ```
   RESEND_API_KEY=your_resend_api_key_here
   ADMIN_EMAIL=your_admin_email@example.com
   ```

3. **Verify your domain** (optional but recommended):
   - In Resend dashboard, add and verify your domain
   - Update the `from` email in the code to use your verified domain

4. **Email will be sent automatically** when customers submit bookings through any of the three sites (Diamond, Elite, Manila).

The email includes all booking details: customer info, service, therapists, costs, and booking ID.

These are the starting structure for the migration.

## Supabase Dashboard Setup

### 1. Create a Supabase project

Create one project in Supabase.

Save these values:

- Project URL
- anon key
- service role key

### 2. Run the SQL schema

In the Supabase SQL Editor, run:

- `supabase/schema.sql`

This creates the shared tables, the `site-media` bucket, and the RLS policies.

### 3. Create the admin user

In Supabase Auth:

1. Create a user for the Manila admin email
2. Set its password
3. Copy the user id

Then insert one row into `admin_profiles`:

```sql
insert into public.admin_profiles (user_id, email, display_name, is_active)
values (
  'YOUR-AUTH-USER-ID',
  'your-admin@email.com',
  'Main Admin',
  true
);
```

### 4. Create branch rows

Insert one row per site:

- `diamond`
- `elite`
- `manila`

Use those values in:

- `site_key`
- `slug`

Recommended:

```sql
insert into public.branches (site_key, slug, name, active, sort_order)
values
  ('diamond', 'diamond', 'Sensual Massage Diamond', true, 1),
  ('elite', 'elite', 'Sensual Massage Elite', true, 2),
  ('manila', 'manila', 'Sensual Massage Manila', true, 3);
```

### 5. Upload images to Storage

Use the `site-media` bucket for:

- branch logos
- therapist images
- slide images
- section images

Store either:

- public file URL in `image_url` / `logo_url`
- storage path in `image_path` / `logo_path`

For simplicity, public URLs are easiest for this project.

## Edge Function Setup

Deploy:

- `supabase/functions/site-api/index.ts`

Recommended endpoint pattern:

```text
https://YOUR-PROJECT-REF.functions.supabase.co/site-api
```

## Frontend Config Changes

After the function is deployed, update each folder's `config.js`.

Set:

- `apiBaseUrl` to your Supabase Edge Function URL
- `bookingEndpoint` to the same URL

Example:

```js
window.SITE_CONFIG = {
  businessName: "Sensual Massage Manila",
  brandLogoUrl: "assets/Sensual Massage Manila.png",
  whatsappNumber: "639000000000",
  whatsappDisplay: "+63 900 000 0000",
  apiBaseUrl: "https://YOUR-PROJECT-REF.functions.supabase.co/site-api",
  bookingEndpoint: "https://YOUR-PROJECT-REF.functions.supabase.co/site-api"
};
```

## Important Admin Refactor

The current Manila admin uses:

- plain username/password fields
- token handling from Google Apps Script

For Supabase, the correct secure replacement is:

- sign in with email + password using Supabase Auth
- store the Supabase session
- send the access token as `Authorization: Bearer <token>` to the Edge Function

The `site-api` scaffold added in this repo is already designed around bearer tokens for admin-protected calls.

That means the next code step is:

1. update `Sensual Massage Manila/admin.html` to use email login
2. update `Sensual Massage Manila/admin.js` to use Supabase Auth
3. replace the current `postAdminAction()` token flow with bearer-token requests
4. implement `adminSaveSheet` upsert/delete logic in the edge function

## Data Migration From Google Sheets

Move each current sheet into its matching table:

- `branches` -> `branches`
- `services` -> `services`
- `staff` -> `staff`
- `promos` -> `promos`
- `slides` -> `slides`
- `home_sections` -> `home_sections`
- `rates` -> `rates`
- `settings` -> `settings`
- `bookings` -> `bookings`

For `staff.image_urls`, split the lines into rows in `staff_images`.

## Recommended Branch Rules

- Diamond pages only use branch `diamond`
- Elite pages only use branch `elite`
- Manila pages only use branch `manila`
- Manila admin manages all branch rows from the same admin app

## What Is Safe To Push To GitHub

Safe:

- SQL schema
- Edge function code
- docs
- `.env.example`

Do not push:

- real Supabase keys
- service role key
- exported customer booking data

## Next Repo Step

Once your Supabase project exists, the next development step is to refactor the Manila admin and public config files to use the new endpoint.

That can be done in a follow-up pass after you have:

- Supabase project URL
- anon key
- deployed edge function URL
