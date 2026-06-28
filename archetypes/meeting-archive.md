---
title: '{{ replace .File.ContentBaseName "-" " " | title }}'
slug: '{{ .File.ContentBaseName }}'
date: '{{ .Date }}'
draft: false
type: "meeting-archive"
author: ""
categories:
  - "Meeting Archive"
# YouTube video ID (the part after v= in the URL). Required.
youtube_id: ""
# Optional: presenter name(s) for this meeting.
presenter: ""
# One or more PDF (or other) downloads. Each entry needs title + url.
# Put the PDFs in static/pdf/<this-slug>/ and link them as
# /pdf/<this-slug>/<file>.pdf (Hugo serves /static/ at the root).
downloads:
  - title: "Slide Deck"
    url: ""
    # Optional: description shown under the title
    description: ""
---

Short summary or notes about this meeting. Markdown is supported.
