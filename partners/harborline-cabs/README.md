# Harborline Cabs, agentified

A small website for **Harborline Cabs**, a fictional cab company in the harbor town of
Marrow Point. It's a partner site for the Marrow Point wedding site. The page lists
fixed fares, the cars and the booking terms. Visitors can book a ride, see the fare
before they book, and look up or cancel a ride under **Manage my ride**.

The page has an assistant built in. It runs in the visitor's browser, uses the visitor's
own LLM API key, answers from the site's real data, and acts by calling the same
functions the page's own forms and buttons use. It was built with the agentify-website
skill (`tools/agentify-website/`). The site is plain HTML, CSS and JavaScript modules,
with no dependencies and no build step.

Everything here is fictional: the business, its address (3 Harbor Street), phone
555-0188, rides@example.com, the riders and the places.

## Run it

From the project root (the folder that holds `partners/` and `tools/`), run:

```shell
node tools/agentify-website/scripts/serve_site.mjs partners/harborline-cabs --port 8797
```

Then open http://127.0.0.1:8797/. Use the local server rather than opening `index.html`
from disk, because browsers don't run JavaScript modules from `file://` pages. The
skill's server also sends the CORS header on the public files, so other agent sites can
call this one.

## Try it

1. Under **Book a ride**, choose where you're going from and to, a pick-up date and time,
   the passengers, child seats and the car. The fare box prices the ride line by line as
   you go, or says what it still needs.
2. Add your name and phone (and notes, if you like), then select **Book this ride** to get
   a booking code. Nothing is paid online: riders pay the driver by card or cash.
3. Under **Manage my ride**, enter the code and last name to see the ride and cancel it.
   To try it without booking first, use the demo ride **`HC-4TQ8`** with last name
   **`Pell`**. It's 21 days from today at 10:30, Marrow Point to the airport, so it can
   still be cancelled for free.
4. Under **Ask Harborline Cabs**, open **⚙ AI model settings**, paste your own API key
   for the default router (hosted Otari, `https://api.otari.ai/api/v1`, with
   `alibaba/qwen3.8-flash`) or choose another provider, and select **Save and start**.
   Then try one of the sample queries below. The browser asks you to confirm before the
   assistant books or cancels anything. On `127.0.0.1` the runtime also keeps the key in a
   cookie that other local sites can read, so use a key with a low spending limit.
   Afterwards, select **Delete setup** under **Advanced settings (optional)** and close
   the tab: the tab keeps using the key until it is closed.

The assistant sends your messages, and the page data it reads, to the LLM provider you
choose. Rides stay in page memory: refreshing the page clears new bookings and
cancellations and restores the existing rides.

## Business rules

- **Routes and fixed fares** (standard car, either direction): within Marrow Point $12,
  Marrow Point and Linden Falls $26, Marrow Point and Port Hollis airport (PHL-X, about
  50 minutes) $68, Linden Falls and the airport $74. Rides within Linden Falls or within
  the airport are not driven.
- **Cars:** standard (up to 4 passengers), large (up to 6, $10 extra per ride) and one
  wheelchair-accessible van (up to 4, no extra charge).
- **Night surcharge:** $6 for pick-ups from 22:00 up to 05:59.
- **Child seats:** free, up to 2 per ride, each needing a passenger.
- **Booking window:** pick-ups every 15 minutes, at least 2 hours and at most 90 days ahead.
- **Van availability:** the van takes one ride per clock hour. On weekdays it is out on
  clinic runs from 08:00 to 09:00 and 15:00 to 16:00, and it is busy in any hour where
  another ride has it. A refusal names the nearest free hours that day.
- **Cancellation:** free up to 2 hours before pick-up, online with code and last name.
  After that, riders call dispatch.
- **Not offered:** online payment, hotels or tours, live cab tracking, a particular
  driver, shared rides with strangers. The assistant says so plainly.

## Actions the assistant can call

Each action wraps a method of the running page (`App.page` in `js/app.js`). The page's
own forms and buttons call the same methods, so both follow one set of rules.

| Action | Effect | What it does | Wraps |
| --- | --- | --- | --- |
| `get_cab_info` | read | Zones, fares, cars, terms, today's date and time, the booking window, the page's facts (with link hrefs), the ride in the booking form, the latest ride booked in this tab and the ride Manage my ride shows. No other riders' rides. | `readState()` |
| `quote_ride` | read | Prices a ride line by line and checks it can be booked (route, window, time slot, party size, child seats, van hour). Changes nothing. | `quoteRide()` |
| `fill_ride_form` | write | Puts a ride in the booking form and shows its fare. Keeps the visitor's name, phone and notes. Does not book. | `fillDraft()` |
| `look_up_ride` | read | Finds a ride by code and last name, with whether it can still be cancelled for free. | `lookUpRide()` |
| `book_ride` | irreversible | Books a ride after the visitor confirms in a dialog that shows the pick-up, route, passengers, car, child seats, fare, free-cancellation deadline, name, phone and notes. | `placeRide()` (dialog: `checkBooking()`) |
| `cancel_ride` | irreversible | Cancels a ride after the visitor confirms. If the ride can't be cancelled for free, no dialog opens and the agent gets the site's reason. | `cancelRide()` (dialog: `checkCancel()`) |

A refusal is `{ok: false, reason, field, errors}`, and it changes nothing. The `read` and
`write` actions run without a dialog. Only the two `irreversible` actions ask first.

## The agent network

- **Network:** `harborline_cabs`, with one agent, the front agent `harborline_dispatcher`.
  It owns every `website_*` tool and calls no partner sites (`allowed_peers` is empty).
- **Network URL once hosted:** `https://harborline-cabs.web.app/harborline_cabs`.
  Locally, it's `http://127.0.0.1:8797/harborline_cabs`.
- **Other agent sites** that call this network run it in their visitor's browser with
  none of this site's functions. Its first sentence says what Harborline Cabs offers:
  cab rides around Marrow Point and to and from Port Hollis airport. For fares,
  availability and bookings, it points to this page.

Sample queries:

- What does a cab from Marrow Point to Port Hollis airport cost, and is there a night surcharge?
- Is the wheelchair-accessible van free three weeks from today at 2:30 pm for a ride from Linden Falls into Marrow Point?
- Put a large car for 5 passengers from Marrow Point to Linden Falls in the booking form for two weeks from today at 7:30 pm.
- Book a standard car for two from 14 Quay Lane to Port Hollis airport departures two weeks from today at 6:00 am. I'm Sam Ortiz, phone 555-0123.
- Can I still cancel ride HC-4TQ8 under the last name Pell for free?
- Can you track my cab on a map and let me pay for it online now? (The assistant declines.)

## Build and test

From the project root:

```shell
node tools/agentify-website/scripts/build_network.mjs partners/harborline-cabs/harborline_cabs.hocon --manifest partners/harborline-cabs/agent-manifest.json
node tools/agentify-website/scripts/build_network.mjs partners/harborline-cabs/harborline_cabs.hocon --manifest partners/harborline-cabs/agent-manifest.json --check
node --test "partners/harborline-cabs/tests/*.test.mjs"
```

The build turns the `.hocon` file into `harborline_cabs.network.json` and writes the
discovery files and `bridge/`. Change the `.hocon` or the manifest and rebuild; never
edit the generated files by hand.

The tests use the real runtime and page code, with a DOM stand-in and a scripted model,
and call no LLM provider. They pin the clock to Tue, Nov 17, 2026 at 09:00 with
`Calendar.fixedToday` and `Calendar.fixedTime` (`js/calendar.js`). `Calendar.now()` is
the only place the site reads the clock.

## Hosting

Serve `agent-manifest.json`, `harborline_cabs.network.json`, `links.json`,
`agent-mcp.json`, `.well-known/nsdeploy.json` and `.well-known/nsdeploy-agent.json` with
`Access-Control-Allow-Origin: *`. Serve `runtime/sandbox-worker.js` with
`Content-Security-Policy: default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'`.
Don't send `X-Frame-Options` or `frame-ancestors` for `bridge/`. See "Static hosting" in
`tools/agentify-website/references/bundle_and_hosting.md`.

## Files

- `index.html`: fares, cars, terms, the booking form, Manage my ride and the assistant section.
- `styles.css`: the site's styles (navy and taxi yellow), with the assistant's styles at the end.
- `favicon.svg`: the site icon.
- `js/app.js`: starts the page and keeps it as `App.page`.
- `js/ride-page.js`: renders the page, connects its forms and buttons, and gives the assistant the same operations.
- `js/ride-book.js`: rides in memory, the van's hours, and quote, place, look-up and cancel.
- `js/ride-rules.js`: the booking rules and their messages.
- `js/fare-calculator.js`: fares, line by line.
- `js/ride-facts.js`: data and rides as plain JSON, with the words, dates and amounts the page shows.
- `js/cab-data.js`: zones, routes, cars, surcharge, limits, contact and the existing rides.
- `js/calendar.js`: date and time helpers, and the one place the site reads the clock.
- `site.js`: boots the assistant and shows its confirmation dialogs.
- `site-actions.js`: registers the actions the assistant can call.
- `harborline_cabs.hocon`: the agent network's source.
- `harborline_cabs.network.json`, `agent-mcp.json`, `.well-known/`: generated by the build.
- `bridge/`: the page other agent sites load in a hidden frame before they run this
  network. It shares none of this site's actions. Generated by the build.
- `agent-manifest.json`, `links.json`: the public files that describe the network.
- `runtime/`: the browser runtime, copied unchanged from the skill.
- `tests/`: Node tests, with a DOM stand-in and a scripted model.

## Limits

- It's a static demo: rides live in page memory, no cab is sent, and there's no backend.
- `write` actions (`fill_ride_form`) run without showing the visitor first.
- Callers get no `website_*` tools, so live availability and bookings stay on this page.
- The LLM provider must allow CORS. The network file, instructions included, is public.
