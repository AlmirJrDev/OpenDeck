# Cloud library setup

OpenDeck can keep your music in the cloud so any computer can download it once and
play it offline.

- **Cloudflare R2** stores the audio files (10 GB free, downloads free).
- **Supabase** stores the track list, BPM, key and cue points, and handles sign-in.
- **Vercel functions** (`api/`) check the sign-in and hand out short-lived R2 links.
  The R2 keys stay on the server.

## 1. Supabase

1. Create a project at supabase.com.
2. Open **SQL Editor**, paste [`supabase/schema.sql`](../supabase/schema.sql) and run it.
3. In **Authentication > Providers**, keep **Email** on. For a personal library you can
   turn off "Confirm email" so new accounts work right away.
4. From **Project Settings > API**, copy the **Project URL** and the **anon public** key.

## 2. Cloudflare R2

1. In the Cloudflare dashboard, open **R2** and create a bucket, for example `opendeck-music`.
2. Open **R2 > Manage API tokens** and create a token with **Object Read & Write**
   for that bucket. Copy the **Access Key ID**, the **Secret Access Key** and your **Account ID**.
3. In the bucket, open **Settings > CORS policy** and paste:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["content-length"],
    "MaxAgeSeconds": 3600
  }
]
```

The links that reach R2 are signed and expire after 15 minutes, so any origin may use them.
Replace `"*"` with your Vercel domain if you only use the web app.

## 3. Vercel

In **Project Settings > Environment Variables**, add:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key |
| `R2_ACCOUNT_ID` | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 Secret Access Key |
| `R2_BUCKET` | Bucket name |

Redeploy. The library now shows a **Cloud** row with sign-in.

## 4. Desktop app and local development

The desktop app and `npm run dev` do not serve `/api`. Create `.env.local` from
[`.env.example`](../.env.example) with the two `VITE_SUPABASE_*` values and
`VITE_API_BASE` set to your Vercel URL, then rebuild the desktop app.

## How it works

1. **Upload**: each file is identified by its SHA-256. The app asks `/api/upload-url` for
   a link, sends the file straight to R2, and saves the track row in Supabase. A file that
   is already in R2 is not sent again.
2. **Other computer**: after sign-in, the library lists every cloud track. **Download**
   stores the files in the app's local cache, checks them against their hash, and analyzes
   them. Downloaded tracks play offline.
3. **Cue points**: hot cues and the cue point are saved to Supabase about a second after
   they change, and come back when the track loads on any computer.
