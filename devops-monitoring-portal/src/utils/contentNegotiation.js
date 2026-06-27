/** Browsers send Accept: text/html; probes and Prometheus scrapers typically do not. */
function wantsHtmlPage(req) {
  return (req.get('Accept') || '').includes('text/html');
}

module.exports = { wantsHtmlPage };
