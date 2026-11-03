# Japanese private study area

This feature lives at `/japanese/` and is intentionally omitted from the public portfolio navigation.

## Why authentication is external

GitHub Pages is a static public host. A password implemented only in HTML/JavaScript would not be private because visitors could inspect the source. This app therefore uses Supabase Auth + Row Level Security (RLS).

The public repository contains the UI and review algorithm, but **does not contain the private flashcard dataset**.

## 1. Create a Supabase project

Create a project at Supabase and open **SQL Editor**.

Run:

```
docs/japanese-schema.sql
```

## 2. Create approved users

In Supabase:

**Authentication → Users → Add user**

Create your own email/password account. Add other people here only when you want to give them access.

There is deliberately no public sign-up button on the site.

For strongest control, keep public email sign-ups disabled in your Supabase Auth settings.

## 3. Configure the browser client

Open:

```
assets/js/japanese.js
```

Replace:

```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

with the Project URL and anon/publishable key from:

**Supabase → Project Settings → API**

The browser anon/publishable key is not a server secret. RLS is what protects the card data and user progress. Never put a Supabase service-role key in this repository.

## 4. Seed the first deck

Use the private SQL seed supplied separately for:

```
n1-kanji-week1-day3
```

The seed is intentionally not committed to this public repository.

## 5. URLs

Dashboard:

```
https://yeminn.com/japanese/
```

First deck:

```
https://yeminn.com/japanese/n1/kanji/week1-day3/
```

## Spaced repetition behavior

Each signed-in user has independent progress.

- **Again** → 10 minutes, resets repetition count and increases lapse count
- **Hard** → short interval
- **Good** → normal expanding interval
- **Easy** → longer interval and slightly raises ease

The algorithm is deliberately simple for the first release and can later be replaced by FSRS if desired.

## Security notes

- Study pages use `noindex,nofollow,noarchive`.
- Flashcard rows are readable only by authenticated Supabase users.
- Progress rows are readable/writable only by their owning user.
- There is no public account-registration UI.
- The repository itself remains public, so never commit private card exports or passwords.
