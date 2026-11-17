import { describe, expect, it } from 'vitest';
import { mediaPromptText } from './media-prompt';

describe('mediaPromptText', () => {
  it('uses pt-BR for pt locales', () => {
    const t = mediaPromptText('pt-BR', 'Work', ['video', 'audio']);
    expect(t.message).toBe('Permitir que a conta "Work" use seu câmera e microfone?');
    expect(t.allow).toBe('Permitir');
  });
  it('defaults to en and handles empty types', () => {
    expect(mediaPromptText('fr', 'A', []).message).toBe(
      'Allow account "A" to use your camera or microphone?',
    );
  });
});
