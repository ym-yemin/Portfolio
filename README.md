# Ye Min Portfolio — Jekyll / GitHub Pages

This project is structured for GitHub Pages with Jekyll.

## Publish a new blog post

Create a new Markdown file inside `_posts/` using this filename pattern:

`YYYY-MM-DD-your-post-title.md`

Start the file with front matter:

```yaml
---
title: "Your post title"
date: 2026-09-01
category: "Offshore Wind"
description: "A short summary shown on the homepage."
reading_time: "5 min read"
---
```

Then write the article below the second `---` using normal Markdown.

## Local preview

If Ruby and Bundler are installed, GitHub recommends using the `github-pages` gem for a local preview. For a simple edit workflow, you can also push to GitHub and let GitHub Pages build the site.

## Contact form

Open `assets/js/main.js` and change:

```js
const CONTACT_EMAIL = "";
```

to your public email address if you want the form to open a pre-addressed email draft.

## Custom domain

The included `CNAME` file contains:

`yeminn.com`
