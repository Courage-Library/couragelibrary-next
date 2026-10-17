// DEV-NET-1: preload (node --require) that turns on Node's happy-eyeballs address selection for this process only.
// Diagnostics / test processes only — never imported by the app.
const net = require('net');
if (typeof net.setDefaultAutoSelectFamily === 'function') net.setDefaultAutoSelectFamily(true);
if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout === 'function') net.setDefaultAutoSelectFamilyAttemptTimeout(500);
