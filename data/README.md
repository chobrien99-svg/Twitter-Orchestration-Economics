# Local analytics exports

Drop Raphaelle's X analytics CSVs here to seed voice samples. They are
gitignored (personal engagement data).

Expected files:

- `x_content_analytics.csv` — content export from X analytics dashboard
  (columns: Post id, Date, Post text, Post Link, Impressions, Likes,
  Engagements, Bookmarks, Shares, New follows, Replies, Reposts,
  Profile visits, Detail Expands, URL Clicks, Hashtag Clicks,
  Permalink Clicks).
- `x_overview_analytics.csv` — daily overview export (optional; not yet
  imported).

To seed voice samples from the content CSV:

```bash
npm run import-voice-samples
```

The importer picks top-performing standalone posts (not @-replies) and
inserts them into the `voice_samples` table.
