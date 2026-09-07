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

  send('boot', 'document parsed, secure=' + (window.isSecureContext ? 'yes' : 'no') +
    ', nimiqPay=' + (typeof window.nimiqPay === 'undefined' ? 'absent' : 'present') +
    ', randomUUID=' + (window.crypto && window.crypto.randomUUID ? 'yes' : 'no'));
})();
`

export function DeviceReporter() {
  if (process.env.NODE_ENV === 'production') return null

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
              // A hydrated tree has React's own listeners attached; the cheap
              // proxy is that our own client code got far enough to say so.
              if (window.__tandemHydrated) {
                clearInterval(timer);
                if (window.__tandemReport) window.__tandemReport('hydrated', 'React mounted after ' + (tries * 500) + 'ms');
              } else if (tries === 12) {
                clearInterval(timer);
                if (window.__tandemReport) {
                  window.__tandemReport('stalled',
                    'no hydration after 6s; main=' + (root ? 'present' : 'missing') +
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
