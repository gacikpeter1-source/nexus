"use strict";
/**
 * Twilio wrapper for the "urgent team alert" feature (SMS + voice call) —
 * see sendUrgentTeamAlert in index.ts for the callable that uses this.
 *
 * Credentials come from plain process.env vars (TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER), following this project's existing
 * convention for third-party credentials (see GMAIL_USER/GMAIL_APP_PASSWORD
 * for sendTournamentCreatedEmail): loaded from a project-specific,
 * git-ignored functions/.env.<project-id> file at deploy time, rather than
 * firebase-functions/params secrets (not used anywhere else in this repo).
 *
 * Deliberately isolated behind this one module — every caller in index.ts
 * talks only to sendAlertSms()/makeAlertCall() below, never to the Twilio
 * SDK directly, so swapping providers later (e.g. for a cheaper regional
 * SMS gateway once Twilio's reliability is confirmed and cost becomes the
 * concern) means rewriting only this file.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTwilioConfigured = isTwilioConfigured;
exports.sendAlertSms = sendAlertSms;
exports.makeAlertCall = makeAlertCall;
// This project's tsconfig doesn't set esModuleInterop, so a default import
// of a CommonJS module exported as a callable (twilio's export is a
// function) needs the `= require(...)` form instead of `import x from`.
const twilio = require("twilio");
function isTwilioConfigured() {
    return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}
function getClient() {
    return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}
async function sendAlertSms(to, body) {
    const client = getClient();
    await client.messages.create({
        to,
        from: process.env.TWILIO_FROM_NUMBER,
        body,
    });
}
// The call always speaks a fixed line rather than the alert's actual text —
// text-to-speech dictating an arbitrary trainer-written message is a worse
// experience (mispronunciation, no way to re-read it) than just directing
// the person to open the app, where the real message is already visible.
async function makeAlertCall(to, language) {
    const client = getClient();
    const message = language === 'sk'
        ? 'Máte urgentnú správu v aplikácii Nexus. Prosím, skontrolujte ju.'
        : 'You have an urgent message in your Nexus account. Please check the app.';
    const voice = language === 'sk' ? 'Polly.Vit' : 'Polly.Matthew';
    const twiml = `<Response><Say voice="${voice}" language="${language === 'sk' ? 'sk-SK' : 'en-US'}">${message}</Say></Response>`;
    await client.calls.create({
        to,
        from: process.env.TWILIO_FROM_NUMBER,
        twiml,
    });
}
//# sourceMappingURL=twilioAlerts.js.map