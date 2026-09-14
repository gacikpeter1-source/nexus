/**
 * SMS/voice "urgent alert" for a team — calls the sendUrgentTeamAlert Cloud
 * Function, which resolves recipients (team members + trainers/assistants),
 * filters to those with a phone number and urgentAlertsOptIn === true, and
 * sends via Twilio (see functions/src/twilioAlerts.ts). Requires Twilio
 * credentials to be configured server-side — the Cloud Function throws a
 * failed-precondition error until then.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';

export interface UrgentAlertResult {
  smsSent: number;
  smsFailed: number;
  callsSent: number;
  callsFailed: number;
  skippedNoConsent: number;
}

interface UrgentAlertParams {
  clubId: string;
  teamId: string;
  message: string;
  sendSms: boolean;
  sendCall: boolean;
}

const sendUrgentTeamAlertFn = httpsCallable<UrgentAlertParams, UrgentAlertResult>(functions, 'sendUrgentTeamAlert');

export async function sendUrgentTeamAlert(params: UrgentAlertParams): Promise<UrgentAlertResult> {
  const result = await sendUrgentTeamAlertFn(params);
  return result.data;
}
