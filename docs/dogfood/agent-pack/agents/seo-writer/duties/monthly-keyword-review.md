---
title: Monthly keyword review
cron: "0 9 1 * *"
timezone: UTC
team:
  name: Keyword review
  summary: One writer reviews what the product is found for and drafts the next page
  roles:
    - id: drafting
      label: Drafting the next page
      skill: seo-writer
      stepTask: draft-post
---
Review what the product's pages are found for this month, pick the one search
intent the product answers best and covers worst, and draft the page for it. If the
repository holds no search data, say what you would need and stop.
