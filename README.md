# Marrow Point: an agentic wedding weekend

A wedding website whose guest concierge works with the local businesses' own AI
assistants, built on the [Open Agentic Web](https://github.com/cognizant-ai-labs/agentic-web)
spec (MVP Profile 0.2). Plus a kit that makes the same kind of site for any event from
one file.

**Live:** https://marrow-point-wedding.web.app/ (try invitation `MP-4821`, last name `Pell`)

| Site | What it is | Network URL |
|---|---|---|
| [Nora & Theo's wedding](https://marrow-point-wedding.web.app/) | Schedule, travel, RSVP, FAQ, and the guest concierge | `https://marrow-point-wedding.web.app/marrow_point_wedding` |
| [Harborline Cabs](https://harborline-cabs.web.app/) | Local cab company: fixed fares, book and cancel rides | `https://harborline-cabs.web.app/harborline_cabs` |
| [Tidewhistle Guesthouse](https://marrow-point-guesthouse.web.app/) | The spec's own example guesthouse, hosted as a partner | `https://marrow-point-guesthouse.web.app/tidewhistle_guesthouse` |
| [Marrow Point Harbor Tours](https://marrow-point-harbor-tours.web.app/) | The spec's own example tour company, hosted as a partner | `https://marrow-point-harbor-tours.web.app/marrow_point_harbor_tours` |

All people, places, businesses and codes are fictional.

## What the concierge does

- Answers from the page's own data: times, places, the shuttle, the menu, dress code,
  parking, access, the rain plan.
- Looks up an invitation, fills in the RSVP form on the page, or sends the RSVP. Sending
  opens a confirmation dialog that shows exactly what will be sent; nothing is sent
  without the guest's click.
- Asks partner sites' own agents about places to stay, harbor trips and cab rides. Each
  partner call waits for the guest to agree on a card that names the site and shows the
  question. Requests never carry names, emails or codes.
- Says plainly what it cannot do (book hotels, take payments) and points to the right
  partner instead.

## No key needed

In Chrome, the concierge runs on the browser's built-in AI (`wedding/js/on-device-ai.js`),
so anyone can try it with no account or API key, and nothing they type leaves their
device. It answers the runtime's OpenAI-style requests inside the page, in small capped
steps: choose a tool, then write its arguments with the tool's own schema as the
constraint, then answer. It works around the small model's limits and a Chrome bug
(a second constrained prompt in one session fails), caps every step's length and time
so a runaway reply cannot hold the model, and asks each partner at most once per message.
Guests who add their own key in **AI model settings** use their own provider instead.

## The Agentic Event Site Kit

`kit/make-event-site.mjs` builds a complete agentic event site from one `event.json`:
the page, the RSVP rules, the agent network, the manifest, the discovery files and the
hosting headers, then runs the spec's own validator. The wedding site here is built with
it, and `kit/examples/birthday.event.json` makes a second, different site. See
[kit/README.md](kit/README.md).

```bash
node kit/make-event-site.mjs kit/examples/birthday.event.json out/ruth-80
node tools/agentify-website/scripts/serve_site.mjs out/ruth-80 --port 8080
```

## Tests

```bash
node --test "wedding/tests/*.test.mjs"
node --test "partners/harborline-cabs/tests/*.test.mjs"
node --test "partners/guesthouse/tests/*.test.mjs"
node --test "partners/harbor-tours/tests/*.test.mjs"
```

They use the real runtime with a scripted model (no provider calls). They cover every
action, every RSVP rule, the confirmation dialogs, the consent card, and the no-key
router end to end through the runtime's own client.

## Layout

| Folder | What is in it |
|---|---|
| `wedding/` | The wedding site: `event.json`, page, actions, dialogs, no-key router, tests |
| `kit/` | The event site kit, its network template and a second example |
| `partners/harborline-cabs/` | The cab company site, written for this project |
| `partners/guesthouse/`, `partners/harbor-tours/` | Copies of the spec's examples, pointed at each other's hosted URLs |
| `tools/agentify-website/` | The spec's agentify skill and runtime, used to build and check every site |

## Hosting

Firebase Hosting, one site per origin (`firebase.json`). The public agent files are
served with `Access-Control-Allow-Origin: *`, and the runtime's sandbox worker with the
Content-Security-Policy the spec asks for.

## License

Apache 2.0. The runtime, the agentify skill and the two example partner sites come from
[cognizant-ai-labs/agentic-web](https://github.com/cognizant-ai-labs/agentic-web) (Apache 2.0).
