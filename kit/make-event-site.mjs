#!/usr/bin/env node
// Agentic Event Site Kit: make an event website with a guest concierge from one file.
//
//   node kit/make-event-site.mjs <event.json> <output folder>
//
// The output is a static site that follows the Open Agentic Web spec (MVP Profile 0.2):
// the event page with its RSVP form, the agent network (<slug>.network.json), the
// manifest and discovery files, the browser runtime, and site actions the concierge
// uses. Partner sites listed in event.json become partner tools the concierge can ask,
// after the guest agrees. Host the folder on any static host (see the README).
//
// It touches nothing outside the output folder, and makes no network requests.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KIT = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_SITE = resolve(KIT, "../wedding");
const BUILD = resolve(KIT, "../tools/agentify-website/scripts/build_network.mjs");

/** The files and folders of the template site that every event site shares. */
const SHARED = ["index.html", "styles.css", "favicon.svg", "site.js", "site-actions.js", "js", "runtime"];

/**
 * Builds one event site from event.json.
 */
class EventSiteKit {
  /**
   * :param eventPath: the event.json to read
   * :param outDir: the folder to write the site to
   */
  constructor(eventPath, outDir) {
    this.eventPath = resolve(eventPath);
    this.outDir = resolve(outDir);
    this.event = JSON.parse(readFileSync(this.eventPath, "utf8"));
    this.errors = [];
  }

  /** Check, copy, generate and build. Exits with an error message on a problem. */
  run() {
    this.check();
    if (this.errors.length) {
      console.error(`event.json has ${this.errors.length} problem(s):\n- ${this.errors.join("\n- ")}`);
      process.exit(1);
    }
    mkdirSync(this.outDir, { recursive: true });
    if (resolve(this.outDir) !== TEMPLATE_SITE) {
      for (const name of SHARED) {
        cpSync(join(TEMPLATE_SITE, name), join(this.outDir, name), { recursive: true });
      }
    }
    if (resolve(this.eventPath) !== join(this.outDir, "event.json")) {
      writeFileSync(join(this.outDir, "event.json"), `${JSON.stringify(this.event, null, 2)}\n`);
    }
    const slug = this.event.slug;
    writeFileSync(join(this.outDir, `${slug}.hocon`), this.hocon());
    writeFileSync(join(this.outDir, "agent-manifest.json"), `${JSON.stringify(this.manifest(), null, 2)}\n`);
    writeFileSync(join(this.outDir, "links.json"), `${JSON.stringify({ version: 1, networks: { [slug]: {} } }, null, 2)}\n`);
    writeFileSync(join(this.outDir, "_headers"), this.netlifyHeaders());
    const built = spawnSync(process.execPath, [BUILD, join(this.outDir, `${slug}.hocon`), "--manifest", join(this.outDir, "agent-manifest.json")], { stdio: "inherit" });
    if (built.status !== 0) {
      process.exit(built.status || 1);
    }
    console.log(`\nDone. Try it on this machine:\n  node ${resolve(KIT, "../tools/agentify-website/scripts/serve_site.mjs")} "${this.outDir}" --port 8080`);
    console.log(`Then host the folder. The network URL is <site address>/${slug}.`);
  }

  /** Collect every problem in event.json, so the planner sees them all at once. */
  check() {
    const e = this.event;
    const need = (cond, message) => {
      if (!cond) this.errors.push(message);
    };
    need(/^[a-z][a-z0-9_]{2,40}$/.test(e.slug || ""), 'slug: lowercase letters, digits and "_", such as "smith_jones_wedding".');
    need(typeof e.hosts === "string" && e.hosts.trim(), "hosts: the names on the page, such as \"Nora & Theo\".");
    for (const key of ["date", "rsvpDeadline"]) {
      need(/^\d{4}-\d{2}-\d{2}$/.test(e[key] || ""), `${key}: a date like 2027-06-12.`);
    }
    need(e.rsvpDeadline <= e.date, "rsvpDeadline: must be on or before date.");
    need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.contactEmail || ""), "contactEmail: an email address.");
    const events = Array.isArray(e.events) ? e.events : [];
    need(events.length, "events: at least one event.");
    const ids = new Set();
    for (const item of events) {
      need(item.id && !ids.has(item.id), `events: each needs a unique id (problem: ${item.id}).`);
      ids.add(item.id);
      need(/^\d{4}-\d{2}-\d{2}$/.test(item.date || "") && /^\d{2}:\d{2}$/.test(item.start || "") && /^\d{2}:\d{2}$/.test(item.end || ""), `events.${item.id}: date YYYY-MM-DD, start and end HH:MM.`);
    }
    need(events.some((item) => item.main), "events: mark the main event(s) with \"main\": true.");
    const meals = Array.isArray(e.meals) ? e.meals : [];
    need(meals.some((meal) => !meal.childrenOnly), "meals: at least one meal for adults.");
    const prefix = e.codePrefix || "";
    const codes = new Set();
    for (const invitation of e.invitations || []) {
      need(!prefix || String(invitation.code).startsWith(`${prefix}-`), `invitations: code ${invitation.code} should start with ${prefix}-.`);
      need(!codes.has(invitation.code), `invitations: code ${invitation.code} is used twice.`);
      codes.add(invitation.code);
      need(invitation.lastName && Array.isArray(invitation.guests) && invitation.guests.length, `invitations.${invitation.code}: needs lastName and guests.`);
      for (const id of invitation.inviteOnlyEvents || []) {
        need(ids.has(id), `invitations.${invitation.code}: inviteOnlyEvents lists ${id}, which is not an event id.`);
      }
    }
    for (const partner of e.partners || []) {
      let network = null;
      try {
        network = new URL(partner.network);
      } catch {
        // Reported below.
      }
      need(network && network.protocol === "https:" && network.pathname.length > 1, `partners.${partner.name}: network must be the partner's https network URL, such as https://partner.example/partner_network.`);
      need(partner.name && partner.url && partner.topic, `partners.${partner.name}: needs name, url (its page) and topic (what to ask it about).`);
    }
    const queries = e.sampleQueries || [];
    need(queries.length >= 4 && queries.length <= 6, "sampleQueries: four to six questions guests might ask, one the site cannot do.");
  }

  /** The tool name of a partner network, from its URL's path. */
  static toolName(network) {
    return new URL(network).pathname.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9_]+/g, "_");
  }

  /** Write the network from the kit's template. */
  hocon() {
    const e = this.event;
    const partners = e.partners || [];
    const kind = e.kind || "event";
    const labels = Object.fromEntries(partners.map((partner) => [partner.network, partner.name]));
    const topics = partners.map((partner) => partner.topic);
    const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items.join(""));
    const lines = partners.map((partner) => `- For ${partner.topic}, ask ${EventSiteKit.toolName(partner.network)} what it offers and how to book. Only when the guest asks about that.`);
    const values = {
      HOSTS: e.hosts,
      KIND: kind,
      SLUG: e.slug,
      DESCRIPTION: JSON.stringify(this.description()),
      SAMPLE_QUERIES: JSON.stringify(e.sampleQueries),
      LINK_LABELS: JSON.stringify(labels),
      SITE_NAME: JSON.stringify(`${e.hosts}'s ${kind}`),
      FRONT: this.front(),
      FRONT_DESCRIPTION: JSON.stringify(`Answers guests' questions about ${e.hostsPlain || e.hosts}'s ${kind} in ${e.place}, helps them RSVP${topics.length ? `, and asks local partner sites about ${list(topics)}` : ""}.`),
      HELP_PARTNERS: topics.length ? `, and ${list(topics)} in ${e.place}` : "",
      PARTNER_LINES: lines.join("\n"),
      PARTNER_TOOLS: JSON.stringify(partners.map((partner) => partner.network)),
    };
    let text = readFileSync(join(KIT, "network.hocon.template"), "utf8");
    for (const [key, value] of Object.entries(values)) {
      text = text.split(`[[${key}]]`).join(value);
    }
    // Without partners, drop the partner rules: the build requires them only with partners.
    if (!partners.length) {
      text = text.replace(/\n {12}"partner_rules": """[\s\S]*?""",\n/, "\n").replace("\n{partner_rules}", "").replace(/\n\s*"link_labels": \{\},\n/, "\n");
    }
    return text;
  }

  /** The front agent's name. */
  front() {
    return this.event.agentName || `${this.event.kind || "event"}_concierge`;
  }

  /** One sentence for the top of the chat and other agent sites. */
  description() {
    const e = this.event;
    const topics = (e.partners || []).map((partner) => partner.topic);
    return `Ask about ${e.hostsPlain || e.hosts}'s ${e.kind || "event"} in ${e.place}, RSVP${topics.length ? `, and get help with ${topics.join(" and ")}` : ""}.`;
  }

  /** The manifest, from the template site's manifest. */
  manifest() {
    const e = this.event;
    const manifest = JSON.parse(readFileSync(join(TEMPLATE_SITE, "agent-manifest.json"), "utf8"));
    const front = this.front();
    manifest.brand = `${e.hosts}'s ${(e.kind || "event").replace(/^./, (c) => c.toUpperCase())} Concierge`;
    manifest.networks = [{
      name: e.slug,
      front_man: front,
      hocon: `./${e.slug}.network.json`,
      description: this.description(),
      tags: ["agentified-website", "events", e.kind || "event"],
      sample_queries: e.sampleQueries,
    }];
    manifest.allowed_peers = [...new Set((e.partners || []).map((partner) => new URL(partner.network).origin))];
    manifest.peer_policy.note = manifest.allowed_peers.length
      ? "Calls only the partner sites in allowed_peers, after the guest agrees, plus page-local actions."
      : "Local agents and page-local actions only.";
    manifest.agent_mcp.network = e.slug;
    manifest.agent_mcp.front_man = front;
    manifest.theme.primary = (e.theme && e.theme.primary) || manifest.theme.primary;
    manifest.linking.exports = [{ network: e.slug, front_man: front, aliases: [e.slug, front], url: e.slug }];
    // The actions site-actions.js registers, the same for every event site.
    manifest.actions.agentTools = ["get_event_info", "look_up_invitation", "fill_rsvp_form", "send_rsvp"];
    return manifest;
  }

  /** Netlify's _headers: CORS on the public agent files, a CSP on the sandbox worker. */
  netlifyHeaders() {
    const cors = ["/agent-manifest.json", `/${this.event.slug}.network.json`, "/links.json", "/agent-mcp.json", "/.well-known/nsdeploy.json", "/.well-known/nsdeploy-agent.json"];
    return `${cors.map((path) => `${path}\n  Access-Control-Allow-Origin: *`).join("\n")}\n/runtime/sandbox-worker.js\n  Content-Security-Policy: default-src 'none'; script-src blob:; connect-src 'none'; worker-src 'none'\n`;
  }
}

const [eventPath, outDir] = process.argv.slice(2);
if (!eventPath || !outDir || !existsSync(eventPath)) {
  console.error("Usage: node kit/make-event-site.mjs <event.json> <output folder>");
  process.exit(2);
}
new EventSiteKit(eventPath, outDir).run();
