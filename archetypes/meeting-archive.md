---
title: '{{ replace .File.ContentBaseName "-" " " | title }}'
slug: '{{ .File.ContentBaseName }}'
date: '{{ .Date }}'
draft: false
type: "meeting-archive"
author: ""
categories:
  - "Meeting Archive"
# Cloudflare Stream video. Either the bare video UID or the full iframe src
# from Cloudflare's embed code. Required.
stream_id: ""
# Optional: override the player aspect ratio (padding-top percentage).
# Leave unset to use params.cloudflareStream.ratio from hugo.yaml.
stream_aspect: ""
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
