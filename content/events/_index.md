---
title: "Events"
slug: "events"
layout: "calendar"
description: "Upcoming events for the Austin Amateur Radio Club"
# Live ICS feed. This URL is fetched by the visitor's browser on each page
# view, so it MUST send CORS headers. The included Cloudflare Worker in
# workers/ics-proxy/ proxies the groups.io feed and adds those headers.
#
# After deploying the Worker (see workers/ics-proxy/README.md), replace this
# URL with the deployed Worker URL, e.g.
#   https://aarc-ics-proxy.<your-subdomain>.workers.dev
# or, if you bind it to a custom route,
#   https://austinhams.org/calendar/aarc.ics
#
# The raw groups.io URL is here for reference only — it will NOT work directly
# in the browser due to missing CORS headers:
#   https://austinhams.groups.io/g/main/ics/12861783/1650985384/feed.ics
ics_url: "https://aarc-ics-proxy.workers.dev/"
# Direct groups.io URL used for the "Download" / "Subscribe" buttons (no CORS
# required for a normal link click or for a calendar app subscription).
ics_subscribe_url: "https://austinhams.groups.io/g/main/ics/12861783/1650985384/feed.ics"
---

Join us at our monthly meetings, nets, classes, and special events. Subscribe to
this calendar by adding the [ICS feed]({{< param ics_subscribe_url >}}) to your
calendar app — it updates automatically.
