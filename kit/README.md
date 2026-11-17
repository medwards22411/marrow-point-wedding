# Agentic Event Site Kit

Make a wedding, birthday or reunion website with a guest concierge, from one file.

You write `event.json`: the hosts, the date, the schedule, the menu, the FAQ, the
invitations, and the local businesses guests might need. The kit turns it into a static
website that follows the [Open Agentic Web](https://github.com/cognizant-ai-labs/agentic-web)
spec (MVP Profile 0.2):

- an event page with the schedule, travel, partner cards, an RSVP form and the FAQ;
- a guest concierge that answers from the page's own data, fills in or sends an RSVP
  (the guest confirms first), and asks partner sites' own agents for help, after the
  guest agrees on a card;
- a no-key mode: in Chrome, the concierge runs on the browser's built-in AI, so guests
  can use it without an account or an API key;
- the published agent network, manifest and discovery files, so other agentic sites can
  call the event's concierge too.

## Make a site

```bash
node kit/make-event-site.mjs kit/examples/birthday.event.json out/ruth-80
node tools/agentify-website/scripts/serve_site.mjs out/ruth-80 --port 8080
```

The kit checks `event.json` first and lists every problem at once (a missing date, an
invitation code with the wrong prefix, a partner with no https network URL). Then it
copies the site, writes `<slug>.hocon`, `agent-manifest.json` and `links.json`, and runs
the spec's own build and validator. A site that does not pass is not written as done.

Two examples:

| File | Event | Shows |
|---|---|---|
| `wedding/event.json` | Nora & Theo's wedding weekend | invite-only events, a shuttle, a children's meal, plus-ones, three partner sites |
| `kit/examples/birthday.event.json` | Ruth turns 80 | a one-day party with no shuttle and no partners |

## event.json at a glance

| Field | What it is |
|---|---|
| `slug` | The network name, such as `smith_jones_wedding`. The network URL is `<site>/<slug>`. |
| `kind`, `hosts`, `title`, `eyebrow` | How the page and the concierge name the event. |
| `date`, `rsvpDeadline`, `place`, `contactEmail` | The basics. RSVPs close after the deadline day. |
| `events` | The schedule. `main` events come with saying yes; `optional` ones are ticked on the RSVP; `inviteOnly` ones only for invitations that list them in `inviteOnlyEvents`. |
| `shuttle` | Stop, times and a note, or `null`. |
| `meals` | Dinner choices. `childrenOnly` meals are offered only to guests marked `child`. |
| `faq` | Questions and answers. The concierge reads them; ids `airport` and `parking` also fill the travel section. |
| `partners` | Local businesses with agentic sites: `name`, `url` (their page), `network` (their agent network URL), `topic` (what to ask them about), `note`, and optional `keywords` (words in a guest's question that make this partner relevant; used by the no-key mode, defaults to the topic's words). |
| `invitations` | Code, last name, guests (with `child`), `plusOne`, `inviteOnlyEvents`. |
| `sampleQueries` | Four to six questions for the chat, one the site cannot do. |
| `theme.primary` | The main color. |

## Hosting

Any static host. The kit writes a Netlify `_headers` file with the headers the spec asks
for: CORS on the public agent files and a Content-Security-Policy on the sandbox worker.
`firebase.json` at the project root shows the same headers for Firebase Hosting.

## What stays the same for every event

The page (`index.html`, `styles.css`, `js/`), the site actions (`site-actions.js`), the
confirmation dialogs and no-key mode (`site.js`, `js/on-device-ai.js`) and the browser
runtime are shared. The RSVP rules live in one place (`js/rsvp-book.js`), used by both the
page's own form and the concierge, so the two can never disagree.
