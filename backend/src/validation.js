export const MAX_RECIPIENTS = 100;
export const STATUSES = ['sending', 'sent', 'partial', 'failed', 'previewed', 'interrupted'];
const emailPattern = /^[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateEmail(input) {
  const errors = {};
  const subject = typeof input?.subject === 'string' ? input.subject.trim() : '';
  const body = typeof input?.body === 'string' ? input.body.trim() : '';
  const source = Array.isArray(input?.recipients) ? input.recipients : [];
  const recipients = [
    ...new Set(
      source
        .filter((email) => typeof email === 'string')
        .map((email) => email.trim().toLowerCase()),
    ),
  ];
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject))
    errors.subject = 'Enter a subject of 1–200 characters without line breaks.';
  if (!body || body.length > 50000) errors.body = 'Enter a message of 1–50,000 characters.';
  if (
    !source.length ||
    source.length > MAX_RECIPIENTS ||
    source.some((email) => typeof email !== 'string') ||
    recipients.some((email) => email.length > 254 || !emailPattern.test(email))
  ) {
    errors.recipients = `Enter 1–${MAX_RECIPIENTS} valid email addresses.`;
  }
  if (typeof input?.requestId !== 'string' || !uuidPattern.test(input.requestId))
    errors.requestId = 'A valid request ID is required.';
  return { errors, data: { subject, body, recipients, requestId: input?.requestId } };
}
