/**
 * Reports what a phone cannot show you.
 *
 * The inline half is deliberately written in the oldest JavaScript that will
 * do the job: no arrow functions, no template literals, no const, no fetch.
 * If the reason the app is dead on a device is that the WebView refused to
 * parse something modern, a reporter written in modern syntax dies with it and
 * reports nothing. This one survives to say so.
 *
 * It also pings once on boot and once on hydration, which separates the three
 * failures that otherwise look identical from the server: the document never
 * ran a script, the bundle never arrived, or React never mounted.
 */
const REPORTER = `
(function () {
  var sent = 0;
  function send(kind, message, source, line, stack) {
    if (sent > 12) return;
    sent++;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/client-log', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({
        kind: kind,
        message: String(message),
        source: source ? String(source) : '',
        line: line || 0,
        stack: stack ? String(stack) : '',
        ua: navigator.userAgent
      }));
    } catch (e) {}
  }

  window.__tandemReport = send;

  window.onerror = function (message, source, line, column, error) {
    send('error', message, source, line, error && error.stack);
    return false;
  };

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    send('rejection', (reason && reason.message) || reason, '', 0, reason && reason.stack);
  });

  /*
   * window.onerror does not fire for a script or stylesheet that fails to
   * load; that error only reaches the window during the capture phase, and it
   * carries the failing URL on the target rather than in a message. A silent
   * page with no reported error looks exactly like this.
   */
  window.addEventListener('error', function (event) {
    var target = event && event.target;
    if (target && target !== window && (target.src || target.href)) {
      send('resource', 'failed to load ' + (target.src || target.href), '', 0, '');
    }
  }, true);

  // What the document is actually trying to run, and whether one of those
  // chunks is reachable and looks like JavaScript rather than an error page.
  setTimeout(function () {
    var list = document.getElementsByTagName('script');
    var srcs = [];
    for (var i = 0; i < list.length; i++) if (list[i].src) srcs.push(list[i].src);

    send('scripts', srcs.length + ' external: ' + srcs.slice(0, 3).join(' | '));

    if (!srcs.length) return;
    try {
      var probe = new XMLHttpRequest();
      probe.open('GET', srcs[0], true);
      probe.onload = function () {
        send('chunk', srcs[0].split('/').pop() + ' -> HTTP ' + probe.status +
          ', ' + (probe.responseText || '').length + ' bytes, starts: ' +
          (probe.responseText || '').slice(0, 60).replace(/\s+/g, ' '));
      };
      probe.onerror = function () { send('chunk', srcs[0] + ' -> network error'); };
      probe.send();
    } catch (e) { send('chunk', 'probe threw: ' + e); }
  }, 2500);

  send('boot', 'document parsed, secure=' + (window.isSecureContext ? 'yes' : 'no') +
    ', nimiqPay=' + (typeof window.nimiqPay === 'undefined' ? 'absent' : 'present') +
    ', randomUUID=' + (window.crypto && window.crypto.randomUUID ? 'yes' : 'no'));
})();
`

/**
 * Off by default in a production build, but switchable on with
 * NEXT_PUBLIC_DEVICE_REPORTER=1 so a real device can be diagnosed against the
 * bundle it will actually run rather than only against the dev one.
 */
export function DeviceReporter() {
  const enabled =
    process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEVICE_REPORTER === '1'
  if (!enabled) return null

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: REPORTER }} />
      <HydrationPing />
    </>
  )
}

function HydrationPing() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function () {
            var tries = 0;
            var timer = setInterval(function () {
              tries++;
              var root = document.querySelector('main');
              // Report progress rather than a single verdict: a phone pulling
              // a large bundle over wifi is slow, not broken, and the two look
              // identical if you only look once.
              if (tries === 12 && !window.__tandemHydrated && window.__tandemReport) {
                window.__tandemReport('slow', 'still no hydration at 6s, waiting');
              }
              // A hydrated tree has React's own listeners attached; the cheap
              // proxy is that our own client code got far enough to say so.
              if (window.__tandemHydrated) {
                clearInterval(timer);
                if (window.__tandemReport) window.__tandemReport('hydrated', 'React mounted after ' + (tries * 500) + 'ms');
              } else if (tries === 60) {
                clearInterval(timer);
                if (window.__tandemReport) {
                  window.__tandemReport('stalled',
                    'no hydration after 30s; main=' + (root ? 'present' : 'missing') +
                    ', scripts=' + document.scripts.length);
                }
              }
            }, 500);
          })();
        `,
      }}
    />
  )
}
