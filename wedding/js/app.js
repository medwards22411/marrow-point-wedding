import { RsvpBook } from "./rsvp-book.js";
import { EventPage } from "./event-page.js";

/**
 * Starts the event page. index.html loads this module.
 *
 * App.page is the running page. The assistant's actions and its confirmation dialog use
 * it too, so they share the page's RSVP form and answers.
 */
export class App {
  /** The running event page, set when this module loads. */
  static page = null;

  /**
   * Create the RSVP book and connect it to the page.
   *
   * :param doc: the page's document
   * :return: the running page
   */
  static start(doc) {
    const page = new EventPage(doc, new RsvpBook());
    page.start();
    return page;
  }
}

App.page = App.start(document);
