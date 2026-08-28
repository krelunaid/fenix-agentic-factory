const riskyIntents = new Set(['deploy_production', 'send_external', 'charge_payment', 'delete_data', 'change_domain']);

export function evaluateVoiceIntent(input: { intent: string; confidence: number; transcriptConfirmed: boolean }) {
  const ambiguous = !Number.isFinite(input.confidence) || input.confidence < 0.85;
  const risky = riskyIntents.has(input.intent);
  return { executable: !ambiguous && (!risky || input.transcriptConfirmed), requiresConfirmation: ambiguous || risky, fallbackToText: ambiguous };
}

export function normalizeVoiceLanguage(language: string) {
  if (language.startsWith('it')) return 'it' as const;
  if (language.startsWith('en')) return 'en' as const;
  throw new Error('unsupported_voice_language');
}
