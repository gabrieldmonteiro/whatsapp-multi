export interface MediaPromptText {
  title: string;
  message: string;
  detail: string;
  allow: string;
  deny: string;
}

const STRINGS = {
  en: {
    title: 'Permission request',
    audio: 'microphone',
    video: 'camera',
    fallback: 'camera or microphone',
    and: ' and ',
    message: (name: string, what: string) => `Allow account "${name}" to use your ${what}?`,
    detail: 'This applies only to this request and is not remembered.',
    allow: 'Allow',
    deny: 'Deny',
  },
  'pt-BR': {
    title: 'Pedido de permissão',
    audio: 'microfone',
    video: 'câmera',
    fallback: 'câmera ou microfone',
    and: ' e ',
    message: (name: string, what: string) => `Permitir que a conta "${name}" use seu ${what}?`,
    detail: 'Vale apenas para este pedido e não é lembrado.',
    allow: 'Permitir',
    deny: 'Negar',
  },
} as const;

/** Picks pt-BR for any pt locale, otherwise en. */
export function mediaPromptText(
  locale: string,
  accountName: string,
  types: readonly string[],
): MediaPromptText {
  const t = locale.toLowerCase().startsWith('pt') ? STRINGS['pt-BR'] : STRINGS.en;
  const names = types.flatMap((x) => (x === 'audio' ? [t.audio] : x === 'video' ? [t.video] : []));
  const what = names.length > 0 ? names.join(t.and) : t.fallback;
  return {
    title: t.title,
    message: t.message(accountName, what),
    detail: t.detail,
    allow: t.allow,
    deny: t.deny,
  };
}
