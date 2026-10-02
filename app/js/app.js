/* Start the app: every screen is registered by js/screens/*.js. */
APP.start();
setTimeout(() => APP.checkUpdate(), 1500);              // after the first screen is up; quietly does nothing offline                                             // each screen waits for its data and shows a spinner meanwhile
