import { RideBook } from "./ride-book.js";
import { RidePage } from "./ride-page.js";

/**
 * Starts the Harborline Cabs page. index.html loads this module.
 *
 * App.page is the running page. The assistant's actions and its confirmation
 * dialog use it too, so they share the page's rides and forms.
 */
export class App {
  /** The running ride page, set when this module loads. */
  static page = null;

  /**
   * Create the ride book and connect it to the page.
   *
   * :param doc: the page's document
   * :return: the running ride page
   */
  static start(doc) {
    const page = new RidePage(doc, new RideBook());
    page.start();
    return page;
  }
}

App.page = App.start(document);
