# Open Agentic Web: submission kit

## Video script (your voice, about 1 min 45 s)

Record the screen in Chrome at https://marrow-point-wedding.web.app/. Read it slowly.
Each line says what to show.

1. **[Wedding page, top]**
   "This is a wedding website for Nora and Theo. Guests come here for the schedule,
   travel and the RSVP. And the questions never stop."

2. **[Scroll to Ask the concierge]**
   "So the site has a concierge. It runs on the AI built into Chrome. No account, no key,
   and nothing a guest types leaves their computer."

3. **[Type: What time should I get to the ceremony, and what do I wear?]**
   "It answers from the site's own details, so it doesn't make things up."

4. **[Type the Pell RSVP sample question. Show the form fill in.]**
   "Guests can RSVP by just saying it. It fills in the form on the page. To send it, the
   guest sees exactly what goes to the couple and clicks to confirm."

5. **[Type: I land at Port Hollis on Friday. How do I get to Marrow Point? Show the card.]**
   "Here's the part I love. The local cab company has its own site and its own assistant.
   Our concierge asks it, but only after the guest says OK on this card."

6. **[Click Allow. Show the answer with the cab company's link.]**
   "Two websites, two assistants, working together for one guest."

7. **[Show kit/README or the birthday site]**
   "And I made it reusable. Fill in one file with your event, run one command, and you get
   the whole site with its concierge. Here's the same kit making a birthday party."

8. **[Back to the wedding page]**
   "It's built on the Open Agentic Web spec, with tests for every action. Thanks for
   watching!"

Tips: the built-in AI is slow on some laptops. Record each answer, then cut the waiting
in editing. Or add a free key in AI model settings for the recording; the judges will
still have the no-key mode. Upload to YouTube as Public.

## Devpost text

**Project name:** Marrow Point: an agentic wedding weekend

**Elevator pitch (under 200 characters):**
A wedding site whose guest concierge RSVPs for you and asks local businesses' own AI
assistants for help. Runs with no key in Chrome. Plus a kit that builds one for any event.

**About the project**

### What it does
Wedding websites get the same questions over and over: what time, what to wear, where to
stay, how to get there. Nora and Theo's site has a guest concierge that answers from the
site's own data, fills in or sends the RSVP (the guest confirms first), and asks the local
businesses' own AI assistants for help: a cab company, a guesthouse and a harbor tour
company, each on its own website. Every partner call waits for the guest's OK on a card
that shows the question, and requests never carry names, emails or codes.

### No key needed
In Chrome, the concierge runs on the browser's built-in AI, so anyone can try it with no
account or API key, and nothing they type leaves their device. A small in-page router
answers the runtime's model requests on the device, in short capped steps, so the small
model calls the right tool with valid arguments. Guests with their own key can use any
provider instead.

### Built for others to use
The Agentic Event Site Kit turns one event.json into a complete agentic event site: the
page, the RSVP rules, the agent network, the manifest, discovery files and hosting
headers, then runs the spec's validator. The wedding site is built with it, and a second
example makes a birthday party site.

### How we built it
- Open Agentic Web MVP Profile 0.2: the agentify skill, its browser runtime, the network
  build and validator, check_partner.
- Plain HTML, CSS and JavaScript modules. No framework, no server.
- Four sites on Firebase Hosting, each its own origin, with CORS on the public agent files
  and a CSP on the sandbox worker.
- Harborline Cabs is a new site written for this project. The guesthouse and tour company
  are the spec's own examples, hosted live as partners.
- Over 130 tests run the real runtime with a scripted model: every action, every RSVP
  rule, the confirmation dialogs, the consent card and the no-key router.

### Challenges
The built-in model is small. It skipped lookups, invented answers, looped on tools, and
once wrote without stopping, which froze the model for every tab. Chrome also fails a
second constrained prompt in the same session. The router now runs each step in a fresh
session, caps every step's length and time, forces a tool call before a first answer,
asks each partner at most once, and falls back to plain text when a schema is refused.

### What's next
Real hosts: a planner fills in event.json for a client, and the venue, florist and cab
company each publish their own agent, so guests get one concierge that knows the whole
town.

**Built with:** javascript, html, css, firebase-hosting, chrome-built-in-ai,
gemini-nano, open-agentic-web, nsdeploy

**Links:**
- Live site: https://marrow-point-wedding.web.app/
- Network: https://marrow-point-wedding.web.app/marrow_point_wedding
- Code: https://github.com/medwards22411/marrow-point-wedding
- Video: (YouTube link)

**Screenshots to upload:** the hero, the schedule, the concierge answering, the RSVP
confirmation dialog, the partner consent card, the cab site, the birthday kit example.

**Otari:** not used (no Otari email needed).
